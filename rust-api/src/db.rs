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
        // Profile and social features were retired: accounts only sync practice data now.
        for name in ["is_private", "display_name", "bio"] {
            if has_column(&db, "users", name)? {
                db.execute_batch(&format!("ALTER TABLE users DROP COLUMN {name}"))?;
            }
        }
        db.execute_batch("DROP TABLE IF EXISTS chat_messages; DROP TABLE IF EXISTS friendships;")?;
        for table in ["sessions", "solves"] {
            add_column_if_missing(&db, table, "user_id", "TEXT REFERENCES users(id)")?;
            db.execute_batch(&format!(
                "CREATE INDEX IF NOT EXISTS idx_{table}_owner ON {table}(user_id)"
            ))?;
        }
        for table in ["sessions", "solves"] {
            add_column_if_missing(
                &db,
                table,
                "cube_size",
                "INTEGER NOT NULL DEFAULT 3 CHECK(cube_size BETWEEN 2 AND 7)",
            )?;
            db.execute_batch(&format!("CREATE INDEX IF NOT EXISTS idx_{table}_cube ON {table}(user_id,cube_size,created_at)"))?;
        }
        // Free-text notes on a solve arrived after the first accounts.
        add_column_if_missing(&db, "solves", "comment", "TEXT")?;
        // The turns of a solve, as a smart cube records them, arrived with smart cubes.
        add_column_if_missing(&db, "solves", "solution", "TEXT")?;
        // One day's extra hours or hours taken back arrived after the weekly hours.
        add_column_if_missing(&db, "coaches", "overrides", "TEXT NOT NULL DEFAULT '[]'")?;
        // Coaches may keep to the students they have; accounts may show a picture.
        add_column_if_missing(&db, "coaches", "new_students", "INTEGER NOT NULL DEFAULT 1")?;
        add_column_if_missing(&db, "users", "avatar", "TEXT")?;
        // A coach may offer to move a session.
        add_column_if_missing(&db, "coach_bookings", "proposed_start", "INTEGER")?;
        add_column_if_missing(&db, "coach_bookings", "proposed_end", "INTEGER")?;
        // The policy and acceptance time are recorded only for bookings made with explicit consent.
        add_column_if_missing(&db, "coach_bookings", "cancellation_policy", "TEXT")?;
        add_column_if_missing(&db, "coach_bookings", "cancellation_policy_accepted_at", "INTEGER")?;
        // Pictures and videos in coaching conversations arrived after the first messages.
        for (column, definition) in [("media_id", "TEXT"), ("media_type", "TEXT"), ("media_size", "INTEGER"), ("media_name", "TEXT")] {
            add_column_if_missing(&db, "coach_messages", column, definition)?;
        }
        db.execute_batch("CREATE UNIQUE INDEX IF NOT EXISTS idx_coach_messages_media ON coach_messages(media_id) WHERE media_id IS NOT NULL")?;
        crate::coaching::sweep_media(&db)?;
        crate::practice::migrate(&db)?;
        crate::sync::migrate(&db)?;
        crate::activity::migrate(&db)?;
        // Installed after context migrations so existing databases get the same indexes.
        db.execute_batch(include_str!("query-indexes.sql"))?;
        db.execute_batch("PRAGMA optimize=0x10002;")?;
        // Personal goals and guest accounts were retired: what is left of them goes.
        db.execute("DELETE FROM personal_entries WHERE key!='profile'", [])?;
        crate::admin_data::purge_guests(&mut db)?;
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
pub fn has_column(db: &Connection, table: &str, column: &str) -> Result<bool> {
    Ok(all(db, &format!("PRAGMA table_info({table})"), [])?
        .iter()
        .any(|c| c["name"] == column))
}
/// Adds a column that older databases lack; `definition` is its type and constraints.
pub fn add_column_if_missing(
    db: &Connection,
    table: &str,
    column: &str,
    definition: &str,
) -> Result<()> {
    if !has_column(db, table, column)? {
        db.execute_batch(&format!("ALTER TABLE {table} ADD COLUMN {column} {definition}"))?;
    }
    Ok(())
}
pub fn required(db: &Connection, sql: &str, params: impl Params, message: &str) -> Result<Value> {
    one(db, sql, params)?.ok_or_else(|| ApiError::new(404, message))
}
