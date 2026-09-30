//! Durable administration data: the persistent request log, daily traffic per IP, daily activity
//! per account, `last_seen_at`, token use and finished duels.
//!
//! Requests never wait for SQLite: the traffic middleware hands a small record to a bounded
//! channel, and one writer task stores the records in batches (at most a second old, or 2 000 at
//! a time) through the database thread. Only the method, the path without its query string, the
//! status, the duration, the client IP, a truncated user agent and the account id are kept:
//! never headers, tokens, query strings or bodies.
use crate::{
    accounts::{digest, now},
    db::{Db, all, one},
    error::Result,
};
use rusqlite::{Connection, params};
use serde_json::{Value, json};
use std::{
    collections::{HashMap, HashSet},
    net::IpAddr,
    sync::{
        Arc,
        atomic::{AtomicU64, Ordering},
    },
    time::Duration,
};
use tokio::sync::{broadcast, mpsc, oneshot};

const DAY_MS: i64 = 86_400_000;
/// Rows of the request log older than this are deleted.
pub const RETENTION_DAYS: i64 = 30;
/// The log keeps at most this many ordinary rows and this many important rows.
pub const MAX_ROWS: i64 = 200_000;
pub const MAX_IMPORTANT_ROWS: i64 = 50_000;
/// Daily per-IP aggregates (and the accounts seen from each IP) are kept this long.
pub const TRAFFIC_DAYS: i64 = 90;
/// Daily per-account activity is kept this long.
pub const ACTIVITY_DAYS: i64 = 400;
/// `last_seen_at` and a token's `last_used_at` are written at most once a minute.
const SEEN_EVERY_MS: i64 = 60_000;
const BATCH: usize = 2000;
const QUEUE: usize = 20_000;

/// Every kind a request can be classified as, the important ones first.
pub const KINDS: [&str; 15] = [
    "rate-limit",
    "server-error",
    "auth",
    "admin",
    "account",
    "duel",
    "release",
    "client-error",
    "not-found",
    "sync",
    "live",
    "mobile",
    "api",
    "page",
    "asset",
];

