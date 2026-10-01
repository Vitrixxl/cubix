//! Personal setup and goals. Separate keys prevent one device from overwriting another device's new goal.
use crate::{api, AppState, db::{one, required}, error::{ApiError, Result}, practice};
use rusqlite::{Connection, params};
use serde_json::{Value, json};

fn valid_key(key: &str) -> bool {
    if key == "profile" { return true; }
    let Some(id) = key.strip_prefix("goal:") else { return false; };
    id.len() == 36 && id.bytes().enumerate().all(|(i, c)| {
        if [8, 13, 18, 23].contains(&i) { c == b'-' } else { c.is_ascii_digit() || (b'a'..=b'f').contains(&c) }
    })
}
fn timestamp(db: &Connection, v: &Value, name: &str) -> Result<()> {
    let at = api::string(v, name, 24, 24)?;
    if one(db, "SELECT strftime('%Y-%m-%dT%H:%M:%fZ',?,'+0 days') AS at", [at])?.is_none_or(|row| row["at"] != at) {
        return Err(ApiError::validation());
    }
    Ok(())
}
pub fn put(db: &Connection, state: &AppState, uid: &str, body: &Value) -> Result<Value> {
    let key = api::string(body, "key", 1, 64)?;
    if !valid_key(key) { return Err(ApiError::validation()); }
    let v = body.get("value").ok_or_else(ApiError::validation)?;
    if v.to_string().len() > 2048 { return Err(ApiError::validation()); }
    if key == "profile" {
        if v["kind"] != "profile" || !["new", "beginner", "intermediate", "advanced"].iter().any(|l| v["level"] == *l) {
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
    } else if !v.is_null() {
        let context = practice::Context::from_body(v, None, false)?;
        if v.get("puzzle").is_none() { return Err(ApiError::validation()); }
        timestamp(db, v, "createdAt")?;
        if let Some(due) = v.get("dueDate") {
            let date = due.as_str().filter(|s| s.len() == 10).ok_or_else(ApiError::validation)?;
            if one(db, "SELECT date(?,'+0 days') AS day", [date])?.is_none_or(|r| r["day"] != date) { return Err(ApiError::validation()); }
        }
        match v["kind"].as_str() {
            Some("time") => {
                if !["single", "ao5"].iter().any(|m| v["metric"] == *m) || v["targetMs"].as_u64().is_none_or(|n| n == 0 || n > 86_400_000)
                    || v.get("solveMode").is_none() { return Err(ApiError::validation()); }
            }
            Some("learning") => {
                let set = v.get("setId").ok_or_else(ApiError::validation)?;
                if !set.is_null() && !state.catalog.by_id.values().any(|c| c["set"] == *set && practice::puzzle_of(c) == context.puzzle) { return Err(ApiError::validation()); }
            }
            _ => return Err(ApiError::validation()),
        }
        // Tombstones are kept for offline devices, but only active goals count toward the limit.
        let current = one(db, "SELECT value FROM personal_entries WHERE user_id=? AND key=?", params![uid, key])?;
        if current.is_none_or(|r| r["value"] == "null") {
            let count = one(db, "SELECT count(*) AS n FROM personal_entries WHERE user_id=? AND key!='profile' AND value!='null'", [uid])?;
            if count.is_some_and(|r| r["n"].as_i64().unwrap_or(0) >= 100) { return Err(ApiError::new(400, "Keep at most 100 personal goals.")); }
        }
    }
    // Separate statements keep the change-feed trigger's REPLACE policy effective on updates.
    if one(db, "SELECT id FROM personal_entries WHERE user_id=? AND key=?", params![uid, key])?.is_some() {
        db.execute("UPDATE personal_entries SET value=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE user_id=? AND key=?", params![v.to_string(), uid, key])?;
    } else {
        db.execute("INSERT INTO personal_entries(user_id,key,value) VALUES(?,?,?)", params![uid, key, v.to_string()])?;
    }
    let mut row = required(db, "SELECT * FROM personal_entries WHERE user_id=? AND key=?", params![uid, key], "Unknown goal")?;
    row["value"] = v.clone();
    Ok(row)
}
