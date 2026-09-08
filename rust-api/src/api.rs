use crate::{
    AppState, accounts,
    db::{all, one, required},
    error::{ApiError, Result},
    social, stats,
};
use argon2::{
    Algorithm, Argon2, Params as ArgonParams, Version,
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
};
use axum::{
    Json,
    body::Bytes,
    extract::{OriginalUri, State},
    http::{HeaderMap, Method},
};
use rand::rngs::OsRng;
use rusqlite::{Connection, params};
use serde_json::{Value, json};
use std::collections::{HashMap, HashSet};

pub fn string<'a>(body: &'a Value, key: &str, min: usize, max: usize) -> Result<&'a str> {
    body.get(key)
        .and_then(Value::as_str)
        .filter(|s| (min..=max).contains(&s.chars().count()))
        .ok_or_else(ApiError::validation)
}
pub fn optional_positive_int(body: &Value, key: &str) -> Result<Option<i64>> {
    match body.get(key) {
        None => Ok(None),
        Some(v) => v
            .as_i64()
            .filter(|v| *v >= 1)
            .map(Some)
            .ok_or_else(ApiError::validation),
    }
}
fn optional_string<'a>(body: &'a Value, key: &str) -> Result<Option<&'a str>> {
    match body.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(v) => v.as_str().map(Some).ok_or_else(ApiError::validation),
    }
}
fn enum_string<'a>(body: &'a Value, key: &str, allowed: &[&str]) -> Result<&'a str> {
    let s = string(body, key, 0, 32)?;
    if allowed.contains(&s) {
        Ok(s)
    } else {
        Err(ApiError::validation())
    }
}
fn query_int(query: &HashMap<String, String>, key: &str, default: i64, max: i64) -> Result<i64> {
    match query.get(key) {
        None => Ok(default),
        Some(v) => v
            .parse::<i64>()
            .ok()
            .filter(|v| *v >= 1 && *v <= max)
            .ok_or_else(ApiError::validation),
    }
}
fn limited(state: &AppState, key: String) -> Result<()> {
    let now = accounts::now();
    let mut map = state.attempts.lock().unwrap();
    map.retain(|_, (_, until)| *until >= now);
    if map.len() >= 10000 && !map.contains_key(&key) {
        return Err(ApiError::new(
            429,
            "Too many attempts. Try again in 15 minutes.",
        ));
    }
    let entry = map.entry(key).or_insert((0, now + 15 * 60000));
    entry.0 += 1;
    if entry.0 > 10 {
        Err(ApiError::new(
            429,
            "Too many attempts. Try again in 15 minutes.",
        ))
    } else {
        Ok(())
    }
}
async fn password(state: &AppState, password: String, hash: Option<String>) -> Result<String> {
    let permit = state
        .passwords
        .clone()
        .try_acquire_owned()
        .map_err(|_| ApiError::new(429, "Too many sign-in requests. Try again shortly."))?;
    tokio::task::spawn_blocking(move || {
        let _permit = permit;
        let argon = Argon2::new(
            Algorithm::Argon2id,
            Version::V0x13,
            ArgonParams::new(65536, 2, 1, None).map_err(ApiError::internal)?,
        );
        if let Some(hash) = hash {
            let parsed = PasswordHash::new(&hash).map_err(ApiError::internal)?;
            argon
                .verify_password(password.as_bytes(), &parsed)
                .map_err(|_| ApiError::new(401, "Incorrect username or password."))?;
            Ok(hash)
        } else {
            argon
                .hash_password(password.as_bytes(), &SaltString::generate(&mut OsRng))
                .map(|h| h.to_string())
                .map_err(ApiError::internal)
        }
    })
    .await
    .map_err(ApiError::internal)?
}
async fn auth_request(state: &AppState, path: &str, body: Value, token: String) -> Result<Value> {
    let registering = path == "auth/register";
    let username = string(&body, "username", if registering { 3 } else { 0 }, 24)?
        .trim()
        .to_lowercase();
    let secret = string(&body, "password", if registering { 10 } else { 0 }, 128)?.to_owned();
    if registering
        && (!(3..=24).contains(&username.len())
            || !username
                .bytes()
                .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'_'))
    {
        return Err(ApiError::new(
            400,
            "Use 3–24 letters, numbers or underscores for your username.",
        ));
    }
    let key = format!(
        "{}:{username}",
        if registering { "register" } else { "login" }
    );
    limited(state, key.clone())?;
    let name = username.clone();
    if registering {
        let guest = state
            .db
            .call(move |db| {
                if accounts::by_username(db, &name)?.is_some() {
                    return Err(ApiError::new(409, "This username is already taken."));
                }
                let current = accounts::auth(db, &token)?;
                if current
                    .as_ref()
                    .is_some_and(|u| !u["password_hash"].is_null())
                {
                    return Err(ApiError::new(
                        400,
                        "Sign out before creating another account.",
                    ));
                }
                Ok(current.and_then(|u| u["id"].as_str().map(str::to_owned)))
            })
            .await?;
        let hash = password(state, secret, None).await?;
        state
            .db
            .call(move |db| accounts::register(db, &username, &hash, guest))
            .await
    } else {
        let user = state
            .db
            .call(move |db| {
                accounts::by_username(db, &name)?
                    .ok_or_else(|| ApiError::new(401, "Incorrect username or password."))
            })
            .await?;
        password(
            state,
            secret,
            Some(user["password_hash"].as_str().unwrap().to_owned()),
        )
        .await?;
        state.attempts.lock().unwrap().remove(&key);
        state.db.call(move |db| accounts::issue(db, &user)).await
    }
}
pub async fn dispatch(
    State(state): State<AppState>,
    OriginalUri(uri): OriginalUri,
    method: Method,
    headers: HeaderMap,
    bytes: Bytes,
) -> Result<Json<Value>> {
    let path = percent_encoding::percent_decode_str(uri.path().trim_start_matches("/api/"))
        .decode_utf8()
        .map_err(|_| ApiError::validation())?
        .into_owned();
    let query: HashMap<String, String> = serde_urlencoded::from_str(uri.query().unwrap_or(""))
        .map_err(|_| ApiError::validation())?;
    let body: Value = if bytes.is_empty() {
        json!({})
    } else {
        serde_json::from_slice(&bytes).map_err(|_| ApiError::validation())?
    };
    let token = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_owned();
    if method == Method::POST && ["auth/register", "auth/login"].contains(&path.as_str()) {
        return auth_request(&state, &path, body, token).await.map(Json);
    }
    if method == Method::GET {
        match path.as_str() {
            "health" => return Ok(Json(json!({"ok":true}))),
            "moves" => return Ok(Json(state.catalog.moves.clone())),
            "sets" => return Ok(Json(state.catalog.sets.clone())),
            "cases" => return Ok(Json(state.catalog.cases.clone())),
            _ => {}
        }
        if let Some(id) = path.strip_prefix("cases/").filter(|s| !s.contains('/')) {
            return state
                .catalog
                .by_id
                .get(id)
                .cloned()
                .map(Json)
                .ok_or_else(|| ApiError::new(404, "Unknown case"));
        }
    }
    let copy = state.clone();
    state
        .db
        .call(move |db| route(db, &copy, method.as_str(), &path, &query, &body, &token))
        .await
        .map(Json)
}