pub fn migrate(db: &Connection) -> Result<()> {
    db.execute_batch(
        "CREATE TABLE IF NOT EXISTS request_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, ip TEXT NOT NULL,
          method TEXT NOT NULL, path TEXT NOT NULL, status INTEGER NOT NULL, duration_ms REAL NOT NULL,
          user_id TEXT, user_agent TEXT, kind TEXT NOT NULL, important INTEGER NOT NULL DEFAULT 0);
        CREATE INDEX IF NOT EXISTS idx_request_log_at ON request_log(at);
        CREATE INDEX IF NOT EXISTS idx_request_log_important ON request_log(important,id);
        CREATE INDEX IF NOT EXISTS idx_request_log_user ON request_log(user_id,id);
        CREATE INDEX IF NOT EXISTS idx_request_log_kind ON request_log(kind,id);
        CREATE TABLE IF NOT EXISTS traffic_daily (
          day TEXT NOT NULL, ip TEXT NOT NULL, requests INTEGER NOT NULL DEFAULT 0,
          errors INTEGER NOT NULL DEFAULT 0, server_errors INTEGER NOT NULL DEFAULT 0,
          limited INTEGER NOT NULL DEFAULT 0, first_at INTEGER NOT NULL, last_at INTEGER NOT NULL,
          PRIMARY KEY(day,ip)) WITHOUT ROWID;
        CREATE TABLE IF NOT EXISTS traffic_daily_users (
          day TEXT NOT NULL, ip TEXT NOT NULL, user_id TEXT NOT NULL,
          PRIMARY KEY(day,ip,user_id)) WITHOUT ROWID;
        CREATE INDEX IF NOT EXISTS idx_traffic_daily_users_user ON traffic_daily_users(user_id);
        CREATE TABLE IF NOT EXISTS user_activity (
          user_id TEXT NOT NULL, day TEXT NOT NULL, requests INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY(user_id,day)) WITHOUT ROWID;
        CREATE INDEX IF NOT EXISTS idx_user_activity_day ON user_activity(day);
        CREATE TABLE IF NOT EXISTS duel_games (
          id INTEGER PRIMARY KEY AUTOINCREMENT, race TEXT NOT NULL, game INTEGER NOT NULL,
          event TEXT NOT NULL, ended_at INTEGER NOT NULL,
          player1_id TEXT, player1_name TEXT NOT NULL, player1_ao5 REAL,
          player2_id TEXT, player2_name TEXT NOT NULL, player2_ao5 REAL,
          winner INTEGER, results TEXT NOT NULL, UNIQUE(race,game));
        CREATE INDEX IF NOT EXISTS idx_duel_games_ended ON duel_games(ended_at);
        CREATE INDEX IF NOT EXISTS idx_duel_games_player1 ON duel_games(player1_id);
        CREATE INDEX IF NOT EXISTS idx_duel_games_player2 ON duel_games(player2_id);
        CREATE INDEX IF NOT EXISTS idx_solves_created ON solves(created_at);",
    )?;
    let columns = |table: &str| -> Result<Vec<String>> {
        Ok(all(db, &format!("PRAGMA table_info({table})"), [])?
            .iter()
            .filter_map(|c| c["name"].as_str().map(str::to_owned))
            .collect())
    };
    if !columns("users")?.iter().any(|c| c == "last_seen_at") {
        db.execute_batch("ALTER TABLE users ADD COLUMN last_seen_at INTEGER")?;
    }
    let tokens = columns("auth_tokens")?;
    for column in ["created_at", "last_used_at"] {
        if !tokens.iter().any(|c| c == column) {
            db.execute_batch(&format!(
                "ALTER TABLE auth_tokens ADD COLUMN {column} INTEGER"
            ))?;
        }
    }
    Ok(())
}

/// Who a response concerns, set by handlers as a response extension. `seen` marks the account's
/// own activity (it updates `last_seen_at` and the daily activity); an administrator acting on an
/// account sets `seen: false`. `token` is the SHA-256 of the bearer token, kept in memory only to
/// update that session's `last_used_at`.
#[derive(Clone)]
pub struct Actor {
    pub user: String,
    pub token: Option<String>,
    pub seen: bool,
}

pub struct Entry {
    pub at: i64,
    pub ip: IpAddr,
    pub method: String,
    pub path: String,
    pub status: u16,
    pub ms: f64,
    pub agent: Option<String>,
    pub actor: Option<Actor>,
}

pub struct Player {
    pub user: Option<String>,
    pub name: String,
    pub results: Value,
    pub ao5: Option<f64>,
}
pub struct Game {
    pub race: String,
    pub game: u32,
    pub event: String,
    pub players: [Player; 2],
    /// The winning seat; `None` for a draw.
    pub winner: Option<usize>,
}

enum Event {
    Request(Entry),
    Seen(String),
    Duel(Game),
    Flush(oneshot::Sender<()>),
}

#[derive(Clone)]
pub struct Log {
    tx: mpsc::Sender<Event>,
    important: broadcast::Sender<Value>,
    dropped: Arc<AtomicU64>,
}

