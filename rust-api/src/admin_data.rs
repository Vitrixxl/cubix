//! Administration data behind the admin session (see `admin::dispatch`): overview, persistent
//! request log, IPs, accounts, and the two account actions. Every timestamp is milliseconds since
//! the Unix epoch; every `day` is a UTC `YYYY-MM-DD`.
use crate::{
    AppState,
    accounts::{DAY_MS, digest, now},
    activity::{self, KINDS, ROW_COLUMNS},
    db::{all, one, required},
    error::{ApiError, Result},
    stats::EFFECTIVE_MS_SQL,
};
use rusqlite::{Connection, params, params_from_iter, types::Value as Sql};
use serde_json::{Value, json};
use std::collections::HashMap;

const UNKNOWN: &str = "Unknown account";
/// `/requests` counts its matching rows up to this many; beyond, `totalCapped` is set.
const COUNT_CAP: i64 = 10_000;

/// ISO-8601 text columns as milliseconds since the epoch.
fn ms(expr: &str) -> String {
    format!("CAST(round((julianday({expr})-2440587.5)*86400000) AS INTEGER)")
}
fn n(value: &Value, key: &str) -> i64 {
    value[key].as_i64().unwrap_or(0)
}
fn flags(rows: &mut [Value], keys: &[&str]) {
    for row in rows {
        for key in keys {
            row[*key] = json!(row[*key] == 1);
        }
    }
}

/// Validated query parameters: bounded in number and length, typed on access.
pub struct Query<'a>(&'a HashMap<String, String>);
impl<'a> Query<'a> {
    pub fn new(query: &'a HashMap<String, String>) -> Result<Self> {
        if query.len() > 16 || query.iter().any(|(k, v)| k.len() > 20 || v.len() > 100) {
            return Err(ApiError::validation());
        }
        Ok(Self(query))
    }
    fn text(&self, key: &str) -> Option<&'a str> {
        self.0.get(key).map(|v| v.trim()).filter(|v| !v.is_empty())
    }
    fn optional_int(&self, key: &str, min: i64, max: i64) -> Result<Option<i64>> {
        self.text(key)
            .map(|v| {
                v.parse::<i64>()
                    .ok()
                    .filter(|v| (min..=max).contains(v))
                    .ok_or_else(ApiError::validation)
            })
            .transpose()
    }
    fn int(&self, key: &str, default: i64, min: i64, max: i64) -> Result<i64> {
        Ok(self.optional_int(key, min, max)?.unwrap_or(default))
    }
    fn choice(
        &self,
        key: &str,
        allowed: &[&'static str],
        default: &'static str,
    ) -> Result<&'static str> {
        match self.text(key) {
            None => Ok(default),
            Some(v) => allowed
                .iter()
                .find(|a| **a == v)
                .copied()
                .ok_or_else(ApiError::validation),
        }
    }
    /// `page` from 0 and `limit` (1–200, 50 by default).
    fn page(&self) -> Result<(i64, i64)> {
        Ok((
            self.int("page", 0, 0, 100_000)?,
            self.int("limit", 50, 1, 200)?,
        ))
    }
    /// `desc` unless `order=asc`, or the given default.
    fn descending(&self, default: bool) -> Result<bool> {
        Ok(self.choice(
            "order",
            &["asc", "desc"],
            if default { "desc" } else { "asc" },
        )? == "desc")
    }
}

/// Account ids are UUIDs; older or imported ones stay short and plain.
pub fn user_id(value: &str) -> Result<String> {
    if (1..=64).contains(&value.len())
        && value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
    {
        Ok(value.to_owned())
    } else {
        Err(ApiError::new(404, UNKNOWN))
    }
}

