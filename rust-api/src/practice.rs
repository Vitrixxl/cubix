//! Stable puzzle / scramble / solve-mode labels, shared with the frontend registry.
use crate::{
    db::all,
    error::{ApiError, Result},
};
use rusqlite::Connection;
use serde_json::{Value, json};
use std::{collections::HashMap, sync::OnceLock};
fn registry() -> &'static Value {
    static DATA: OnceLock<Value> = OnceLock::new();
    DATA.get_or_init(|| {
        serde_json::from_str(include_str!("../../data/puzzles.json")).expect("puzzle registry")
    })
}
fn puzzle(id: &str) -> Result<&'static Value> {
    registry()["puzzles"]
        .as_array()
        .unwrap()
        .iter()
        .find(|p| p["id"] == id)
        .ok_or_else(ApiError::validation)
}
fn text<'a>(value: &'a Value, key: &str) -> Option<&'a str> {
    value.get(key).and_then(Value::as_str)
}
fn supplied<'a>(value: &'a Value, key: &str) -> Result<Option<&'a str>> {
    value
        .get(key)
        .map(|v| v.as_str().ok_or_else(ApiError::validation))
        .transpose()
}
pub fn puzzle_of(value: &Value) -> String {
    text(value, "puzzle_id")
        .map(str::to_owned)
        .unwrap_or_else(|| {
            value["cube_size"]
                .as_i64()
                .unwrap_or(3)
                .to_string()
                .repeat(3)
        })
}
#[derive(Debug, PartialEq)]
pub struct Context {
    pub puzzle: String,
    pub solve_mode: String,
    pub scramble_type: String,
}
impl Context {
    pub fn of(value: &Value) -> Self {
        Self {
            puzzle: puzzle_of(value),
            solve_mode: text(value, "solve_mode").unwrap_or("standard").into(),
            scramble_type: text(value, "scramble_type")
                .unwrap_or(
                    if value["mode"] == "training"
                        || value["algorithms"].is_array()
                        || value["case_id"].as_str().is_some_and(|s| !s.is_empty())
                    {
                        "case"
                    } else {
                        "random-moves"
                    },
                )
                .into(),
        }
    }
    pub fn from_body(body: &Value, fallback: Option<&Value>, training: bool) -> Result<Self> {
        let legacy_size = body
            .get("cubeSize")
            .map(|v| {
                v.as_i64()
                    .filter(|s| (2..=7).contains(s))
                    .ok_or_else(ApiError::validation)
            })
            .transpose()?;
        let inherited = fallback.map(Self::of);
        let id = supplied(body, "puzzle")?
            .map(str::to_owned)
            .or_else(|| legacy_size.map(|s| s.to_string().repeat(3)))
            .or_else(|| inherited.as_ref().map(|c| c.puzzle.clone()))
            .unwrap_or("333".into());
        let info = puzzle(&id)?;
        if legacy_size.is_some_and(|size| info["cubeSize"].as_i64() != Some(size)) {
            return Err(ApiError::new(400, "Puzzle and cube size do not match."));
        }
        let mode = supplied(body, "solveMode")?
            .or_else(|| inherited.as_ref().map(|c| c.solve_mode.as_str()))
            .unwrap_or("standard");
        let kind = supplied(body, "scrambleType")?
            .or_else(|| inherited.as_ref().map(|c| c.scramble_type.as_str()))
            .unwrap_or(if training {
                "case"
            } else if info["cubeSize"].is_null() {
                "competition"
            } else {
                "random-moves"
            });
        validate_mode(mode)?;
        if (training && kind != "case")
            || (!training
                && !info["scrambles"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .any(|v| v == kind))
        {
            return Err(ApiError::new(400, "Scramble type and puzzle do not match."));
        }
        Ok(Self {
            puzzle: id,
            solve_mode: mode.into(),
            scramble_type: kind.into(),
        })
    }
    pub fn cube_size(&self) -> Option<i64> {
        puzzle(&self.puzzle).ok()?.get("cubeSize")?.as_i64()
    }
}
fn validate_mode(mode: &str) -> Result<()> {
    if !registry()["solveModes"]
        .as_array()
        .unwrap()
        .iter()
        .any(|m| m["id"] == mode)
    {
        return Err(ApiError::validation());
    }
    Ok(())
}
pub struct Filter {
    pub puzzle: String,
    pub solve_mode: String,
    pub scramble_type: Option<String>,
}
pub fn query(query: &HashMap<String, String>) -> Result<Filter> {
    let id = match query.get("puzzle") {
        Some(id) => id.clone(),
        None => {
            let size = query
                .get("cubeSize")
                .map(|s| s.parse::<i64>())
                .transpose()
                .map_err(|_| ApiError::validation())?
                .unwrap_or(3);
            if !(2..=7).contains(&size) {
                return Err(ApiError::validation());
            }
            size.to_string().repeat(3)
        }
    };
    let info = puzzle(&id)?;
    let mode = query
        .get("solveMode")
        .map(String::as_str)
        .unwrap_or("standard");
    validate_mode(mode)?;
    let kind = query.get("scrambleType").cloned();
    if kind.as_ref().is_some_and(|k| {
        k != "case" && !info["scrambles"].as_array().unwrap().iter().any(|v| v == k)
    }) {
        return Err(ApiError::validation());
    }
    Ok(Filter {
        puzzle: id,
        solve_mode: mode.into(),
        scramble_type: kind,
    })
}
pub fn catalog(values: &Value, filter: &Filter) -> Value {
    json!(
        values
            .as_array()
            .unwrap()
            .iter()
            .filter(|c| puzzle_of(c) == filter.puzzle)
            .collect::<Vec<_>>()
    )
}
pub fn migrate(db: &Connection) -> Result<()> {
    db.execute_batch("BEGIN IMMEDIATE")?;
    let result = (|| {
        for table in ["sessions", "solves"] {
            let columns = all(db, &format!("PRAGMA table_info({table})"), [])?;
            if !columns.iter().any(|c| c["name"] == "puzzle_id") {
                // Promote numeric cube size to a puzzle identifier before making cube_size nullable.
                db.execute_batch(&format!("ALTER TABLE {table} ADD COLUMN puzzle_id TEXT NOT NULL DEFAULT '333';
                    UPDATE {table} SET puzzle_id=CAST(cube_size AS TEXT)||CAST(cube_size AS TEXT)||CAST(cube_size AS TEXT);
                    DROP INDEX IF EXISTS idx_{table}_cube;
                    ALTER TABLE {table} DROP COLUMN cube_size;
                    ALTER TABLE {table} ADD COLUMN cube_size INTEGER CHECK(cube_size BETWEEN 2 AND 7);
                    UPDATE {table} SET cube_size=CAST(substr(puzzle_id,1,1) AS INTEGER);
                    ALTER TABLE {table} ADD COLUMN solve_mode TEXT NOT NULL DEFAULT 'standard';
                    ALTER TABLE {table} ADD COLUMN scramble_type TEXT NOT NULL DEFAULT 'random-moves';"))?;
                let training = if table == "sessions" {
                    "mode='training'"
                } else {
                    "case_id IS NOT NULL AND case_id<>''"
                };
                db.execute_batch(&format!(
                    "UPDATE {table} SET scramble_type='case' WHERE {training}"
                ))?;
            }
            db.execute_batch(&format!("CREATE INDEX IF NOT EXISTS idx_{table}_practice ON {table}(user_id,puzzle_id,solve_mode,scramble_type,created_at)"))?;
        }
        Ok(())
    })();
    if result.is_ok() {
        db.execute_batch("COMMIT")?;
    } else {
        let _ = db.execute_batch("ROLLBACK");
    }
    result
}
