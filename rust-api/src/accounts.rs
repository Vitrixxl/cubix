use crate::{
    db::{one, required},
    error::{ApiError, Result},
};
use rand::RngCore;
use rusqlite::{Connection, params};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::time::{SystemTime, UNIX_EPOCH};
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
    json!({"id":user["id"],"username":user["username"],"bio":user["bio"],"isGuest":user["password_hash"].is_null(),"createdAt":user["created_at"]})
}
pub fn auth(db: &Connection, token: &str) -> Result<Option<Value>> {
    let Some(token) = token.strip_prefix("Bearer ") else {
        return Ok(None);
    };
    one(
        db,
        "SELECT u.* FROM users u JOIN auth_tokens t ON t.user_id=u.id WHERE t.token_hash=? AND t.expires_at>?",
        params![digest(token), now()],
    )
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
    let mut bytes = [0u8; 32];
    rand::rngs::OsRng.fill_bytes(&mut bytes);
    let token: String = bytes.iter().map(|b| format!("{b:02x}")).collect();
    db.execute("DELETE FROM auth_tokens WHERE expires_at<=?", [now()])?;
    db.execute(
        "INSERT INTO auth_tokens VALUES(?,?,?)",
        params![digest(&token), user["id"].as_str(), now() + 30 * 86400000],
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