pub async fn overview(state: &AppState) -> Result<Value> {
    state.traffic.log.settle().await;
    let live_ips = state.traffic.live_ips();
    let started = state.traffic.started;
    let dropped = state.traffic.log.dropped();
    let days = activity::last_days(30);
    let data = state
        .db
        .call(move |db| {
            let today = days[29].clone();
            let week = days[23].clone();
            let month = days[0].clone();
            let day_start = now().div_euclid(DAY_MS) * DAY_MS;
            // Counts since a moment are range counts, each served by an index.
            let count = |sql: &str, args: &[&dyn rusqlite::ToSql]| -> Result<i64> {
                Ok(n(&one(db, sql, args)?.unwrap_or_default(), "n"))
            };
            let users = one(db, "SELECT count(*) total,coalesce(sum(password_hash IS NOT NULL),0) registered,coalesce(sum(password_hash IS NULL),0) guests FROM users", [])?.unwrap_or_default();
            let new_users = |since: &str| count("SELECT count(*) n FROM users WHERE created_at>=?", &[&since]);
            let active = |since: &str| count("SELECT count(DISTINCT user_id) n FROM user_activity WHERE day>=?", &[&since]);
            let solves_since = |since: &str| count("SELECT count(*) n FROM solves WHERE created_at>=?", &[&since]);
            let solves = json!({"total": count("SELECT count(*) n FROM solves", &[])?, "today": solves_since(&today)?, "d7": solves_since(&week)?});
            let traffic = one(db, "SELECT coalesce(sum(requests),0) requests,coalesce(sum(errors),0) errors,coalesce(sum(server_errors),0) serverErrors,coalesce(sum(limited),0) limited,count(*) ips FROM traffic_daily WHERE day=?", [&today])?.unwrap_or_default();
            let ips = |since: &str| count("SELECT count(DISTINCT ip) n FROM traffic_daily WHERE day>=?", &[&since]);
            let duels_since = |since: i64| count("SELECT count(*) n FROM duel_games WHERE ended_at>=?", &[&since]);
            let duels = json!({"total": count("SELECT count(*) n FROM duel_games", &[])?, "today": duels_since(day_start)?, "d7": duels_since(day_start - 6 * DAY_MS)?});
            let mut series: Vec<Value> = days
                .iter()
                .map(|day| json!({"day":day,"requests":0,"ips":0,"errors":0,"serverErrors":0,"limited":0,"signups":0,"registrations":0,"active":0,"solves":0,"duels":0}))
                .collect();
            let index: HashMap<String, usize> = days.iter().cloned().enumerate().map(|(i, d)| (d, i)).collect();
            let mut merge = |rows: Vec<Value>| {
                for row in rows {
                    if let Some(&i) = row["day"].as_str().and_then(|d| index.get(d)) {
                        for (key, value) in row.as_object().unwrap() {
                            if key != "day" {
                                series[i][key] = value.clone();
                            }
                        }
                    }
                }
            };
            merge(all(db, "SELECT day,sum(requests) requests,count(*) ips,sum(errors) errors,sum(server_errors) serverErrors,sum(limited) limited FROM traffic_daily WHERE day>=? GROUP BY day", [&month])?);
            merge(all(db, "SELECT substr(created_at,1,10) day,count(*) signups,sum(password_hash IS NOT NULL) registrations FROM users WHERE created_at>=? GROUP BY 1", [&month])?);
            merge(all(db, "SELECT day,count(*) active FROM user_activity WHERE day>=? GROUP BY day", [&month])?);
            merge(all(db, "SELECT substr(created_at,1,10) day,count(*) solves FROM solves WHERE created_at>=? GROUP BY 1", [&month])?);
            merge(all(db, "SELECT date(ended_at/1000,'unixepoch') day,count(*) duels FROM duel_games WHERE ended_at>=? GROUP BY 1", [day_start - 29 * DAY_MS])?);
            let size = one(db, "SELECT (SELECT page_count FROM pragma_page_count())*(SELECT page_size FROM pragma_page_size()) bytes,(SELECT freelist_count FROM pragma_freelist_count())*(SELECT page_size FROM pragma_page_size()) free", [])?.unwrap_or_default();
            let log = one(db, "SELECT (SELECT count(*) FROM request_log) rows,(SELECT count(*) FROM request_log WHERE important=1) important,(SELECT min(at) FROM request_log) oldestAt", [])?.unwrap_or_default();
            Ok(json!({
                "users": {
                    "total": users["total"], "registered": users["registered"], "guests": users["guests"],
                    "new": {"today": new_users(&today)?, "d7": new_users(&week)?, "d30": new_users(&month)?},
                    "active": {"today": active(&today)?, "d7": active(&week)?, "d30": active(&month)?},
                },
                "solves": solves,
                "requests": {"today": traffic["requests"], "errorsToday": traffic["errors"], "serverErrorsToday": traffic["serverErrors"], "rateLimitedToday": traffic["limited"]},
                "ips": {"today": traffic["ips"], "d7": ips(&week)?, "d30": ips(&month)?},
                "duels": duels,
                "series": series,
                "db": {"bytes": size["bytes"], "freeBytes": size["free"], "logRows": log["rows"], "importantLogRows": log["important"], "oldestLogAt": log["oldestAt"]},
            }))
        })
        .await?;
    let mut data = data;
    data["ips"]["live"] = json!(live_ips);
    data["server"] = json!({
        "now": now(),
        "startedAt": started,
        "uptimeMs": now() - started,
        "version": env!("CARGO_PKG_VERSION"),
        "build": crate::release::build_number(),
        "commit": crate::release::commit(),
        "db": data["db"].take(),
        "log": {
            "retentionDays": activity::RETENTION_DAYS,
            "maxRows": activity::MAX_ROWS,
            "maxImportantRows": activity::MAX_IMPORTANT_ROWS,
            "trafficDays": activity::TRAFFIC_DAYS,
            "dropped": dropped,
        },
    });
    data.as_object_mut().unwrap().remove("db");
    Ok(data)
}

