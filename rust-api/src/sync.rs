//! Durable, idempotent uploads and an incremental, account-scoped change feed.
use crate::{
    AppState, api,
    db::{all, one},
    error::{ApiError, Result},
};
use rusqlite::{Connection, params};
use serde_json::{Value, json};
use std::collections::HashMap;

pub fn migrate(db: &Connection) -> Result<()> {
    let fresh = one(
        db,
        "SELECT name FROM sqlite_master WHERE name='sync_changes'",
        [],
    )?
    .is_none();
    db.execute_batch(
        "BEGIN IMMEDIATE;
        CREATE TABLE IF NOT EXISTS sync_receipts (
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          operation_id TEXT NOT NULL, payload TEXT NOT NULL, result TEXT NOT NULL,
          PRIMARY KEY(user_id,operation_id));
        CREATE TABLE IF NOT EXISTS sync_changes (
          seq INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL,
          kind TEXT NOT NULL, entity_id INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0,
          UNIQUE(user_id,kind,entity_id));
        CREATE INDEX IF NOT EXISTS idx_sync_owner ON sync_changes(user_id,seq);",
    )?;
    for table in ["sessions", "solves"] {
        for (event, row, deleted) in [
            ("INSERT", "NEW", 0),
            ("UPDATE", "NEW", 0),
            ("DELETE", "OLD", 1),
        ] {
            db.execute_batch(&format!("CREATE TRIGGER IF NOT EXISTS sync_{table}_{event} AFTER {event} ON {table}
              WHEN {row}.user_id IS NOT NULL BEGIN
              INSERT OR REPLACE INTO sync_changes(user_id,kind,entity_id,deleted) VALUES({row}.user_id,'{table}',{row}.id,{deleted}); END;"))?;
        }
        if fresh {
            db.execute_batch(&format!("INSERT INTO sync_changes(user_id,kind,entity_id) SELECT user_id,'{table}',id FROM {table} WHERE user_id IS NOT NULL;"))?;
        }
    }
    db.execute_batch("COMMIT;")?;
    Ok(())
}

pub fn pull(db: &Connection, uid: &str, after: i64) -> Result<Value> {
    let rows = all(
        db,
        "SELECT * FROM sync_changes WHERE user_id=? AND seq>? ORDER BY seq LIMIT 500",
        params![uid, after],
    )?;
    let cursor = rows.last().and_then(|r| r["seq"].as_i64()).unwrap_or(after);
    let more = rows.len() == 500;
    let mut changes = Vec::new();
    for row in rows {
        let table = row["kind"].as_str().unwrap();
        let mut value = one(
            db,
            &format!("SELECT * FROM {table} WHERE user_id=? AND id=?"),
            params![uid, row["entity_id"].as_i64()],
        )?;
        if table == "sessions"
            && let Some(ref mut value) = value
        {
            value["case_ids"] = serde_json::from_str(value["case_ids"].as_str().unwrap_or("[]"))
                .map_err(ApiError::internal)?;
        }
        changes.push(json!({"kind":table,"id":row["entity_id"],"value":value}));
    }
    Ok(json!({"changes":changes,"cursor":cursor,"more":more}))
}

pub fn push(
    db: &mut Connection,
    state: &AppState,
    uid: &str,
    token: &str,
    body: &Value,
) -> Result<Value> {
    let operations = body["operations"]
        .as_array()
        .filter(|a| !a.is_empty() && a.len() <= 100)
        .ok_or_else(ApiError::validation)?;
    db.execute_batch("BEGIN IMMEDIATE")?;
    let result = (|| {
        let mut results = Vec::new();
        for op in operations {
            let operation_id = api::string(op, "id", 1, 100)?;
            let payload = op.to_string();
            if let Some(receipt) = one(
                db,
                "SELECT payload,result FROM sync_receipts WHERE user_id=? AND operation_id=?",
                params![uid, operation_id],
            )? {
                if receipt["payload"] != payload {
                    return Err(ApiError::new(
                        409,
                        "Operation ID already used with different data",
                    ));
                }
                let value: Value = serde_json::from_str(receipt["result"].as_str().unwrap())
                    .map_err(ApiError::internal)?;
                results.push(json!({"id":operation_id,"value":value}));
                continue;
            }
            let method = api::string(op, "method", 3, 6)?;
            let path = api::string(op, "path", 1, 100)?;
            let solve = path
                .strip_prefix("solves/")
                .is_some_and(|s| s.parse::<u64>().is_ok_and(|id| id > 0));
            if !((method == "POST" && ["sessions", "solves"].contains(&path))
                || (solve && ["PATCH", "DELETE"].contains(&method))
                || (method == "PATCH" && path == "account"))
            {
                return Err(ApiError::validation());
            }
            let mut value =
                match api::route(db, state, method, path, &HashMap::new(), &op["body"], token) {
                    // Deletion wins over a late offline edit from another device.
                    Err(error) if error.status == 404 && solve => Value::Null,
                    result => result?,
                };
            if method == "POST" {
                let at = api::string(op, "createdAt", 24, 24)?;
                let valid = one(db, "SELECT strftime('%Y-%m-%dT%H:%M:%fZ',?) AS at", [at])?;
                if valid.is_none_or(|v| v["at"] != at) {
                    return Err(ApiError::validation());
                }
                db.execute(
                    &format!("UPDATE {path} SET created_at=? WHERE id=? AND user_id=?"),
                    params![at, value["id"].as_i64(), uid],
                )?;
                value["created_at"] = json!(at);
            }
            db.execute(
                "INSERT INTO sync_receipts(user_id,operation_id,payload,result) VALUES(?,?,?,?)",
                params![uid, operation_id, payload, value.to_string()],
            )?;
            results.push(json!({"id":operation_id,"value":value}));
        }
        Ok(json!({"results":results}))
    })();
    if result.is_ok() {
        db.execute_batch("COMMIT")?;
    } else {
        db.execute_batch("ROLLBACK")?;
    }
    result
}
