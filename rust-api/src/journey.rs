//! Personal setup: the puzzles and methods the player can solve.
use crate::{api, db::{one, required}, error::{ApiError, Result}, practice};
use rusqlite::{Connection, params};
use serde_json::{Value, json};

fn timestamp(db: &Connection, v: &Value, name: &str) -> Result<()> {
    let at = api::string(v, name, 24, 24)?;
    if one(db, "SELECT strftime('%Y-%m-%dT%H:%M:%fZ',?,'+0 days') AS at", [at])?.is_none_or(|row| row["at"] != at) {
        return Err(ApiError::validation());
    }
    Ok(())
}
pub fn put(db: &Connection, uid: &str, body: &Value) -> Result<Value> {
    let key = api::string(body, "key", 1, 64)?;
    // The profile is the one entry left: personal goals were retired.
    if key != "profile" { return Err(ApiError::validation()); }
    let v = body.get("value").ok_or_else(ApiError::validation)?;
    if v.to_string().len() > 2048 { return Err(ApiError::validation()); }
    // The level is optional: older profiles kept one, setup no longer asks for it.
    if v["kind"] != "profile" || v.get("level").is_some_and(|level| !["new", "beginner", "intermediate", "advanced"].iter().any(|l| level == *l)) {
        return Err(ApiError::validation());
    }
    let priority = v.get("priority").ok_or_else(ApiError::validation)?;
    if !priority.is_null() { practice::Context::from_body(&json!({"puzzle":priority}), None, false)?; }
    timestamp(db, v, "completedAt")?;
    let known = v["knownPuzzles"].as_array().filter(|p| p.len() <= 11).ok_or_else(ApiError::validation)?;
    let mut seen = std::collections::HashSet::new();
    for p in known {
        let p = p.as_str().ok_or_else(ApiError::validation)?;
        if !seen.insert(p) { return Err(ApiError::validation()); }
        practice::Context::from_body(&json!({"puzzle":p}), None, false)?;
    }
    let methods: Value = serde_json::from_str(include_str!("../../data/method-ids.json")).map_err(ApiError::internal)?;
    if let Some(priority_method) = v.get("priorityMethod") {
        if !methods[v["priority"].as_str().unwrap_or("")].as_array().is_some_and(|list| list.contains(priority_method)) { return Err(ApiError::validation()); }
    }
    let learning = v.get("learningPuzzles").map(|p| p.as_array().filter(|p| p.len() <= 11).ok_or_else(ApiError::validation)).transpose()?;
    if let Some(puzzles) = learning {
        let mut selected = std::collections::HashSet::new();
        for p in puzzles {
            let p = p.as_str().ok_or_else(ApiError::validation)?;
            if !selected.insert(p) { return Err(ApiError::validation()); }
            practice::Context::from_body(&json!({"puzzle":p}), None, false)?;
        }
        if (priority.is_null() && !puzzles.is_empty()) || (!priority.is_null() && !puzzles.contains(priority)) { return Err(ApiError::validation()); }
    }
    for (field, puzzles) in [("knownMethods", Some(known)), ("learningMethods", learning)] {
        if let Some(value) = v.get(field) {
            let map = value.as_object().ok_or_else(ApiError::validation)?;
            let puzzles = puzzles.ok_or_else(ApiError::validation)?;
            for (puzzle, list) in map {
                if !puzzles.iter().any(|p| p == puzzle) { return Err(ApiError::validation()); }
                let list = list.as_array().ok_or_else(ApiError::validation)?;
                let available = methods[puzzle].as_array().ok_or_else(ApiError::validation)?;
                let mut selected = std::collections::HashSet::new();
                for id in list {
                    if !available.contains(id) || !selected.insert(id.as_str().unwrap_or("")) { return Err(ApiError::validation()); }
                }
            }
        }
    }
    // Separate statements keep the change-feed trigger's REPLACE policy effective on updates.
    if one(db, "SELECT id FROM personal_entries WHERE user_id=? AND key=?", params![uid, key])?.is_some() {
        db.execute("UPDATE personal_entries SET value=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE user_id=? AND key=?", params![v.to_string(), uid, key])?;
    } else {
        db.execute("INSERT INTO personal_entries(user_id,key,value) VALUES(?,?,?)", params![uid, key, v.to_string()])?;
    }
    let mut row = required(db, "SELECT * FROM personal_entries WHERE user_id=? AND key=?", params![uid, key], "Unknown entry")?;
    row["value"] = v.clone();
    Ok(row)
}
