use crate::{
    AppState, accounts, activity, admin_data,
    db::{all, one},
    error::{ApiError, Result},
};
use argon2::{
    Argon2,
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
};
use axum::{
    Json,
    body::Bytes,
    extract::{
        ConnectInfo, OriginalUri, State, WebSocketUpgrade,
        ws::{CloseFrame, Message, WebSocket},
    },
    http::{HeaderMap, Method, header},
    response::{IntoResponse, Response},
};
use rand::RngCore;
use rusqlite::params;
use serde_json::{Value, json};
use std::{collections::HashMap, net::SocketAddr, sync::Arc, time::Duration};
use tokio::{
    sync::{Semaphore, watch},
    time::{Instant, timeout},
};
/// The web administration is opened with a token generated inside the container
/// (`cubix-api admin-token`), whose SHA-256 alone is stored in `admin_access`. Sessions opened
/// with it name its `version`, so replacing or revoking the token ends them at once.
///
/// `CUBIX_ADMIN_PASSWORD` no longer opens the administration: it only authorizes the mobile
/// APK and over-the-air uploads that `scripts/deploy.ts` sends (see `release::authorize`).
pub struct Admin {
    /// Argon2 hash of `CUBIX_ADMIN_PASSWORD`, for mobile uploads only.
    upload: Option<String>,
    permits: Arc<Semaphore>,
    sockets: Arc<Semaphore>,
    revoked: watch::Sender<()>,
}
fn random_hex() -> String {
    let mut bytes = [0u8; 32];
    rand::rngs::OsRng.fill_bytes(&mut bytes);
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}
pub const TOKEN_PREFIX: &str = "cbx_admin_";
const DISABLED: &str = "Run `cubix-api admin-token` in the container to enable administration";

/// Replaces the admin token: returns the new one, stores only its digest and signs every admin
/// session out. Used by `cubix-api admin-token`, possibly while the server runs.
pub fn rotate(db: &mut rusqlite::Connection) -> Result<String> {
    // 256 random bits, hexadecimal so the token is URL-safe.
    let token = format!("{TOKEN_PREFIX}{}", random_hex());
    let tx = db.transaction()?;
    tx.execute("DELETE FROM admin_access", [])?;
    tx.execute("DELETE FROM admin_tokens", [])?;
    tx.execute(
        "INSERT INTO admin_access(id,digest,version,created_at) VALUES(1,?,?,?)",
        params![accounts::digest(&token), random_hex(), accounts::now()],
    )?;
    tx.commit()?;
    Ok(token)
}
/// Disables the administration: no token, no admin session. Returns whether a token existed.
pub fn disable(db: &mut rusqlite::Connection) -> Result<bool> {
    let tx = db.transaction()?;
    let existed = tx.execute("DELETE FROM admin_access", [])? > 0;
    tx.execute("DELETE FROM admin_tokens", [])?;
    tx.commit()?;
    Ok(existed)
}
struct Access {
    digest: String,
    version: String,
}
fn access(db: &rusqlite::Connection) -> Result<Option<Access>> {
    Ok(
        one(db, "SELECT digest,version FROM admin_access WHERE id=1", [])?.map(|row| Access {
            digest: row["digest"].as_str().unwrap_or("").to_owned(),
            version: row["version"].as_str().unwrap_or("").to_owned(),
        }),
    )
}
/// Equal-length comparison whose time does not depend on where the inputs differ.
fn same(a: &str, b: &str) -> bool {
    a.len() == b.len() && a.bytes().zip(b.bytes()).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}
