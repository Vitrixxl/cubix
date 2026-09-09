use crate::{
    AppState, accounts,
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
    extract::{OriginalUri, State},
    http::{HeaderMap, Method, header},
    response::{IntoResponse, Response},
};
use rand::RngCore;
use rusqlite::params;
use serde_json::{Value, json};
use std::{collections::HashMap, sync::Arc};
use tokio::sync::Semaphore;
pub struct Admin {
    hash: String,
    fingerprint: String,
    permits: Arc<Semaphore>,
}
fn random_token() -> String {
    let mut bytes = [0u8; 32];
    rand::rngs::OsRng.fill_bytes(&mut bytes);
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}
impl Admin {
    pub fn new() -> std::result::Result<Option<Self>, Box<dyn std::error::Error>> {
        let password = std::env::var("CUBIX_ADMIN_PASSWORD").unwrap_or_default();
        if password.is_empty() {
            return Ok(None);
        }
        if password.len() < 12 {
            return Err("CUBIX_ADMIN_PASSWORD must contain at least 12 characters".into());
        }
        let hash = Argon2::default()
            .hash_password(
                password.as_bytes(),
                &SaltString::generate(&mut rand::rngs::OsRng),
            )
            .map_err(|e| e.to_string())?
            .to_string();
        Ok(Some(Self {
            hash,
            fingerprint: accounts::digest(&format!("cubix-admin:{password}")),
            permits: Arc::new(Semaphore::new(2)),
        }))
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
    let admin = state.admin.as_ref().as_ref().ok_or_else(|| {
        ApiError::new(
            503,
            "Set CUBIX_ADMIN_PASSWORD in .env to enable administration",
        )
    })?;
    let path = uri.path();
    if method == Method::POST {
        same_origin(&headers)?;
    }
    if path == "/api/admin/login" && method == Method::POST {
        let body: Value = serde_json::from_slice(&bytes).map_err(|_| ApiError::validation())?;
        let password = crate::api::string(&body, "password", 1, 256)?.to_owned();
        let permit = admin
            .permits
            .clone()
            .try_acquire_owned()
            .map_err(|_| ApiError::new(429, "Try again shortly"))?;
        let hash = admin.hash.clone();
        let valid = tokio::task::spawn_blocking(move || {
            let _permit = permit;
            PasswordHash::new(&hash).is_ok_and(|hash| {
                Argon2::default()
                    .verify_password(password.as_bytes(), &hash)
                    .is_ok()
            })
        })
        .await
        .map_err(ApiError::internal)?;
        if !valid {
            return Err(ApiError::new(401, "Incorrect password"));
        }
        let token = random_token();
        let digest = accounts::digest(&token);
        let fingerprint = admin.fingerprint.clone();
        let expires = accounts::now() + 86400000;
        state.db.call(move |db| {db.execute("DELETE FROM admin_tokens WHERE expires_at<=? OR password_version!=?",params![accounts::now(),fingerprint])?;db.execute("INSERT INTO admin_tokens(token_hash,expires_at,password_version) VALUES(?,?,?)",params![digest,expires,fingerprint])?;Ok(())}).await?;
        let mut response = Json(json!({"expiresAt":expires})).into_response();
        response.headers_mut().insert(
            header::SET_COOKIE,
            cookie_header(&headers, &token, 86400).parse().unwrap(),
        );
        return Ok(response);
    }
    let token = cookie(&headers).ok_or_else(|| ApiError::new(401, "Admin sign-in required"))?;
    let digest = accounts::digest(&token);
    let fingerprint = admin.fingerprint.clone();
    let session=state.db.call(move |db|one(db,"SELECT expires_at FROM admin_tokens WHERE token_hash=? AND expires_at>? AND password_version=?",params![digest,accounts::now(),fingerprint])).await?.ok_or_else(||ApiError::new(401,"Admin session expired"))?;
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
        let mut response = Json(json!({"ok":true})).into_response();
        response.headers_mut().insert(
            header::SET_COOKIE,
            cookie_header(&headers, "", 0).parse().unwrap(),
        );
        return Ok(response);
    }
    if path != "/api/admin/dashboard" || method != Method::GET {
        return Err(ApiError::new(404, "Unknown admin route"));
    }
    let query: HashMap<String, String> = serde_urlencoded::from_str(uri.query().unwrap_or(""))
        .map_err(|_| ApiError::validation())?;
    if query.values().any(|v| v.len() > 100) {
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
        let rows=all(db,"SELECT u.id,u.username,u.bio,u.created_at AS createdAt,(u.password_hash IS NULL) AS isGuest,(SELECT count(*) FROM solves s WHERE s.user_id=u.id) AS solves,(SELECT count(*) FROM sessions s WHERE s.user_id=u.id) AS sessions FROM users u WHERE (? OR u.password_hash IS NOT NULL) AND instr(lower(u.username),?)>0 ORDER BY u.created_at DESC,u.id LIMIT 50 OFFSET ?",params![guests,q,page*50])?;
        Ok(json!({"counts":counts,"matching":matching["count"],"rows":rows,"page":page}))
    }).await?;
    Ok(
        Json(json!({"expiresAt":session["expires_at"],"traffic":traffic,"users":users}))
            .into_response(),
    )
}