fn profile(db: &Connection, state: &AppState, username: &str, user: &Value) -> Result<Value> {
    let target = accounts::by_username(db, username)?
        .filter(|_| !user["password_hash"].is_null())
        .ok_or_else(|| ApiError::new(404, "This profile is unavailable."))?;
    let solves = all(
        db,
        "SELECT * FROM solves WHERE user_id=? ORDER BY created_at,id",
        [target["id"].as_str()],
    )?;
    // Preserve first-seen case order, as in the web API's Map.
    let mut groups: Vec<(String, Vec<Value>)> = Vec::new();
    for s in &solves {
        if let Some(id) = s["case_id"].as_str().filter(|s| !s.is_empty()) {
            if let Some((_, rows)) = groups.iter_mut().find(|(key, _)| key == id) {
                rows.push(s.clone());
            } else {
                groups.push((id.to_owned(), vec![s.clone()]));
            }
        }
    }
    let cases: Vec<_> = groups
        .iter()
        .filter_map(|(id, rows)| {
            state.catalog.by_id.get(id).map(|case| {
                let mut h = stats::history(id, rows);
                h["name"] = case["name"].clone();
                h["stage"] = case["stage"].clone();
                h
            })
        })
        .collect();
    let days: HashSet<_> = solves
        .iter()
        .filter_map(|s| {
            s["created_at"]
                .as_str()
                .map(|v| v.chars().take(10).collect::<String>())
        })
        .collect();
    let playground: Vec<_> = solves
        .iter()
        .filter(|s| s["case_id"].is_null())
        .cloned()
        .collect();
    Ok(
        json!({"user":accounts::public(&target),"totalSolves":solves.len(),"trainingSolves":solves.len()-playground.len(),"activeDays":days.len(),
        "playground":stats::history("playground",&playground),"cases":cases}),
    )
}
fn session(db: &Connection, id: f64, user: &str) -> Result<Value> {
    required(
        db,
        "SELECT * FROM sessions WHERE id=? AND user_id=?",
        params![id, user],
        "Unknown session",
    )
}
fn session_dto(mut value: Value) -> Result<Value> {
    value["case_ids"] = serde_json::from_str(value["case_ids"].as_str().unwrap_or("[]"))
        .map_err(ApiError::internal)?;
    Ok(value)
}
fn route(
    db: &mut Connection,
    state: &AppState,
    method: &str,
    path: &str,
    query: &HashMap<String, String>,
    body: &Value,
    token: &str,
) -> Result<Value> {
    match (method, path) {
        ("POST", "auth/guest") => return accounts::guest(db),
        ("POST", "auth/logout") => {
            if let Some(t) = token.strip_prefix("Bearer ") {
                db.execute(
                    "DELETE FROM auth_tokens WHERE token_hash=?",
                    [accounts::digest(t)],
                )?;
            }
            return Ok(json!({"ok":true}));
        }
        _ => {}
    }
    let user = accounts::signed_in(db, token)?;
    let uid = user["id"].as_str().unwrap();
    let parts: Vec<_> = path.split('/').collect();
    if parts.first() == Some(&"social") && user["password_hash"].is_null() {
        return Err(ApiError::new(
            403,
            "Create an account to chat with friends.",
        ));
    }
    match (method, parts.as_slice()) {
        ("GET", ["auth", "me"]) => Ok(accounts::public(&user)),
        ("PATCH", ["account"]) => {
            if user["password_hash"].is_null() {
                return Err(ApiError::new(
                    403,
                    "Create an account to edit your profile.",
                ));
            }
            let bio = string(body, "bio", 0, 240)?.trim();
            db.execute("UPDATE users SET bio=? WHERE id=?", params![bio, uid])?;
            let mut u = user;
            u["bio"] = json!(bio);
            Ok(accounts::public(&u))
        }
        ("GET", ["users"]) => {
            if user["password_hash"].is_null() {
                return Err(ApiError::new(403, "Sign in to discover other cubers."));
            }
            let q = query.get("q").map(String::as_str).unwrap_or("");
            if q.chars().count() > 80 {
                return Err(ApiError::validation());
            }
            Ok(json!(all(db,"SELECT * FROM users WHERE password_hash IS NOT NULL AND instr(lower(username),?)>0 ORDER BY username LIMIT 30",[q.trim().to_lowercase()])?.iter().map(accounts::public).collect::<Vec<_>>()))
        }
        ("GET", ["users", name]) => profile(db, state, name, &user),
        ("GET", ["stats"]) => {
            let rows = all(
                db,
                "SELECT * FROM solves WHERE case_id IS NOT NULL AND user_id=? ORDER BY case_id,created_at,id",
                [uid],
            )?;
            let mut groups: Vec<(String, Vec<Value>)> = Vec::new();
            for row in rows {
                let id = row["case_id"].as_str().unwrap().to_owned();
                if let Some((key, rows)) = groups.last_mut().filter(|(key, _)| *key == id) {
                    let _ = key;
                    rows.push(row);
                } else {
                    groups.push((id, vec![row]));
                }
            }
            Ok(json!(
                groups
                    .iter()
                    .map(|(id, rows)| stats::history(id, rows)["summary"].clone())
                    .collect::<Vec<_>>()
            ))
        }
        ("GET", ["cases", id, "stats"]) => Ok(stats::history(
            id,
            &all(
                db,
                "SELECT * FROM solves WHERE case_id=? AND user_id=? ORDER BY created_at,id",
                params![id, uid],
            )?,
        )),
        ("POST", ["sessions"]) => {
            let mode = enum_string(body, "mode", &["training", "playground"])?;
            let cases = body.get("caseIds").cloned().unwrap_or_else(|| json!([]));
            if !cases
                .as_array()
                .is_some_and(|a| a.iter().all(Value::is_string))
            {
                return Err(ApiError::validation());
            }
            session_dto(required(
                db,
                "INSERT INTO sessions(mode,case_ids,user_id) VALUES(?,?,?) RETURNING *",
                params![mode, cases.to_string(), uid],
                "Unknown session",
            )?)
        }
        ("GET", ["sessions", id]) => {
            let id = id
                .parse::<f64>()
                .map_err(|_| ApiError::new(404, "Unknown session"))?;
            let mut s = session_dto(session(db, id, uid)?)?;
            s["solves"] = json!(all(
                db,
                "SELECT * FROM solves WHERE session_id=? AND user_id=? ORDER BY created_at,id",
                params![id, uid]
            )?);
            Ok(s)
        }
        ("GET", ["solves"]) => {
            let mode = query
                .get("mode")
                .map(String::as_str)
                .unwrap_or("playground");
            if !["training", "playground"].contains(&mode) {
                return Err(ApiError::validation());
            }
            let limit = query_int(query, "limit", 500, 10000)?;
            Ok(json!(all(
                db,
                "SELECT s.* FROM solves s LEFT JOIN sessions se ON se.id=s.session_id WHERE s.user_id=? AND COALESCE(se.mode,CASE WHEN s.case_id IS NULL THEN 'playground' ELSE 'training' END)=? ORDER BY s.created_at DESC,s.id DESC LIMIT ?",
                params![uid, mode, limit]
            )?))
        }
        ("POST", ["solves"]) => {
            let sid = match body.get("sessionId") {
                None | Some(Value::Null) => None,
                Some(v) => Some(v.as_f64().ok_or_else(ApiError::validation)?),
            };
            let case = optional_string(body, "caseId")?;
            let time = body
                .get("timeMs")
                .and_then(Value::as_f64)
                .filter(|n| n.is_finite() && *n >= 0.)
                .ok_or_else(ApiError::validation)?;
            let penalty = if body.get("penalty").is_some() {
                enum_string(body, "penalty", &["none", "+2", "dnf"])?
            } else {
                "none"
            };
            let scramble = optional_string(body, "scramble")?;
            if let Some(id) = sid {
                let s = session(db, id, uid)?;
                if (s["mode"] == "training") != case.is_some_and(|s| !s.is_empty()) {
                    return Err(ApiError::new(400, "Case and session mode do not match."));
                }
            }
            if case.is_some_and(|s| !s.is_empty() && !state.catalog.by_id.contains_key(s)) {
                return Err(ApiError::new(400, "Unknown case"));
            }
            required(
                db,
                "INSERT INTO solves(session_id,case_id,time_ms,penalty,scramble,user_id) VALUES(?,?,?,?,?,?) RETURNING *",
                params![sid, case, time.round(), penalty, scramble, uid],
                "Unknown solve",
            )
        }
        ("PATCH", ["solves", id]) => {
            let penalty = enum_string(body, "penalty", &["none", "+2", "dnf"])?;
            required(
                db,
                "UPDATE solves SET penalty=? WHERE id=? AND user_id=? RETURNING *",
                params![penalty, id, uid],
                "Unknown solve",
            )
        }
        ("DELETE", ["solves", id]) => required(
            db,
            "DELETE FROM solves WHERE id=? AND user_id=? RETURNING *",
            params![id, uid],
            "Unknown solve",
        ),
        ("GET", ["social", "friends"]) => social::friends(db, uid),
        ("POST", ["social", "friends"]) => {
            let name = string(body, "username", 3, 24)?.trim();
            let peer = accounts::by_username(db, name)?
                .filter(|p| p["id"] != uid)
                .ok_or_else(|| ApiError::new(400, "Enter another cuber's exact username."))?;
            let pid = peer["id"].as_str().unwrap();
            if social::friendship(db, uid, pid)?.is_some() {
                return Err(ApiError::new(
                    409,
                    "A friendship or request already exists.",
                ));
            }
            let (a, b) = if uid < pid { (uid, pid) } else { (pid, uid) };
            db.execute(
                "INSERT INTO friendships(user_a,user_b,requested_by) VALUES(?,?,?)",
                params![a, b, uid],
            )?;
            state.hub.notify(&[uid, pid]);
            social::friends(db, uid)
        }
        ("POST", ["social", "friends", id, "accept"]) => {
            let f = one(db, "SELECT * FROM friendships WHERE id=?", [id])?
                .filter(|f| {
                    (f["user_a"] == uid || f["user_b"] == uid)
                        && f["requested_by"] != uid
                        && f["status"] == "pending"
                })
                .ok_or_else(|| ApiError::new(404, "Invitation unavailable."))?;
            db.execute("UPDATE friendships SET status='accepted' WHERE id=?", [id])?;
            state
                .hub
                .notify(&[f["user_a"].as_str().unwrap(), f["user_b"].as_str().unwrap()]);
            social::friends(db, uid)
        }
        ("DELETE", ["social", "friends", id]) => {
            let f = one(db, "SELECT * FROM friendships WHERE id=?", [id])?
                .filter(|f| f["user_a"] == uid || f["user_b"] == uid)
                .ok_or_else(|| ApiError::new(404, "Friendship unavailable."))?;
            db.execute("DELETE FROM friendships WHERE id=?", [id])?;
            state
                .hub
                .notify(&[f["user_a"].as_str().unwrap(), f["user_b"].as_str().unwrap()]);
            Ok(json!({"ok":true}))
        }
        ("GET", ["social", "solves", id]) => social::own_solve(
            db,
            id.parse()
                .map_err(|_| ApiError::new(404, "Time unavailable."))?,
            uid,
        )?
        .ok_or_else(|| ApiError::new(404, "Time unavailable.")),
        ("GET", ["social", "messages", peer]) => social::messages(
            db,
            uid,
            peer,
            query_int(query, "before", 9007199254740991, i64::MAX)?,
        ),
        ("POST", ["social", "messages", peer]) => social::persist(db, &state.hub, uid, peer, body),
        _ => Err(ApiError::new(404, "Not found")),
    }
}