pub async fn requests(state: &AppState, query: &Query<'_>) -> Result<Value> {
    let (page, limit) = query.page()?;
    let mut clauses: Vec<String> = Vec::new();
    let mut args: Vec<Sql> = Vec::new();
    if let Some(flag) = query.text("important") {
        clauses.push("l.important=?".into());
        args.push(Sql::Integer(match flag {
            "1" | "true" => 1,
            "0" | "false" => 0,
            _ => return Err(ApiError::validation()),
        }));
    }
    if let Some(kind) = query.text("kind") {
        let kind = KINDS
            .iter()
            .find(|k| **k == kind)
            .ok_or_else(ApiError::validation)?;
        clauses.push("l.kind=?".into());
        args.push(Sql::Text((*kind).into()));
    }
    if let Some(status) = query.text("status") {
        let bytes = status.as_bytes();
        if status == "error" {
            clauses.push("l.status>=400".into());
        } else if bytes.len() == 3 && (b'1'..=b'5').contains(&bytes[0]) && &status[1..] == "xx" {
            let base = i64::from(bytes[0] - b'0') * 100;
            clauses.push("l.status BETWEEN ? AND ?".into());
            args.extend([Sql::Integer(base), Sql::Integer(base + 99)]);
        } else {
            let code = status
                .parse::<i64>()
                .ok()
                .filter(|c| (100..=599).contains(c))
                .ok_or_else(ApiError::validation)?;
            clauses.push("l.status=?".into());
            args.push(Sql::Integer(code));
        }
    }
    if let Some(method) = query.text("method") {
        if method.len() > 10 || !method.bytes().all(|b| b.is_ascii_alphabetic()) {
            return Err(ApiError::validation());
        }
        clauses.push("l.method=?".into());
        args.push(Sql::Text(method.to_ascii_uppercase()));
    }
    for (key, column) in [("ip", "l.ip"), ("path", "l.path")] {
        if let Some(value) = query.text(key) {
            clauses.push(format!("instr({column},?)>0"));
            args.push(Sql::Text(value.into()));
        }
    }
    if let Some(user) = query.text("user") {
        clauses.push(
            "(l.user_id=?1 OR l.user_id=(SELECT id FROM users WHERE username=?1 COLLATE NOCASE))"
                .replace("?1", "?"),
        );
        args.extend([Sql::Text(user.into()), Sql::Text(user.into())]);
    }
    for (key, clause) in [("from", "l.at>=?"), ("to", "l.at<?"), ("before", "l.id<?")] {
        if let Some(value) = query.optional_int(key, 0, i64::MAX / 2)? {
            clauses.push(clause.into());
            args.push(Sql::Integer(value));
        }
    }
    let filter = if clauses.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", clauses.join(" AND "))
    };
    state.traffic.log.settle().await;
    state
        .db
        .call(move |db| {
            // Counting stops past the cap: a broad filter over the whole log stays cheap.
            let mut count_args = args.clone();
            count_args.push(Sql::Integer(COUNT_CAP + 1));
            let total = n(&one(db, &format!("SELECT count(*) n FROM (SELECT 1 FROM request_log l {filter} LIMIT ?)"), params_from_iter(count_args.iter()))?.unwrap_or_default(), "n");
            let mut rows_args = args;
            rows_args.extend([Sql::Integer(limit), Sql::Integer(page * limit)]);
            let rows: Vec<_> = all(
                db,
                &format!("SELECT {ROW_COLUMNS} FROM request_log l LEFT JOIN users u ON u.id=l.user_id {filter} ORDER BY l.id DESC LIMIT ? OFFSET ?"),
                params_from_iter(rows_args.iter()),
            )?
            .into_iter()
            .map(activity::row)
            .collect();
            Ok(json!({"rows":rows,"total":total.min(COUNT_CAP),"totalCapped":total>COUNT_CAP,"page":page,"limit":limit,"kinds":KINDS}))
        })
        .await
}