/// The route category of a request and whether the administration should see it among the
/// important events; `store` is false for successful static files, which are only counted.
pub fn classify(method: &str, path: &str, status: u16) -> (&'static str, bool, bool) {
    let api = path == "/api" || path.starts_with("/api/");
    let admin = path.starts_with("/api/admin/");
    let account_deletion = method == "DELETE"
        && (path == "/api/auth/me"
            || path == "/api/account"
            || (admin && path.starts_with("/api/admin/users/") && path.matches('/').count() == 4));
    let file = path
        .rsplit('/')
        .next()
        .is_some_and(|name| name.contains('.') && !name.ends_with(".html"));
    let kind = if status == 429 {
        "rate-limit"
    } else if status >= 500 {
        "server-error"
    } else if account_deletion {
        "account"
    } else if path.starts_with("/api/auth/") && !(method == "GET" && path == "/api/auth/me") {
        "auth"
    } else if admin {
        "admin"
    } else if path == "/api/duel" {
        "duel"
    } else if path.starts_with("/api/mobile/") && method != "GET" && method != "HEAD" {
        "release"
    } else if !api && status == 404 {
        "not-found"
    } else if (400..500).contains(&status) {
        "client-error"
    } else if path == "/api/sync" {
        "sync"
    } else if path == "/api/live" {
        "live"
    } else if path.starts_with("/api/mobile/") {
        "mobile"
    } else if api {
        "api"
    } else if file {
        "asset"
    } else {
        "page"
    };
    let important = match kind {
        "rate-limit" | "server-error" | "account" | "auth" | "duel" | "release"
        | "client-error" => true,
        "admin" => method != "GET" || status >= 400,
        _ => false,
    };
    (kind, important, kind != "asset" || status >= 400)
}

/// `YYYY-MM-DD` of a UTC millisecond timestamp.
pub fn day(ms: i64) -> String {
    // Howard Hinnant's civil_from_days.
    let z = ms.div_euclid(DAY_MS) + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400 + i64::from(m <= 2);
    format!("{y:04}-{m:02}-{d:02}")
}
/// The UTC days from `days - 1` days ago to today, oldest first.
pub fn last_days(days: i64) -> Vec<String> {
    let today = now();
    (0..days).rev().map(|i| day(today - i * DAY_MS)).collect()
}

impl Log {
    pub fn new(db: Db) -> Self {
        let (tx, rx) = mpsc::channel(QUEUE);
        let important = broadcast::channel(256).0;
        tokio::spawn(writer(db, rx, important.clone()));
        Self {
            tx,
            important,
            dropped: Arc::new(AtomicU64::new(0)),
        }
    }
    fn send(&self, event: Event) {
        if self.tx.try_send(event).is_err() {
            self.dropped.fetch_add(1, Ordering::Relaxed);
        }
    }
    pub fn request(&self, entry: Entry) {
        self.send(Event::Request(entry));
    }
    /// An account is active without an HTTP request, on a live socket.
    pub fn seen(&self, user: String) {
        self.send(Event::Seen(user));
    }
    pub fn duel(&self, game: Game) {
        self.send(Event::Duel(game));
    }
    /// Records dropped because the queue was full (a flood faster than SQLite).
    pub fn dropped(&self) -> u64 {
        self.dropped.load(Ordering::Relaxed)
    }
    /// Newly stored important requests, as the administration lists them.
    pub fn subscribe(&self) -> broadcast::Receiver<Value> {
        self.important.subscribe()
    }
    /// Waits until everything recorded so far is in the database.
    pub async fn flush(&self) {
        let (tx, rx) = oneshot::channel();
        if self.tx.send(Event::Flush(tx)).await.is_ok() {
            let _ = tokio::time::timeout(Duration::from_secs(5), rx).await;
        }
    }
}

#[derive(Default)]
struct Traffic {
    requests: i64,
    errors: i64,
    server_errors: i64,
    limited: i64,
    first: i64,
    last: i64,
}
struct Row {
    entry: Entry,
    kind: &'static str,
    important: bool,
}
#[derive(Default)]
struct Batch {
    rows: Vec<Row>,
    traffic: HashMap<(String, String), Traffic>,
    ip_users: HashSet<(String, String, String)>,
    activity: HashMap<(String, String), i64>,
    seen: Vec<(String, i64)>,
    used: Vec<(String, i64)>,
    games: Vec<Game>,
    events: usize,
}
impl Batch {
    fn is_empty(&self) -> bool {
        self.events == 0
    }
}

