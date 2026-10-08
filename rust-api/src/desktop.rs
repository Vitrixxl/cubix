//! Desktop downloads: the Electron shell packaged for Linux and Windows, and the lighter Tauri shell
//! (desktop/tauri) beside it, which the landing page's install commands fetch (`/install.sh`, `/install.ps1`).
//!
//! The shell only opens the web app this server serves, so it changes rarely: `scripts/deploy.ts`
//! builds it on the developer's machine, as it does the APK, and uploads it here with the admin
//! password only when its version (a hash of the shell's sources) changed. The files live next to
//! the APK, beside the database, and survive container rebuilds.
use crate::{
    AppState,
    error::{ApiError, Result},
    release,
};
use axum::{
    Json,
    body::{Body, Bytes},
    extract::{Path, State},
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
};
use serde_json::{Map, Value, json};
use sha2::{Digest, Sha256};
use std::path::PathBuf;

/// The packages served: file name, content type and the first bytes every such file starts with.
const FILES: [(&str, &str, &[u8]); 4] = [
    ("cubix-linux-x64.tar.gz", "application/gzip", b"\x1f\x8b"),
    ("cubix-windows-x64.zip", "application/zip", b"PK\x03\x04"),
    ("cubix-tauri-linux-x64.tar.gz", "application/gzip", b"\x1f\x8b"),
    ("cubix-tauri-windows-x64.zip", "application/zip", b"PK\x03\x04"),
];
pub const PATH: &str = "/api/desktop";

fn dir() -> PathBuf {
    release::apk_dir().join("desktop")
}
fn file(name: &str) -> Result<(&'static str, &'static str, &'static [u8])> {
    FILES
        .into_iter()
        .find(|(file, _, _)| *file == name)
        .ok_or_else(|| ApiError::new(404, "Unknown desktop package"))
}
/// What was uploaded for a package, `null` when nothing was.
fn metadata(name: &str) -> Value {
    std::fs::read(dir().join(format!("{name}.json")))
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .filter(|_| dir().join(name).is_file())
        .unwrap_or(Value::Null)
}
/// `GET /api/desktop`: every package uploaded, with its address, size, digest and version.
pub async fn info() -> Json<Value> {
    let mut packages = Map::new();
    for (name, _, _) in FILES {
        let meta = metadata(name);
        if !meta.is_null() {
            packages.insert(
                name.to_owned(),
                json!({ "url": format!("{PATH}/{name}"), "size": meta["size"], "sha256": meta["sha256"], "version": meta["version"], "commit": meta["commit"], "uploadedAt": meta["uploadedAt"] }),
            );
        }
    }
    Json(Value::Object(packages))
}
/// `GET /api/desktop/{name}` streams a package: a hundred megabytes never sit in memory.
pub async fn download(Path(name): Path<String>) -> Result<Response> {
    let (name, kind, _) = file(&name)?;
    if metadata(name).is_null() {
        return Err(ApiError::new(404, "This package has not been uploaded to this server yet"));
    }
    let file = tokio::fs::File::open(dir().join(name))
        .await
        .map_err(|_| ApiError::new(404, "This package has not been uploaded to this server yet"))?;
    let size = file.metadata().await.map_err(ApiError::internal)?.len();
    Ok((
        [
            (header::CONTENT_TYPE, kind.to_owned()),
            (header::CONTENT_LENGTH, size.to_string()),
            (header::CONTENT_DISPOSITION, format!("attachment; filename=\"{name}\"")),
        ],
        Body::from_stream(tokio_util::io::ReaderStream::new(file)),
    )
        .into_response())
}
/// `PUT /api/desktop/{name}` with `Authorization: Bearer <admin password>`, `X-Cubix-Version`
/// (the shell's version) and `X-Cubix-Commit` stores a package atomically.
pub async fn upload(
    State(state): State<AppState>,
    Path(name): Path<String>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<Response> {
    release::authorize(&state, &headers).await?;
    let (name, _, magic) = file(&name)?;
    let text = |key: &str| headers.get(key).and_then(|v| v.to_str().ok()).map(str::trim).filter(|v| !v.is_empty()).map(str::to_owned);
    let version = text("x-cubix-version")
        .filter(|v| v.len() <= 64 && v.bytes().all(|b| b.is_ascii_alphanumeric() || b"._-".contains(&b)))
        .ok_or_else(|| ApiError::new(422, "X-Cubix-Version must name the desktop version"))?;
    let commit = text("x-cubix-commit")
        .filter(|v| v.len() <= 64 && v.bytes().all(|b| b.is_ascii_hexdigit()))
        .ok_or_else(|| ApiError::new(422, "X-Cubix-Commit must be a hexadecimal commit"))?;
    if body.len() < 1024 || !body.starts_with(magic) {
        return Err(ApiError::new(422, "The body is not this package"));
    }
    let meta = json!({
        "version": version,
        "commit": commit,
        "sha256": format!("{:x}", Sha256::digest(&body)),
        "size": body.len(),
        "uploadedAt": crate::accounts::now(),
    });
    let dir = dir();
    tokio::task::spawn_blocking(move || -> std::io::Result<()> {
        std::fs::create_dir_all(&dir)?;
        let temporary = dir.join(format!("{name}.tmp"));
        std::fs::write(&temporary, &body)?;
        std::fs::rename(&temporary, dir.join(name))?;
        let temporary = dir.join(format!("{name}.json.tmp"));
        std::fs::write(&temporary, serde_json::to_vec_pretty(&meta)?)?;
        std::fs::rename(&temporary, dir.join(format!("{name}.json")))
    })
    .await
    .map_err(ApiError::internal)?
    .map_err(ApiError::internal)?;
    println!("Stored desktop package {name} ({version})");
    Ok((StatusCode::OK, info().await).into_response())
}
