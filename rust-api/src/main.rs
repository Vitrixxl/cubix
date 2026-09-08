mod accounts;
mod api;
mod catalog;
mod db;
mod error;
mod social;
mod stats;

use axum::{
    Router,
    extract::DefaultBodyLimit,
    http::{HeaderValue, header},
    routing::{any, get},
};
use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{Arc, Mutex},
};
use tokio::sync::Semaphore;
use tower_http::{cors::CorsLayer, services::ServeDir, set_header::SetResponseHeaderLayer};

#[derive(Clone)]
pub struct AppState {
    db: db::Db,
    catalog: Arc<catalog::Catalog>,
    hub: Arc<social::Hub>,
    attempts: Arc<Mutex<HashMap<String, (u32, i64)>>>,
    passwords: Arc<Semaphore>,
}
fn env_or(name: &str, fallback: &str) -> String {
    std::env::var(name).unwrap_or_else(|_| fallback.to_owned())
}
fn default_db() -> PathBuf {
    std::env::var_os("CUBIX_DB")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            std::env::var_os("XDG_DATA_HOME")
                .map(PathBuf::from)
                .unwrap_or_else(|| PathBuf::from(env_or("HOME", ".")).join(".local/share"))
                .join("cubix/cubix.db")
        })
}
#[tokio::main(worker_threads = 4)]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args().collect();
    if args.iter().any(|arg| arg == "--version") {
        println!("cubix-api {}", env!("CARGO_PKG_VERSION"));
        return Ok(());
    }
    let mut host = env_or("CUBIX_HOST", "127.0.0.1");
    let mut port = env_or("PORT", "47129");
    for (i, arg) in args.iter().enumerate() {
        if arg == "--host" {
            host = args
                .get(i + 1)
                .filter(|s| !s.starts_with("--"))
                .cloned()
                .unwrap_or_else(|| "0.0.0.0".into());
        }
        if arg == "--port" {
            port = args.get(i + 1).ok_or("--port requires a value")?.clone();
        }
    }
    let path = default_db();
    let db = db::Db::open(&path).map_err(|e| format!("Database: {}", e.message))?;
    if args.iter().any(|arg| arg == "--init-db") {
        return Ok(());
    }
    if let Some(index) = args.iter().position(|arg| arg == "--import-history") {
        let name = args
            .get(index + 1)
            .ok_or("--import-history requires a username")?
            .trim()
            .to_lowercase();
        let counts = db
            .call(move |db| {
                let user = accounts::by_username(db, &name)?.ok_or_else(|| {
                    error::ApiError::new(404, "Account does not exist. Create it in Cubix first.")
                })?;
                let id = user["id"].as_str().unwrap();
                let tx = db.transaction()?;
                let sessions =
                    tx.execute("UPDATE sessions SET user_id=? WHERE user_id IS NULL", [id])?;
                let solves =
                    tx.execute("UPDATE solves SET user_id=? WHERE user_id IS NULL", [id])?;
                tx.commit()?;
                Ok((solves, sessions, name))
            })
            .await
            .map_err(|e| e.message)?;
        println!(
            "Imported {} legacy times and {} sessions into @{}.",
            counts.0, counts.1, counts.2
        );
        return Ok(());
    }
    let state = AppState {
        db,
        catalog: Arc::new(catalog::Catalog::load()),
        hub: Arc::new(social::Hub::default()),
        attempts: Arc::new(Mutex::new(HashMap::new())),
        passwords: Arc::new(Semaphore::new(4)),
    };
    let api = Router::new()
        .route("/api/social/live", get(social::upgrade))
        .route("/api/{*path}", any(api::dispatch))
        .with_state(state)
        .layer(DefaultBodyLimit::max(2 * 1024 * 1024))
        .layer(SetResponseHeaderLayer::overriding(
            header::CACHE_CONTROL,
            HeaderValue::from_static("no-store"),
        ))
        .layer(CorsLayer::permissive());
    let app = api
        .nest_service("/pwa", ServeDir::new(env_or("CUBIX_PWA", "public/pwa")))
        .fallback_service(ServeDir::new(env_or("CUBIX_ASSETS", "dist/view")))
        .layer(SetResponseHeaderLayer::if_not_present(
            header::CACHE_CONTROL,
            HeaderValue::from_static("no-cache"),
        ));
    // Optional extra listeners let local load generators use separate TCP port pools.
    // All listeners share the same runtime, SQLite worker, authentication and chat hub.
    let mut ports = vec![port];
    ports.extend(
        env_or("CUBIX_EXTRA_PORTS", "")
            .split(',')
            .filter(|p| !p.is_empty())
            .map(str::to_owned),
    );
    let mut servers = tokio::task::JoinSet::new();
    for port in ports {
        let listener = tokio::net::TcpListener::bind(format!("{host}:{port}")).await?;
        println!(
            "Cubix Rust: http://{} (db: {})",
            listener.local_addr()?,
            path.display()
        );
        let app = app.clone();
        servers.spawn(async move { axum::serve(listener, app).await });
    }
    tokio::select! {
        _=tokio::signal::ctrl_c()=>{},
        result=servers.join_next()=>{if let Some(result)=result {result??;}},
    }
    servers.abort_all();
    Ok(())
}