/// Throttles per-key writes to once a minute, with a bounded memory.
#[derive(Default)]
struct Throttle(HashMap<String, i64>);
impl Throttle {
    fn due(&mut self, key: &str, at: i64) -> bool {
        if self
            .0
            .get(key)
            .is_some_and(|last| at - last < SEEN_EVERY_MS)
        {
            return false;
        }
        if self.0.len() >= 50_000 {
            self.0.retain(|_, last| at - *last < SEEN_EVERY_MS);
        }
        self.0.insert(key.to_owned(), at);
        true
    }
}

fn add(batch: &mut Batch, event: Event, seen: &mut Throttle, used: &mut Throttle) {
    batch.events += 1;
    match event {
        Event::Request(entry) => {
            let (kind, important, store) = classify(&entry.method, &entry.path, entry.status);
            let today = day(entry.at);
            let ip = entry.ip.to_string();
            let t = batch
                .traffic
                .entry((today.clone(), ip.clone()))
                .or_insert_with(|| Traffic {
                    first: entry.at,
                    ..Default::default()
                });
            t.requests += 1;
            t.errors += i64::from(entry.status >= 400);
            t.server_errors += i64::from(entry.status >= 500);
            t.limited += i64::from(entry.status == 429);
            t.first = t.first.min(entry.at);
            t.last = t.last.max(entry.at);
            if let Some(actor) = entry.actor.as_ref().filter(|a| a.seen) {
                batch
                    .ip_users
                    .insert((today.clone(), ip, actor.user.clone()));
                *batch
                    .activity
                    .entry((actor.user.clone(), today))
                    .or_default() += 1;
                if seen.due(&actor.user, entry.at) {
                    batch.seen.push((actor.user.clone(), entry.at));
                }
                if let Some(token) = &actor.token
                    && used.due(token, entry.at)
                {
                    batch.used.push((token.clone(), entry.at));
                }
            }
            if store {
                batch.rows.push(Row {
                    entry,
                    kind,
                    important,
                });
            }
        }
        Event::Seen(user) => {
            let at = now();
            if seen.due(&user, at) {
                batch.activity.entry((user.clone(), day(at))).or_default();
                batch.seen.push((user, at));
            }
        }
        Event::Duel(game) => batch.games.push(game),
        Event::Flush(_) => unreachable!(),
    }
}

/// A request log row as the administration receives it.
pub const ROW_COLUMNS: &str = "l.id,l.at,l.ip,l.method,l.path,l.status,l.duration_ms AS durationMs,l.user_id AS userId,u.username,l.user_agent AS userAgent,l.kind,l.important";
pub fn row(mut value: Value) -> Value {
    value["important"] = json!(value["important"] == 1);
    value
}

