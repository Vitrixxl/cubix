use crate::practice;
use crate::{
    AppState, accounts,
    db::{all, required},
    error::{ApiError, Result},
    stats,
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
use std::collections::HashMap;

pub fn string<'a>(body: &'a Value, key: &str, min: usize, max: usize) -> Result<&'a str> {
    body.get(key)
        .and_then(Value::as_str)
        .filter(|s| (min..=max).contains(&s.chars().count()))
        .ok_or_else(ApiError::validation)
}
fn optional_string<'a>(body: &'a Value, key: &str) -> Result<Option<&'a str>> {
    match body.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(v) => v.as_str().map(Some).ok_or_else(ApiError::validation),
    }
}
/// A solve note: absent, cleared (`null` or blank) or trimmed text of at most 500 characters.
fn comment(body: &Value) -> Result<Option<Option<String>>> {
    match body.get("comment") {
        None => Ok(None),
        Some(Value::Null) => Ok(Some(None)),
        Some(_) => {
            let text = string(body, "comment", 0, 500)?.trim();
            Ok(Some(Some(text.to_owned()).filter(|t| !t.is_empty())))
        }
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
            "mobile/release" => return Ok(Json(crate::release::info())),
            "moves" => return Ok(Json(state.catalog.moves.clone())),
            "sets" => {
                return Ok(Json(practice::catalog(
                    &state.catalog.sets,
                    &practice::query(&query)?,
                )));
            }
            "cases" => {
                return Ok(Json(practice::catalog(
                    &state.catalog.cases,
                    &practice::query(&query)?,
                )));
            }
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
        .call(move |db| {
            let value = route(db, &copy, method.as_str(), &path, &query, &body, &token)?;
            // Other devices of the same account learn about committed practice changes immediately.
            if method != Method::GET
                && !path.starts_with("auth/")
                && let Some(user) = accounts::auth(db, &token)?
            {
                let uid = user["id"].as_str().unwrap();
                copy.hub.notify_sync(uid, crate::sync::cursor(db, uid)?);
            }
            Ok(value)
        })
        .await
        .map(Json)
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
pub(crate) fn route(
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
    if path == "sync" {
        if method == "GET" {
            let after = query
                .get("after")
                .map(|s| s.parse::<i64>())
                .transpose()
                .map_err(|_| ApiError::validation())?
                .unwrap_or(0);
            if after < 0 {
                return Err(ApiError::validation());
            }
            return crate::sync::pull(db, uid, after);
        }
        if method == "POST" {
            if user["password_hash"].is_null() {
                return Err(ApiError::new(403, "Sign in to synchronize."));
            }
            return crate::sync::push(db, state, uid, token, body);
        }
    }
    let parts: Vec<_> = path.split('/').collect();
    match (method, parts.as_slice()) {
        ("GET", ["auth", "me"]) => Ok(accounts::public(&user)),
        ("GET", ["stats"]) => {
            let filter = practice::query(query)?;
            let rows = all(
                db,
                "SELECT * FROM solves WHERE case_id IS NOT NULL AND user_id=? AND puzzle_id=? AND solve_mode=? ORDER BY case_id,created_at,id",
                params![uid, filter.puzzle, filter.solve_mode],
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
                "SELECT * FROM solves WHERE case_id=? AND user_id=? AND solve_mode=? ORDER BY created_at,id",
                params![id, uid, practice::query(query)?.solve_mode],
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
            let context = practice::Context::from_body(body, None, mode == "training")?;
            if cases.as_array().unwrap().iter().any(|id| {
                !state
                    .catalog
                    .by_id
                    .get(id.as_str().unwrap())
                    .is_some_and(|c| practice::puzzle_of(c) == context.puzzle)
            }) {
                return Err(ApiError::new(400, "Case and cube do not match."));
            }
            session_dto(required(
                db,
                "INSERT INTO sessions(mode,case_ids,user_id,cube_size,puzzle_id,solve_mode,scramble_type) VALUES(?,?,?,?,?,?,?) RETURNING *",
                params![
                    mode,
                    cases.to_string(),
                    uid,
                    context.cube_size(),
                    context.puzzle,
                    context.solve_mode,
                    context.scramble_type
                ],
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
            let filter = practice::query(query)?;
            Ok(json!(all(
                db,
                "SELECT s.* FROM solves s LEFT JOIN sessions se ON se.id=s.session_id WHERE s.user_id=? AND s.puzzle_id=? AND s.solve_mode=? AND (? IS NULL OR s.scramble_type=?) AND COALESCE(se.mode,CASE WHEN s.case_id IS NULL THEN 'playground' ELSE 'training' END)=? ORDER BY s.created_at DESC,s.id DESC LIMIT ?",
                params![
                    uid,
                    filter.puzzle,
                    filter.solve_mode,
                    filter.scramble_type,
                    filter.scramble_type,
                    mode,
                    limit
                ]
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
            let comment = comment(body)?.flatten();
            let selected_session = sid.map(|id| session(db, id, uid)).transpose()?;
            let selected_case = case.and_then(|id| state.catalog.by_id.get(id));
            let context = practice::Context::from_body(
                body,
                selected_session.as_ref().or(selected_case),
                case.is_some_and(|s| !s.is_empty()),
            )?;
            if selected_session
                .as_ref()
                .is_some_and(|s| practice::Context::of(s) != context)
                || selected_case.is_some_and(|c| practice::puzzle_of(c) != context.puzzle)
            {
                return Err(ApiError::new(
                    400,
                    "Case, cube and practice context do not match.",
                ));
            }
            if let Some(s) = selected_session
                && (s["mode"] == "training") != case.is_some_and(|s| !s.is_empty())
            {
                return Err(ApiError::new(400, "Case and session mode do not match."));
            }
            if case.is_some_and(|s| !s.is_empty() && !state.catalog.by_id.contains_key(s)) {
                return Err(ApiError::new(400, "Unknown case"));
            }
            required(
                db,
                "INSERT INTO solves(session_id,case_id,time_ms,penalty,scramble,comment,user_id,cube_size,puzzle_id,solve_mode,scramble_type) VALUES(?,?,?,?,?,?,?,?,?,?,?) RETURNING *",
                params![
                    sid,
                    case,
                    time.round(),
                    penalty,
                    scramble,
                    comment,
                    uid,
                    context.cube_size(),
                    context.puzzle,
                    context.solve_mode,
                    context.scramble_type
                ],
                "Unknown solve",
            )
        }
        ("PATCH", ["solves", id]) => {
            // Either field may be edited on its own; the other keeps its value.
            let penalty = if body.get("penalty").is_some() {
                Some(enum_string(body, "penalty", &["none", "+2", "dnf"])?)
            } else {
                None
            };
            let comment = comment(body)?;
            if penalty.is_none() && comment.is_none() {
                return Err(ApiError::validation());
            }
            required(
                db,
                "UPDATE solves SET penalty=COALESCE(?,penalty),comment=CASE WHEN ? THEN ? ELSE comment END WHERE id=? AND user_id=? RETURNING *",
                params![penalty, comment.is_some(), comment.flatten(), id, uid],
                "Unknown solve",
            )
        }
        ("DELETE", ["solves", id]) => required(
            db,
            "DELETE FROM solves WHERE id=? AND user_id=? RETURNING *",
            params![id, uid],
            "Unknown solve",
        ),
        ("GET", ["learned"]) => Ok(json!(
            all(
                db,
                "SELECT case_id FROM learned_cases WHERE user_id=? AND learned=1 ORDER BY case_id",
                [uid]
            )?
            .iter()
            .map(|r| r["case_id"].clone())
            .collect::<Vec<_>>()
        )),
        ("PUT", ["learned"]) => {
            let case = string(body, "caseId", 1, 100)?;
            let learned = body
                .get("learned")
                .and_then(Value::as_bool)
                .ok_or_else(ApiError::validation)?;
            if !state.catalog.by_id.contains_key(case) {
                return Err(ApiError::new(400, "Unknown case"));
            }
            // Two statements rather than UPSERT: an UPSERT's conflict clause would override the
            // INSERT OR REPLACE inside the sync journal trigger.
            let updated = db.execute(
                "UPDATE learned_cases SET learned=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE user_id=? AND case_id=?",
                params![learned as i64, uid, case],
            )?;
            if updated == 0 {
                db.execute(
                    "INSERT INTO learned_cases(user_id,case_id,learned) VALUES(?,?,?)",
                    params![uid, case, learned as i64],
                )?;
            }
            required(
                db,
                "SELECT * FROM learned_cases WHERE user_id=? AND case_id=?",
                params![uid, case],
                "Unknown case",
            )
        }
        _ => Err(ApiError::new(404, "Not found")),
    }
}