/// The token is replaced or revoked by another process (the CLI): open admin sockets learn it
/// within two seconds and close; HTTP requests check the database every time anyway.
pub async fn watch_access(state: AppState) {
    let db = state.db.clone();
    let read = move || {
        let db = db.clone();
        async move { db.call(|db| Ok(access(db)?.map(|a| a.version))).await }
    };
    let mut last = read().await.ok().flatten();
    let mut tick = tokio::time::interval(Duration::from_secs(2));
    loop {
        tick.tick().await;
        let Ok(current) = read().await else {
            continue;
        };
        if current != last {
            last = current;
            state.admin.revoked.send_replace(());
        }
    }
}
impl Admin {
    pub fn new() -> std::result::Result<Self, Box<dyn std::error::Error>> {
        let password = std::env::var("CUBIX_ADMIN_PASSWORD").unwrap_or_default();
        if !password.is_empty() && password.len() < 12 {
            return Err("CUBIX_ADMIN_PASSWORD must contain at least 12 characters".into());
        }
        let upload = if password.is_empty() {
            None
        } else {
            Some(
                Argon2::default()
                    .hash_password(
                        password.as_bytes(),
                        &SaltString::generate(&mut rand::rngs::OsRng),
                    )
                    .map_err(|e| e.to_string())?
                    .to_string(),
            )
        };
        Ok(Self {
            upload,
            permits: Arc::new(Semaphore::new(2)),
            sockets: Arc::new(Semaphore::new(32)),
            revoked: watch::channel(()).0,
        })
    }
    pub fn upload_configured(&self) -> bool {
        self.upload.is_some()
    }
    /// Checks `CUBIX_ADMIN_PASSWORD` for the mobile uploads of `scripts/deploy.ts`, never for the
    /// web administration. Argon2 runs on a blocking thread, at most two at a time so a burst of
    /// guesses cannot exhaust memory. `None` when no password is configured.
    pub async fn verify_upload(&self, password: String) -> Result<Option<bool>> {
        let Some(hash) = self.upload.clone() else {
            return Ok(None);
        };
        let permit = self
            .permits
            .clone()
            .try_acquire_owned()
            .map_err(|_| ApiError::new(429, "Try again shortly"))?;
        tokio::task::spawn_blocking(move || {
            let _permit = permit;
            Some(PasswordHash::new(&hash).is_ok_and(|hash| {
                Argon2::default()
                    .verify_password(password.as_bytes(), &hash)
                    .is_ok()
            }))
        })
        .await
        .map_err(ApiError::internal)
    }
}
fn cookie(headers: &HeaderMap) -> Option<String> {
    headers
        .get(header::COOKIE)?
        .to_str()
        .ok()?
        .split(';')
        .find_map(|item| item.trim().strip_prefix("cubix_admin=").map(str::to_owned))
        .filter(|t| t.len() == 64 && t.bytes().all(|b| b.is_ascii_hexdigit()))
}
fn cookie_header(headers: &HeaderMap, value: &str, age: u32) -> String {
    let secure = headers
        .get("origin")
        .and_then(|v| v.to_str().ok())
        .is_some_and(|v| v.starts_with("https://"));
    format!(
        "cubix_admin={value}; Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age={age}{}",
        if secure { "; Secure" } else { "" }
    )
}
fn same_origin(headers: &HeaderMap) -> Result<()> {
    if let Some(origin) = headers.get("origin").and_then(|v| v.to_str().ok()) {
        let authority = origin
            .strip_prefix("https://")
            .or_else(|| origin.strip_prefix("http://"));
        if authority != headers.get(header::HOST).and_then(|v| v.to_str().ok()) {
            return Err(ApiError::new(403, "Origin not allowed"));
        }
    }
    Ok(())
}
pub async fn dispatch(
    State(state): State<AppState>,
    OriginalUri(uri): OriginalUri,
    method: Method,
    headers: HeaderMap,
    bytes: Bytes,
) -> Result<Response> {
    let admin = &state.admin;
    let path = uri.path();
    if method != Method::GET && method != Method::HEAD {
        same_origin(&headers)?;
    }
    let access = state
        .db
        .call(|db| access(db))
        .await?
        .ok_or_else(|| ApiError::new(503, DISABLED))?;
    if path == "/api/admin/login" && method == Method::POST {
        // Attempts share the admin rate limit (traffic.rs); failures are logged as important.
        let body: Value = serde_json::from_slice(&bytes).map_err(|_| ApiError::validation())?;
        let supplied = crate::api::string(&body, "token", 1, 256)?.trim();
        if !same(&accounts::digest(supplied), &access.digest) {
            return Err(ApiError::new(401, "Incorrect admin token"));
        }
        let token = random_hex();
        let digest = accounts::digest(&token);
        let version = access.version;
        let expires = accounts::now() + 86400000;
        state.db.call(move |db| {db.execute("DELETE FROM admin_tokens WHERE expires_at<=? OR password_version!=?",params![accounts::now(),version])?;db.execute("INSERT INTO admin_tokens(token_hash,expires_at,password_version) VALUES(?,?,?)",params![digest,expires,version])?;Ok(())}).await?;
        let mut response = Json(json!({"expiresAt":expires})).into_response();
        response.headers_mut().insert(
            header::SET_COOKIE,
            cookie_header(&headers, &token, 86400).parse().unwrap(),
        );
        return Ok(response);
    }
    let token = cookie(&headers).ok_or_else(|| ApiError::new(401, "Admin sign-in required"))?;
    let expires = session(&state, &token).await?;
    if path == "/api/admin/session" && method == Method::GET {
        return Ok(Json(json!({"expiresAt":expires})).into_response());
    }
    if path == "/api/admin/logout" && method == Method::POST {
        state
            .db
            .call(move |db| {
                db.execute(
                    "DELETE FROM admin_tokens WHERE token_hash=?",
                    [accounts::digest(&token)],
                )?;
                Ok(())
            })
            .await?;
        admin.revoked.send_replace(());
        let mut response = Json(json!({"ok":true})).into_response();
        response.headers_mut().insert(
            header::SET_COOKIE,
            cookie_header(&headers, "", 0).parse().unwrap(),
        );
        return Ok(response);
    }
    let query: HashMap<String, String> = serde_urlencoded::from_str(uri.query().unwrap_or(""))
        .map_err(|_| ApiError::validation())?;
    let segments: Vec<&str> = path
        .trim_start_matches("/api/admin/")
        .split('/')
        .collect();
    let value = match (method.as_str(), segments.as_slice()) {
        ("GET", ["dashboard"]) => dashboard(&state, expires, &query).await?,
        ("GET", ["overview"]) => admin_data::overview(&state).await?,
        ("GET", ["requests"]) => admin_data::requests(&state, &admin_data::Query::new(&query)?).await?,
        ("GET", ["ips"]) => admin_data::ips(&state, &admin_data::Query::new(&query)?).await?,
        ("GET", ["users"]) => admin_data::users(&state, &admin_data::Query::new(&query)?).await?,
        ("GET", ["users", id]) => admin_data::user(&state, admin_data::user_id(id)?).await?,
        ("POST", ["users", id, "revoke"]) | ("DELETE", ["users", id]) => {
            let id = admin_data::user_id(id)?;
            let value = if method == Method::POST {
                admin_data::revoke(&state, id.clone()).await?
            } else {
                admin_data::delete(&state, id.clone()).await?
            };
            // The log names the account acted on, without counting it as the account's activity.
            let mut response = Json(value).into_response();
            response.extensions_mut().insert(activity::Actor {
                user: id,
                token: None,
                seen: false,
            });
            return Ok(response);
        }
        _ => return Err(ApiError::new(404, "Unknown admin route")),
    };
    Ok(Json(value).into_response())
}

