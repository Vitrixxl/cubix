use crate::error::{ApiError, Result};
use rusqlite::{Connection, Params, types::ValueRef};
use serde_json::{Map, Value};
use std::{path::Path, time::Duration};
use tokio::sync::{mpsc, oneshot};

type Job = Box<dyn FnOnce(&mut Connection) + Send>;

/// One SQLite owner thread, with bounded admission rather than one blocked thread per request.
#[derive(Clone)]
pub struct Db(mpsc::Sender<Job>);
impl Db {
    pub fn open(path: &Path) -> Result<Self> {
        if let Some(parent) = path.parent().filter(|p| !p.as_os_str().is_empty()) {
            std::fs::create_dir_all(parent).map_err(ApiError::internal)?;
        }
        let mut db = Connection::open(path)?;
        db.busy_timeout(Duration::from_secs(5))?;
        db.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")?;
        db.set_prepared_statement_cache_capacity(64);
        db.execute_batch(include_str!("schema.sql"))?;
        let columns = all(&db, "PRAGMA table_info(users)", [])?;
        for name in ["is_private", "display_name"] {
            if columns.iter().any(|c| c["name"] == name) {
                db.execute_batch(&format!("ALTER TABLE users DROP COLUMN {name}"))?;
            }
        }
        for table in ["sessions", "solves"] {
            if !all(&db, &format!("PRAGMA table_info({table})"), [])?
                .iter()
                .any(|c| c["name"] == "user_id")
            {
                db.execute_batch(&format!(
                    "ALTER TABLE {table} ADD COLUMN user_id TEXT REFERENCES users(id)"
                ))?;
            }
            db.execute_batch(&format!(
                "CREATE INDEX IF NOT EXISTS idx_{table}_owner ON {table}(user_id)"
            ))?;
        }
        crate::sync::migrate(&db)?;
        let (tx, mut rx) = mpsc::channel::<Job>(1024);
        std::thread::Builder::new()
            .name("cubix-sqlite".into())
            .spawn(move || {
                while let Some(job) = rx.blocking_recv() {
                    job(&mut db);
                }
            })
            .map_err(ApiError::internal)?;
        Ok(Self(tx))
    }
    pub async fn call<T: Send + 'static>(
        &self,
        f: impl FnOnce(&mut Connection) -> Result<T> + Send + 'static,
    ) -> Result<T> {
        let (tx, rx) = oneshot::channel();
        self.0
            .send(Box::new(move |db| {
                if !tx.is_closed() {
                    let _ = tx.send(f(db));
                }
            }))
            .await
            .map_err(ApiError::internal)?;
        rx.await.map_err(ApiError::internal)?
    }
}

pub fn all(db: &Connection, sql: &str, params: impl Params) -> Result<Vec<Value>> {
    let mut stmt = db.prepare_cached(sql)?;
    let names: Vec<String> = stmt.column_names().into_iter().map(str::to_owned).collect();
    let rows = stmt.query_map(params, |row| {
        let mut object = Map::new();
        for (i, name) in names.iter().enumerate() {
            let value = match row.get_ref(i)? {
                ValueRef::Null => Value::Null,
                ValueRef::Integer(n) => Value::from(n),
                ValueRef::Real(n) => Value::from(n),
                ValueRef::Text(s) => Value::from(String::from_utf8_lossy(s).into_owned()),
                ValueRef::Blob(_) => Value::Null,
            };
            object.insert(name.clone(), value);
        }
        Ok(Value::Object(object))
    })?;
    rows.collect::<std::result::Result<Vec<_>, _>>()
        .map_err(Into::into)
}
pub fn one(db: &Connection, sql: &str, params: impl Params) -> Result<Option<Value>> {
    Ok(all(db, sql, params)?.into_iter().next())
}
pub fn required(db: &Connection, sql: &str, params: impl Params, message: &str) -> Result<Value> {
    one(db, sql, params)?.ok_or_else(|| ApiError::new(404, message))
}
