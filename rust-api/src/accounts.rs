use crate::{
    db::{one, required},
    error::{ApiError, Result},
};
use rand::RngCore;
use rusqlite::{Connection, params};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::time::{SystemTime, UNIX_EPOCH};
pub const DAY_MS: i64 = 86_400_000;
pub fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64
}
pub fn digest(token: &str) -> String {
    format!("{:x}", Sha256::digest(token.as_bytes()))
}
pub fn public(user: &Value) -> Value {
    json!({"id":user["id"],"username":user["username"],"isGuest":user["password_hash"].is_null(),"createdAt":user["created_at"]})
}
/// 256 random bits in hexadecimal: session and admin tokens.
pub fn random_token() -> String {
    let mut bytes = [0u8; 32];
    rand::rngs::OsRng.fill_bytes(&mut bytes);
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}
/// The digest under which the token of an `Authorization: Bearer …` header is stored.
pub fn bearer_hash(authorization: &str) -> Option<String> {
    authorization.strip_prefix("Bearer ").map(digest)
}
/// The account whose unexpired token has this digest.
pub fn by_token_hash(db: &Connection, hash: &str) -> Result<Option<Value>> {
    one(
        db,
        "SELECT u.* FROM users u JOIN auth_tokens t ON t.user_id=u.id WHERE t.token_hash=? AND t.expires_at>?",
        params![hash, now()],
    )
}
pub fn auth(db: &Connection, authorization: &str) -> Result<Option<Value>> {
    match bearer_hash(authorization) {
        Some(hash) => by_token_hash(db, &hash),
        None => Ok(None),
    }
}
pub fn signed_in(db: &Connection, token: &str) -> Result<Value> {
    auth(db, token)?.ok_or_else(|| ApiError::new(401, "Please sign in again."))
}
pub fn by_username(db: &Connection, name: &str) -> Result<Option<Value>> {
    one(
        db,
        "SELECT * FROM users WHERE username=? COLLATE NOCASE AND password_hash IS NOT NULL",
        [name],
    )
}
pub fn issue(db: &Connection, user: &Value) -> Result<Value> {
    let token = random_token();
    db.execute("DELETE FROM auth_tokens WHERE expires_at<=?", [now()])?;
    db.execute(
        "INSERT INTO auth_tokens(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)",
        params![digest(&token), user["id"].as_str(), now() + 30 * DAY_MS, now()],
    )?;
    Ok(json!({"token":token,"user":public(user)}))
}
pub fn guest(db: &Connection) -> Result<Value> {
    let id = uuid::Uuid::new_v4().to_string();
    db.execute(
        "INSERT INTO users(id,username) VALUES(?,?)",
        params![id, format!("guest-{id}")],
    )?;
    let user = required(
        db,
        "SELECT * FROM users WHERE id=?",
        [id],
        "Unknown account",
    )?;
    issue(db, &user)
}
pub fn register(
    db: &mut Connection,
    username: &str,
    hash: &str,
    guest_id: Option<String>,
) -> Result<Value> {
    let tx = db.transaction()?;
    if by_username(&tx, username)?.is_some() {
        return Err(ApiError::new(409, "This username is already taken."));
    }
    let id = guest_id
        .clone()
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    if guest_id.is_some() {
        if tx.execute(
            "UPDATE users SET username=?,password_hash=? WHERE id=? AND password_hash IS NULL",
            params![username, hash, id],
        )? != 1
        {
            return Err(ApiError::new(
                409,
                "This guest already has an account. Sign in.",
            ));
        }
        tx.execute("DELETE FROM auth_tokens WHERE user_id=?", [&id])?;
    } else {
        tx.execute(
            "INSERT INTO users(id,username,password_hash) VALUES(?,?,?)",
            params![id, username, hash],
        )?;
    }
    let user = required(
        &tx,
        "SELECT * FROM users WHERE id=?",
        [id],
        "Unknown account",
    )?;
    let response = issue(&tx, &user)?;
    tx.commit()?;
    Ok(response)
}