async fn session(state: &AppState, token: &str) -> Result<i64> {
    let digest = accounts::digest(token);
    // Only sessions opened with the current admin token are valid.
    let row = state.db.call(move |db| one(db, "SELECT t.expires_at FROM admin_tokens t JOIN admin_access a ON a.version=t.password_version WHERE t.token_hash=? AND t.expires_at>?", params![digest, accounts::now()])).await?
        .ok_or_else(|| ApiError::new(401, "Admin session expired"))?;
    row["expires_at"].as_i64().ok_or_else(ApiError::validation)
}

async fn dashboard(
    state: &AppState,
    expires: i64,
    query: &HashMap<String, String>,
) -> Result<Value> {
    if query.len() > 8 || query.iter().any(|(k, v)| k.len() > 20 || v.len() > 100) {
        return Err(ApiError::validation());
    }
    let page = query
        .get("page")
        .and_then(|v| v.parse::<u32>().ok())
        .unwrap_or(0)
        .min(100000);
    let ip_page = query
        .get("ipPage")
        .and_then(|v| v.parse::<usize>().ok())
        .unwrap_or(0)
        .min(100000);
    let traffic = state.traffic.snapshot(
        query.get("ip").map(String::as_str).unwrap_or(""),
        query.get("path").map(String::as_str).unwrap_or(""),
        query.get("status").map(String::as_str).unwrap_or(""),
        ip_page,
    );
    let q = query.get("q").cloned().unwrap_or_default().to_lowercase();
    let guests = query.get("guests").is_some_and(|v| v == "1");
    let users=state.db.call(move |db| {
        let counts=one(db,"SELECT count(*) total,coalesce(sum(password_hash IS NOT NULL),0) registered,coalesce(sum(password_hash IS NULL),0) guests FROM users",[])?.unwrap();
        let matching=one(db,"SELECT count(*) count FROM users WHERE (? OR password_hash IS NOT NULL) AND instr(lower(username),?)>0",params![guests,q])?.unwrap();
        let rows=all(db,"SELECT u.id,u.username,u.created_at AS createdAt,(u.password_hash IS NULL) AS isGuest,(SELECT count(*) FROM solves s WHERE s.user_id=u.id) AS solves,(SELECT count(*) FROM sessions s WHERE s.user_id=u.id) AS sessions FROM users u WHERE (? OR u.password_hash IS NOT NULL) AND instr(lower(u.username),?)>0 ORDER BY u.created_at DESC,u.id LIMIT 50 OFFSET ?",params![guests,q,page*50])?;
        Ok(json!({"counts":counts,"matching":matching["count"],"rows":rows,"page":page}))
    }).await?;
    Ok(json!({"expiresAt":expires,"traffic":traffic,"users":users}))
}