pub async fn ips(state: &AppState, query: &Query<'_>) -> Result<Value> {
    let (page, limit) = query.page()?;
    let days = query.int("days", 7, 1, activity::TRAFFIC_DAYS)?;
    let sort = query.choice(
        "sort",
        &[
            "requests",
            "errors",
            "serverErrors",
            "limited",
            "lastSeen",
            "firstSeen",
            "ip",
            "users",
        ],
        "requests",
    )?;
    let descending = query.descending(sort != "ip")?;
    let column = match sort {
        "lastSeen" => "lastSeenAt",
        "firstSeen" => "firstSeenAt",
        "users" => "userCount",
        other => other,
    };
    let order = format!("{column} {},ip", if descending { "DESC" } else { "ASC" });
    let q = query.text("q").unwrap_or("").to_owned();
    let user = query.text("user").map(str::to_owned);
    state.traffic.log.settle().await;
    state
        .db
        .call(move |db| {
            let since = activity::day(now() - (days - 1) * DAY_MS);
            let scope = "day>=?1 AND instr(ip,?2)>0 AND (?3 IS NULL OR ip IN (SELECT ip FROM traffic_daily_users WHERE day>=?1 AND user_id IN (SELECT id FROM users WHERE id=?3 OR username=?3 COLLATE NOCASE)))";
            let totals = one(db, &format!("SELECT count(DISTINCT ip) ips,coalesce(sum(requests),0) requests,coalesce(sum(errors),0) errors,coalesce(sum(limited),0) limited FROM traffic_daily WHERE {scope}"), params![since, q, user])?.unwrap_or_default();
            let mut rows = all(db, &format!("SELECT t.*,coalesce(c.userCount,0) userCount FROM
                (SELECT ip,sum(requests) requests,sum(errors) errors,sum(server_errors) serverErrors,sum(limited) limited,min(first_at) firstSeenAt,max(last_at) lastSeenAt,count(*) activeDays
                 FROM traffic_daily WHERE {scope} GROUP BY ip) t
                LEFT JOIN (SELECT ip,count(DISTINCT user_id) userCount FROM traffic_daily_users WHERE day>=?1 GROUP BY ip) c USING(ip)
                ORDER BY {order} LIMIT ?4 OFFSET ?5"), params![since, q, user, limit, page * limit])?;
            // The accounts seen from the page's IPs, at most 20 each, in one query.
            let mut users: HashMap<String, Vec<Value>> = HashMap::new();
            if !rows.is_empty() {
                let mut args = vec![Sql::Text(since.clone())];
                args.extend(rows.iter().map(|r| Sql::Text(r["ip"].as_str().unwrap_or("").to_owned())));
                let marks = vec!["?"; rows.len()].join(",");
                let mut seen = all(db, &format!("SELECT ip,id,username,isGuest FROM (SELECT t.ip,u.id,u.username,(u.password_hash IS NULL) isGuest,
                    row_number() OVER (PARTITION BY t.ip ORDER BY u.password_hash IS NULL,u.username) n
                    FROM (SELECT DISTINCT ip,user_id FROM traffic_daily_users WHERE day>=?1 AND ip IN ({marks})) t JOIN users u ON u.id=t.user_id)
                    WHERE n<=20 ORDER BY ip,n"), params_from_iter(args.iter()))?;
                flags(&mut seen, &["isGuest"]);
                for mut user in seen {
                    let ip = user.as_object_mut().unwrap().remove("ip");
                    users.entry(ip.and_then(|ip| ip.as_str().map(str::to_owned)).unwrap_or_default()).or_default().push(user);
                }
            }
            for row in &mut rows {
                row["users"] = json!(users.remove(row["ip"].as_str().unwrap_or("")).unwrap_or_default());
            }
            Ok(json!({"days":days,"since":since,"rows":rows,"total":totals["ips"],"totals":totals,"page":page,"limit":limit}))
        })
        .await
}

/// The `solves.created_at` of seven days ago.
const WEEK_AGO: &str = "strftime('%Y-%m-%dT%H:%M:%fZ','now','-7 days')";

/// One account row, as listed and in its detail. `filter` follows `FROM users u`.
fn user_rows(db: &Connection, filter: &str, order: &str, args: &[Sql]) -> Result<Vec<Value>> {
    let sql = format!(
        "SELECT u.id,u.username,(u.password_hash IS NULL) isGuest,{created} createdAt,u.last_seen_at lastSeenAt,
          (SELECT count(*) FROM solves s WHERE s.user_id=u.id) solves,
          (SELECT count(*) FROM solves s WHERE s.user_id=u.id AND s.created_at>={WEEK_AGO}) solves7d,
          (SELECT count(*) FROM learned_cases l WHERE l.user_id=u.id AND l.learned=1) learnedCases,
          (SELECT count(*) FROM duel_games d WHERE d.player1_id=u.id)+(SELECT count(*) FROM duel_games d WHERE d.player2_id=u.id) duels,
          (SELECT count(*) FROM auth_tokens t WHERE t.user_id=u.id AND t.expires_at>{now}) activeSessions,
          {last_solve} lastSolveAt
        FROM users u {filter} ORDER BY {order}",
        created = ms("u.created_at"),
        last_solve = ms("(SELECT max(s.created_at) FROM solves s WHERE s.user_id=u.id)"),
        now = now(),
    );
    let mut rows = all(db, &sql, params_from_iter(args.iter()))?;
    flags(&mut rows, &["isGuest"]);
    Ok(rows)
}

pub async fn users(state: &AppState, query: &Query<'_>) -> Result<Value> {
    let (page, limit) = query.page()?;
    let filter = query.choice("filter", &["all", "registered", "guests"], "all")?;
    let sort = query.choice(
        "sort",
        &["created", "lastSeen", "solves", "solves7d", "username"],
        "created",
    )?;
    let descending = query.descending(sort != "username")?;
    let q = query.text("q").unwrap_or("").to_lowercase();
    let direction = if descending { "DESC" } else { "ASC" };
    let order = match sort {
        "lastSeen" => format!("u.last_seen_at IS NULL,u.last_seen_at {direction},u.id"),
        "solves" => format!("solves {direction},u.created_at DESC,u.id"),
        "solves7d" => format!("solves7d {direction},lastSolveAt DESC,u.id"),
        "username" => format!("u.username COLLATE NOCASE {direction},u.id"),
        _ => format!("u.created_at {direction},u.id"),
    };
    let kind = match filter {
        "registered" => "u.password_hash IS NOT NULL",
        "guests" => "u.password_hash IS NULL",
        _ => "1",
    };
    state.traffic.log.settle().await;
    state
        .db
        .call(move |db| {
            let counts = one(db, "SELECT count(*) \"all\",coalesce(sum(password_hash IS NOT NULL),0) registered,coalesce(sum(password_hash IS NULL),0) guests FROM users", [])?.unwrap_or_default();
            let scope = format!("WHERE {kind} AND (?='' OR instr(lower(u.username),?)>0 OR u.id=?)");
            let search = [Sql::Text(q.clone()), Sql::Text(q.clone()), Sql::Text(q.clone())];
            let mut args = search.to_vec();
            args.extend([Sql::Integer(limit), Sql::Integer(page * limit)]);
            let (total, rows) = if sort == "solves7d" {
                // Only the accounts that solved this week, ranked through the solves index: the
                // per-account counts are computed for the page alone.
                let recent = format!("SELECT s.user_id FROM solves s JOIN users u ON u.id=s.user_id {scope} AND s.created_at>={WEEK_AGO} GROUP BY s.user_id");
                let total = one(db, &format!("SELECT count(*) n FROM ({recent})"), params_from_iter(search.iter()))?.unwrap_or_default();
                let page = format!("JOIN ({recent} ORDER BY count(*) {direction},max(s.created_at) DESC LIMIT ? OFFSET ?) r ON r.user_id=u.id");
                (total, user_rows(db, &page, &order, &args)?)
            } else {
                let total = one(db, &format!("SELECT count(*) n FROM users u {scope}"), params_from_iter(search.iter()))?.unwrap_or_default();
                (total, user_rows(db, &scope, &format!("{order} LIMIT ? OFFSET ?"), &args)?)
            };
            Ok(json!({"counts":counts,"total":total["n"],"rows":rows,"page":page,"limit":limit}))
        })
        .await
}

pub async fn user(state: &AppState, id: String) -> Result<Value> {
    state.traffic.log.settle().await;
    state
        .db
        .call(move |db| {
            let mut user = user_rows(db, "WHERE u.id=?", "u.id", &[Sql::Text(id.clone())])?
                .into_iter()
                .next()
                .ok_or_else(|| ApiError::new(404, UNKNOWN))?;
            let effective = EFFECTIVE_MS_SQL;
            let puzzles = all(db, &format!("SELECT puzzle_id puzzleId,solve_mode solveMode,count(*) solves,sum(penalty='dnf') dnf,sum(case_id IS NOT NULL) trainingSolves,
                min({effective}) bestMs,avg({effective}) meanMs,{last} lastAt FROM solves WHERE user_id=? GROUP BY puzzle_id,solve_mode ORDER BY solves DESC,puzzle_id",
                last = ms("max(created_at)")), [&id])?;
            let days = activity::last_days(90);
            let mut series: Vec<Value> = days.iter().map(|d| json!({"day":d,"requests":0,"active":false,"solves":0})).collect();
            let index: HashMap<&str, usize> = days.iter().enumerate().map(|(i, d)| (d.as_str(), i)).collect();
            for row in all(db, "SELECT day,requests FROM user_activity WHERE user_id=? AND day>=?", params![id, days[0]])? {
                if let Some(&i) = row["day"].as_str().and_then(|d| index.get(d)) {
                    series[i]["requests"] = row["requests"].clone();
                    series[i]["active"] = json!(true);
                }
            }
            for row in all(db, "SELECT substr(created_at,1,10) day,count(*) solves FROM solves WHERE user_id=? AND created_at>=? GROUP BY 1", params![id, days[0]])? {
                if let Some(&i) = row["day"].as_str().and_then(|d| index.get(d)) {
                    series[i]["solves"] = row["solves"].clone();
                }
            }
            let recent_solves = all(db, &format!("SELECT id,{at} at,time_ms timeMs,penalty,{effective} effectiveMs,puzzle_id puzzleId,solve_mode solveMode,scramble_type scrambleType,case_id caseId
                FROM solves WHERE user_id=? ORDER BY created_at DESC,id DESC LIMIT 20", at = ms("created_at")), [&id])?;
            let recent_requests: Vec<_> = all(db, &format!("SELECT {ROW_COLUMNS} FROM request_log l LEFT JOIN users u ON u.id=l.user_id WHERE l.user_id=? ORDER BY l.id DESC LIMIT 20"), [&id])?
                .into_iter().map(activity::row).collect();
            // Tokens themselves are never shown; a hash of their digest identifies each session.
            let sessions: Vec<_> = all(db, "SELECT token_hash,coalesce(created_at,expires_at-2592000000) createdAt,last_used_at lastUsedAt,expires_at expiresAt FROM auth_tokens WHERE user_id=? AND expires_at>? ORDER BY createdAt DESC", params![id, now()])?
                .into_iter()
                .map(|mut s| {
                    let key = digest(s["token_hash"].as_str().unwrap_or(""))[..12].to_owned();
                    let object = s.as_object_mut().unwrap();
                    object.remove("token_hash");
                    object.insert("id".into(), json!(key));
                    s
                })
                .collect();
            let duel_summary = one(db, "SELECT count(*) played,coalesce(sum((player1_id=?1 AND winner=0) OR (player2_id=?1 AND winner=1)),0) won,
                coalesce(sum((player1_id=?1 AND winner=1) OR (player2_id=?1 AND winner=0)),0) lost,coalesce(sum(winner IS NULL),0) drawn
                FROM duel_games WHERE player1_id=?1 OR player2_id=?1", [&id])?.unwrap_or_default();
            let recent_duels = all(db, "SELECT id,ended_at endedAt,event,
                CASE WHEN player1_id=?1 THEN player2_name ELSE player1_name END opponent,
                CASE WHEN player1_id=?1 THEN player2_id ELSE player1_id END opponentId,
                CASE WHEN player1_id=?1 THEN player1_ao5 ELSE player2_ao5 END ao5,
                CASE WHEN player1_id=?1 THEN player2_ao5 ELSE player1_ao5 END opponentAo5,
                CASE WHEN winner IS NULL THEN 'draw' WHEN (winner=0)=(player1_id=?1) THEN 'win' ELSE 'loss' END result
                FROM duel_games WHERE player1_id=?1 OR player2_id=?1 ORDER BY ended_at DESC,id DESC LIMIT 10", [&id])?;
            let ips = all(db, "SELECT ip,count(*) days,max(day) lastDay FROM traffic_daily_users WHERE user_id=? GROUP BY ip ORDER BY lastDay DESC,days DESC LIMIT 20", [&id])?;
            let practice = one(db, "SELECT count(*) n FROM sessions WHERE user_id=?", [&id])?.unwrap_or_default();
            user["practiceSessions"] = practice["n"].clone();
            // Whether the account coaches (see coaching.rs): listed, or turned off by the administration.
            user["coach"] = match one(db, "SELECT active FROM coaches WHERE user_id=?", [&id])? {
                Some(row) => json!(if row["active"] == 1 { "active" } else { "disabled" }),
                None => Value::Null,
            };
            Ok(json!({
                "user": user,
                "puzzles": puzzles,
                "activity": series,
                "recentSolves": recent_solves,
                "recentRequests": recent_requests,
                "sessions": sessions,
                "duels": {"played": duel_summary["played"], "won": duel_summary["won"], "lost": duel_summary["lost"], "drawn": duel_summary["drawn"], "recent": recent_duels},
                "ips": ips,
            }))
        })
        .await
}

/// Signs the account out everywhere; its open live sockets close on their next check.
pub async fn revoke(state: &AppState, id: String) -> Result<Value> {
    let user = id.clone();
    let revoked = state
        .db
        .call(move |db| {
            required(db, "SELECT id FROM users WHERE id=?", [&user], UNKNOWN)?;
            Ok(db.execute("DELETE FROM auth_tokens WHERE user_id=?", [&user])?)
        })
        .await?;
    state.hub.notify_sync(&id, 0);
    Ok(json!({"ok":true,"revoked":revoked}))
}

/// Removes an account and everything it owns, inside the caller's transaction: its solves and sessions (counted),
/// then the rest. Finished duels stay for the opponent under the name `deleted`; request log rows lose the account
/// id, except the audit rows of administrator actions on it.
pub fn purge(tx: &Connection, user: &str) -> Result<(usize, usize)> {
    let solves = tx.execute("DELETE FROM solves WHERE user_id=?", [user])?;
    let sessions = tx.execute("DELETE FROM sessions WHERE user_id=?", [user])?;
    for sql in [
        "DELETE FROM learned_cases WHERE user_id=?",
        "DELETE FROM learning_group_orders WHERE user_id=?",
        "DELETE FROM personal_entries WHERE user_id=?",
        "DELETE FROM sync_receipts WHERE user_id=?",
        // Last: the deletions above journal their changes here.
        "DELETE FROM sync_changes WHERE user_id=?",
        "DELETE FROM auth_tokens WHERE user_id=?",
        "DELETE FROM user_activity WHERE user_id=?",
        "DELETE FROM traffic_daily_users WHERE user_id=?",
        "UPDATE duel_games SET player1_id=NULL,player1_name='deleted' WHERE player1_id=?",
        "UPDATE duel_games SET player2_id=NULL,player2_name='deleted' WHERE player2_id=?",
        "UPDATE request_log SET user_id=NULL WHERE user_id=? AND kind NOT IN ('admin','account')",
        "DELETE FROM users WHERE id=?",
    ] {
        tx.execute(sql, [user])?;
    }
    Ok((solves, sessions))
}

/// Guest accounts were retired: those left (no password) go with everything they own, at startup.
pub fn purge_guests(db: &mut Connection) -> Result<usize> {
    let tx = db.transaction()?;
    let guests: Vec<String> = all(&tx, "SELECT id FROM users WHERE password_hash IS NULL", [])?
        .into_iter()
        .filter_map(|row| row["id"].as_str().map(str::to_owned))
        .collect();
    for id in &guests {
        purge(&tx, id)?;
    }
    tx.commit()?;
    Ok(guests.len())
}

/// Deletes the account and everything it owns in one transaction (see `purge`).
pub async fn delete(state: &AppState, id: String) -> Result<Value> {
    // Requests already answered are stored first, so none re-adds the account's id afterwards.
    state.traffic.log.flush().await;
    let user = id.clone();
    let deleted = state
        .db
        .call(move |db| {
            let tx = db.transaction()?;
            let account = required(&tx, "SELECT username FROM users WHERE id=?", [&user], UNKNOWN)?;
            let (solves, sessions) = purge(&tx, &user)?;
            tx.commit()?;
            Ok(json!({"ok":true,"username":account["username"],"solves":solves,"sessions":sessions}))
        })
        .await?;
    state.hub.notify_sync(&id, 0);
    Ok(deleted)
}
