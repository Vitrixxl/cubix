mod accounts;
mod activity;
mod admin;
mod admin_data;
mod api;
mod catalog;
mod db;
mod duel;
mod error;
mod live;
mod journey;
mod practice;
mod release;
mod stats;
mod sync;
mod traffic;
mod web;

use axum::{
    Router,
    extract::DefaultBodyLimit,
    http::{HeaderValue, header},
    routing::{any, get, put},
};
use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{Arc, Mutex},
};
use tokio::sync::Semaphore;
use tower_http::{cors::CorsLayer, set_header::SetResponseHeaderLayer};

#[derive(Clone)]
pub struct AppState {
    db: db::Db,
    catalog: Arc<catalog::Catalog>,
    hub: Arc<live::Hub>,
    duel: Arc<duel::Arena>,
    attempts: Arc<Mutex<HashMap<String, (u32, i64)>>>,
    passwords: Arc<Semaphore>,
    admin: Arc<admin::Admin>,
    traffic: Arc<traffic::Traffic>,
}
/// Resolves once the process that started this server has exited, when `CUBIX_EXIT_WITH_PARENT`
/// is set. Test runners spawn one server per test; a runner killed mid-way must not leave
/// hundreds of servers behind. A parent that dies gets replaced by init (or a subreaper).
async fn orphaned() {
    if std::env::var_os("CUBIX_EXIT_WITH_PARENT").is_none() {
        std::future::pending::<()>().await;
    }
    let parent = std::os::unix::process::parent_id();
    loop {
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        if std::os::unix::process::parent_id() != parent {
            return;
        }
    }
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
    // Docker supplies .env through Compose; direct launches also load the local file.
    dotenvy::dotenv().ok();
    let args: Vec<_> = std::env::args().collect();
    if args.iter().any(|arg| arg == "--version") {
        println!(
            "cubix-api {} (build {})",
            env!("CARGO_PKG_VERSION"),
            release::build_number().map_or("unknown".into(), |b| b.to_string())
        );
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
    // `cubix-api admin-token` (or `--admin-token`), run inside the container: the only way to
    // obtain the administration token. It shares the database, so the server may keep running.
    if args.get(1).is_some_and(|arg| arg == "admin-token")
        || args.iter().any(|arg| arg == "--admin-token")
    {
        if args.iter().any(|arg| arg == "--revoke") {
            let existed = db
                .call(|db| admin::disable(db))
                .await
                .map_err(|e| e.message)?;
            println!(
                "{}",
                if existed {
                    "Administration disabled: the admin token and every admin session are revoked."
                } else {
                    "Administration was already disabled."
                }
            );
        } else {
            let token = db.call(|db| admin::rotate(db)).await.map_err(|e| e.message)?;
            println!("{token}");
            println!(
                "Paste this token on /admin; it is shown only once. Running admin-token again replaces it and signs every admin session out."
            );
        }
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
    let log = activity::Log::new(db.clone());
    let traffic = Arc::new(traffic::Traffic::new(log.clone()));
    let admin = Arc::new(admin::Admin::new()?);
    let duel = Arc::new(duel::Arena::new(log.clone()));
    tokio::spawn(duel::run(duel.clone()));
    let state = AppState {
        admin,
        traffic: traffic.clone(),
        db,
        catalog: Arc::new(catalog::Catalog::load()),
        hub: Arc::new(live::Hub::default()),
        duel: duel.clone(),
        attempts: Arc::new(Mutex::new(HashMap::new())),
        passwords: Arc::new(Semaphore::new(4)),
    };
    let admin_api = Router::new()
        .route("/api/admin/live", get(admin::upgrade))
        .route("/api/admin/{*path}", any(admin::dispatch))
        .with_state(state.clone())
        .layer(DefaultBodyLimit::max(4096))
        .layer(SetResponseHeaderLayer::overriding(
            header::CACHE_CONTROL,
            HeaderValue::from_static("no-store"),
        ));
    let api = Router::new()
        .route("/api/live", get(live::upgrade))
        .route("/api/duel", get(duel::upgrade))
        // The APK upload carries a whole Android build, far above the JSON limit below.
        .route(
            "/api/mobile/apk",
            get(release::apk)
                .put(release::upload)
                .layer(DefaultBodyLimit::max(256 * 1024 * 1024)),
        )
        // Over-the-air JavaScript updates: the bundle weighs a few megabytes.
        .route(
            "/api/mobile/updates/assets/{hash}",
            get(release::asset)
                .put(release::upload_asset)
                .layer(DefaultBodyLimit::max(64 * 1024 * 1024)),
        )
        .route("/api/mobile/updates", put(release::publish))
        .route("/api/mobile/updates/manifest", get(release::manifest))
        .route("/api/{*path}", any(api::dispatch))
        .with_state(state)
        .layer(DefaultBodyLimit::max(2 * 1024 * 1024))
        .layer(SetResponseHeaderLayer::overriding(
            header::CACHE_CONTROL,
            HeaderValue::from_static("no-store"),
        ))
        .layer(CorsLayer::permissive());
    let mut app = api.merge(admin_api);
    match web::directory() {
        Some(dir) => {
            println!("Cubix web: {}", dir.display());
            app = app.fallback_service(web::router(dir));
        }
        None => println!("Cubix web: not built, serving the API only"),
    }
    let app = app
        .layer(axum::middleware::from_fn_with_state(
            traffic,
            traffic::monitor,
        ));
    // Optional extra listeners let local load generators use separate TCP port pools.
    // All listeners share the same runtime, SQLite worker, authentication and live hub.
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
        servers.spawn(async move {
            axum::serve(
                listener,
                app.into_make_service_with_connect_info::<std::net::SocketAddr>(),
            )
            .await
        });
    }
    let mut terminate =
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())?;
    let outcome: Result<(), Box<dyn std::error::Error>> = tokio::select! {
        _=tokio::signal::ctrl_c()=>Ok(()),
        _=terminate.recv()=>Ok(()),
        _=orphaned()=>{eprintln!("Parent process gone; stopping."); Ok(())},
        result=servers.join_next()=>match result { Some(Ok(Err(e)))=>Err(e.into()), Some(Err(e))=>Err(e.into()), _=>Ok(()) },
    };
    servers.abort_all();
    // Requests already answered reach the persistent log before the process exits.
    log.flush().await;
    outcome
}