pub async fn upgrade(
    State(state): State<AppState>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    ws: WebSocketUpgrade,
) -> Result<Response> {
    same_origin(&headers)?;
    let token = cookie(&headers).ok_or_else(|| ApiError::new(401, "Admin sign-in required"))?;
    let expires = session(&state, &token).await?;
    let permit = state
        .admin
        .sockets
        .clone()
        .try_acquire_owned()
        .map_err(|_| ApiError::new(429, "Too many admin connections"))?;
    let ip = state.traffic.ip(peer.ip(), &headers);
    Ok(ws
        .max_message_size(4096)
        .max_frame_size(4096)
        .on_upgrade(move |socket| async move {
            let _permit = permit;
            live(socket, state, token, expires, ip).await;
        }))
}

async fn send(socket: &mut WebSocket, message: Message) -> bool {
    matches!(
        timeout(Duration::from_secs(5), socket.send(message)).await,
        Ok(Ok(()))
    )
}
async fn close(socket: &mut WebSocket, code: u16, reason: &'static str) {
    send(
        socket,
        Message::Close(Some(CloseFrame {
            code,
            reason: reason.into(),
        })),
    )
    .await;
}
async fn live(
    mut socket: WebSocket,
    state: AppState,
    token: String,
    expires: i64,
    ip: std::net::IpAddr,
) {
    let mut updates = state.traffic.subscribe();
    let mut important = state.traffic.log.subscribe();
    let mut revoked = state.admin.revoked.subscribe();
    let deadline =
        Instant::now() + Duration::from_millis((expires - accounts::now()).max(0) as u64);
    let mut heartbeat = tokio::time::interval_at(
        Instant::now() + Duration::from_secs(30),
        Duration::from_secs(30),
    );
    heartbeat.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    let mut last_pong = Instant::now();
    let mut query = HashMap::new();
    let mut streaming = false;
    let mut pending = false;
    let mut next_send = Instant::now();
    loop {
        tokio::select! {
            _ = tokio::time::sleep_until(deadline) => { close(&mut socket, 4001, "Admin session expired").await; break; }
            result = revoked.changed() => {
                if result.is_err() || session(&state, &token).await.is_err() {
                    close(&mut socket, 4001, "Admin session revoked").await; break;
                }
            }
            _ = heartbeat.tick() => {
                if last_pong.elapsed() > Duration::from_secs(60) { break; }
                if !send(&mut socket, Message::Ping(Vec::new().into())).await { break; }
            }
            result = updates.changed() => {
                if result.is_err() { break; }
                if streaming { pending = true; }
            }
            event = important.recv() => match event {
                // Each newly stored important request, as `/api/admin/requests` lists it.
                Ok(row) => {
                    if streaming && !send(&mut socket, Message::Text(json!({"type":"important","data":row}).to_string().into())).await { break; }
                }
                Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => {}
                Err(_) => break,
            },
            _ = tokio::time::sleep_until(next_send), if pending => {
                pending = false;
                // Consume changes before the snapshot so requests arriving while SQL runs
                // remain pending for the next bounded update. No per-request queue grows.
                updates.borrow_and_update();
                if session(&state, &token).await.is_err() { close(&mut socket, 4001, "Admin session expired").await; break; }
                match dashboard(&state, expires, &query).await {
                    Ok(data) => { if !send(&mut socket, Message::Text(json!({"type":"snapshot","data":data}).to_string().into())).await { break; } }
                    Err(_) => { close(&mut socket, 1011, "Dashboard unavailable").await; break; }
                }
                next_send = Instant::now() + Duration::from_millis(500);
            }
            message = socket.recv() => {
                let Some(Ok(message)) = message else { break; };
                if !state.traffic.allow(ip, "/api/admin/live", true) { close(&mut socket, 1008, "Message rate limit exceeded").await; break; }
                let text = match message {
                    Message::Text(text) => text,
                    Message::Pong(_) => { last_pong = Instant::now(); continue; }
                    Message::Ping(_) => continue,
                    Message::Close(_) => break,
                    _ => { close(&mut socket, 1008, "Invalid message").await; break; }
                };
                let body: Value = match serde_json::from_str(&text) { Ok(body) => body, Err(_) => { close(&mut socket, 1008, "Invalid message").await; break; } };
                let filters = serde_json::from_value::<HashMap<String,String>>(body["filters"].clone());
                let Ok(filters) = filters else { close(&mut socket, 1008, "Invalid filters").await; break; };
                if body["type"] != "subscribe" || !body["live"].is_boolean() || filters.len() > 8 || filters.iter().any(|(k,v)| k.len() > 20 || v.len() > 100) {
                    close(&mut socket, 1008, "Invalid subscription").await; break;
                }
                query = filters;
                streaming = body["live"].as_bool().unwrap();
                pending = true;
            }
        }
    }
}