fn write(db: &mut Connection, batch: Batch) -> Result<Vec<Value>> {
    let tx = db.transaction()?;
    let mut important = Vec::new();
    {
        let mut insert = tx.prepare_cached("INSERT INTO request_log(at,ip,method,path,status,duration_ms,user_id,user_agent,kind,important) VALUES(?,?,?,?,?,?,?,?,?,?)")?;
        for Row {
            entry,
            kind,
            important: flag,
        } in &batch.rows
        {
            insert.execute(params![
                entry.at,
                entry.ip.to_string(),
                entry.method,
                entry.path,
                entry.status,
                (entry.ms * 100.).round() / 100.,
                entry.actor.as_ref().map(|a| a.user.as_str()),
                entry.agent,
                kind,
                flag
            ])?;
            if *flag {
                important.push(tx.last_insert_rowid());
            }
        }
        let mut traffic = tx.prepare_cached("INSERT INTO traffic_daily(day,ip,requests,errors,server_errors,limited,first_at,last_at) VALUES(?,?,?,?,?,?,?,?)
            ON CONFLICT(day,ip) DO UPDATE SET requests=requests+excluded.requests,errors=errors+excluded.errors,
            server_errors=server_errors+excluded.server_errors,limited=limited+excluded.limited,
            first_at=min(first_at,excluded.first_at),last_at=max(last_at,excluded.last_at)")?;
        for ((day, ip), t) in &batch.traffic {
            traffic.execute(params![
                day,
                ip,
                t.requests,
                t.errors,
                t.server_errors,
                t.limited,
                t.first,
                t.last
            ])?;
        }
        let mut ip_user = tx.prepare_cached(
            "INSERT OR IGNORE INTO traffic_daily_users(day,ip,user_id) SELECT ?1,?2,?3 WHERE EXISTS(SELECT 1 FROM users WHERE id=?3)",
        )?;
        for (day, ip, user) in &batch.ip_users {
            ip_user.execute(params![day, ip, user])?;
        }
        let mut activity = tx.prepare_cached("INSERT INTO user_activity(user_id,day,requests) SELECT ?1,?2,?3 WHERE EXISTS(SELECT 1 FROM users WHERE id=?1)
            ON CONFLICT(user_id,day) DO UPDATE SET requests=requests+excluded.requests")?;
        for ((user, day), requests) in &batch.activity {
            activity.execute(params![user, day, requests])?;
        }
        let mut seen = tx.prepare_cached(
            "UPDATE users SET last_seen_at=max(coalesce(last_seen_at,0),?) WHERE id=?",
        )?;
        for (user, at) in &batch.seen {
            seen.execute(params![at, user])?;
        }
        let mut used = tx.prepare_cached(
            "UPDATE auth_tokens SET last_used_at=max(coalesce(last_used_at,0),?) WHERE token_hash=?",
        )?;
        for (token, at) in &batch.used {
            used.execute(params![at, token])?;
        }
        let mut duel = tx.prepare_cached("INSERT OR IGNORE INTO duel_games(race,game,event,ended_at,player1_id,player1_name,player1_ao5,player2_id,player2_name,player2_ao5,winner,results) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)")?;
        for g in &batch.games {
            let [a, b] = &g.players;
            // An account deleted while it raced leaves no id behind.
            let exists = |user: &Option<String>| -> Result<Option<String>> {
                Ok(match user {
                    Some(id) => one(&tx, "SELECT id FROM users WHERE id=?", [id])?
                        .and_then(|r| r["id"].as_str().map(str::to_owned)),
                    None => None,
                })
            };
            duel.execute(params![
                g.race,
                g.game,
                g.event,
                now(),
                exists(&a.user)?,
                a.name,
                a.ao5,
                exists(&b.user)?,
                b.name,
                b.ao5,
                g.winner.map(|w| w as i64),
                json!([a.results, b.results]).to_string()
            ])?;
        }
    }
    let rows = important
        .into_iter()
        .map(|id| {
            one(
                &tx,
                &format!("SELECT {ROW_COLUMNS} FROM request_log l LEFT JOIN users u ON u.id=l.user_id WHERE l.id=?"),
                [id],
            )
            .map(|r| r.map(row))
        })
        .collect::<Result<Vec<_>>>()?;
    tx.commit()?;
    Ok(rows.into_iter().flatten().collect())
}

fn prune(db: &Connection) -> Result<()> {
    let at = now();
    db.execute(
        "DELETE FROM request_log WHERE at<?",
        [at - RETENTION_DAYS * DAY_MS],
    )?;
    for (flag, cap) in [(0, MAX_ROWS), (1, MAX_IMPORTANT_ROWS)] {
        db.execute(
            "DELETE FROM request_log WHERE important=?1 AND id<(SELECT id FROM request_log WHERE important=?1 ORDER BY id DESC LIMIT 1 OFFSET ?2)",
            params![flag, cap - 1],
        )?;
    }
    let traffic = day(at - TRAFFIC_DAYS * DAY_MS);
    db.execute("DELETE FROM traffic_daily WHERE day<?", [&traffic])?;
    db.execute("DELETE FROM traffic_daily_users WHERE day<?", [&traffic])?;
    db.execute(
        "DELETE FROM user_activity WHERE day<?",
        [day(at - ACTIVITY_DAYS * DAY_MS)],
    )?;
    Ok(())
}

async fn writer(db: Db, mut rx: mpsc::Receiver<Event>, important: broadcast::Sender<Value>) {
    let mut batch = Batch::default();
    let (mut seen, mut used) = (Throttle::default(), Throttle::default());
    let mut tick = tokio::time::interval(Duration::from_secs(1));
    tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
    // The first tick is immediate: old rows go at startup, then hourly.
    let mut hourly = tokio::time::interval(Duration::from_secs(3600));
    hourly.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
    async fn store(db: &Db, batch: &mut Batch, important: &broadcast::Sender<Value>) {
        if batch.is_empty() {
            return;
        }
        let pending = std::mem::take(batch);
        match db.call(move |db| write(db, pending)).await {
            Ok(rows) => {
                for row in rows {
                    let _ = important.send(row);
                }
            }
            Err(error) => eprintln!("Request log: {}", error.message),
        }
    }
    loop {
        tokio::select! {
            event = rx.recv() => match event {
                None => { store(&db, &mut batch, &important).await; break; }
                Some(Event::Flush(done)) => {
                    store(&db, &mut batch, &important).await;
                    let _ = done.send(());
                }
                Some(event) => {
                    add(&mut batch, event, &mut seen, &mut used);
                    if batch.events >= BATCH { store(&db, &mut batch, &important).await; }
                }
            },
            _ = tick.tick() => store(&db, &mut batch, &important).await,
            _ = hourly.tick() => {
                if let Err(error) = db.call(|db| prune(db)).await { eprintln!("Request log pruning: {}", error.message); }
            }
        }
    }
}

/// The digest under which a bearer token is stored, for `Actor::token`.
pub fn token_hash(authorization: &str) -> Option<String> {
    authorization.strip_prefix("Bearer ").map(digest)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn days_are_utc_dates() {
        assert_eq!(day(0), "1970-01-01");
        assert_eq!(day(1_790_000_000_000), "2026-09-21");
        assert_eq!(day(951_782_400_000), "2000-02-29");
    }
    #[test]
    fn classification() {
        assert_eq!(
            classify("GET", "/api/health", 429),
            ("rate-limit", true, true)
        );
        assert_eq!(
            classify("POST", "/api/auth/login", 401),
            ("auth", true, true)
        );
        assert_eq!(classify("GET", "/api/auth/me", 200), ("api", false, true));
        assert_eq!(
            classify("GET", "/api/admin/overview", 200),
            ("admin", false, true)
        );
        assert_eq!(
            classify("POST", "/api/admin/users/x/revoke", 200),
            ("admin", true, true)
        );
        assert_eq!(
            classify("DELETE", "/api/admin/users/x", 200),
            ("account", true, true)
        );
        assert_eq!(classify("GET", "/api/duel", 101), ("duel", true, true));
        assert_eq!(
            classify("PUT", "/api/mobile/apk", 200),
            ("release", true, true)
        );
        assert_eq!(
            classify("GET", "/api/mobile/apk", 200),
            ("mobile", false, true)
        );
        assert_eq!(
            classify("GET", "/build/app.js", 200),
            ("asset", false, false)
        );
        assert_eq!(
            classify("GET", "/missing.js", 404),
            ("not-found", false, true)
        );
        assert_eq!(
            classify("GET", "/api/nope", 404),
            ("client-error", true, true)
        );
        assert_eq!(classify("GET", "/", 200), ("page", false, true));
        assert_eq!(
            classify("GET", "/api/sets", 500),
            ("server-error", true, true)
        );
    }
}
