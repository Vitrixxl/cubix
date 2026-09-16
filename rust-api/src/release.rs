//! Mobile release information and the Android APK the server hands out.
//!
//! The server and the APK are built from the same commit, but not in the same place: the
//! Raspberry Pi has neither the memory for Gradle nor an ARM64 Android NDK. `scripts/deploy.ts`
//! therefore builds the APK on the developer's machine and uploads it here with the admin
//! password. The file lives next to the database, so it survives container rebuilds, and the
//! application only offers an update once an APK newer than its own build has been uploaded.
use crate::{
    AppState,
    error::{ApiError, Result},
};
use axum::{
    Json,
    body::Bytes,
    extract::State,
    http::{HeaderMap, HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::path::PathBuf;

const APK_FILE: &str = "cubix-android-arm64.apk";
const META_FILE: &str = "cubix-android-arm64.json";
/// Path the application downloads from; `info()` announces it so clients need not hard-code it.
pub const APK_PATH: &str = "/api/mobile/apk";

/// Commit time in minutes since the Unix epoch; see `CUBIX_BUILD_NUMBER` in the Dockerfile.
pub fn build_number() -> Option<u64> {
    std::env::var("CUBIX_BUILD_NUMBER")
        .ok()
        .and_then(|value| value.trim().parse().ok())
        .filter(|value| *value > 0)
}
pub fn commit() -> Option<String> {
    std::env::var("CUBIX_COMMIT")
        .ok()
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
}
/// `CUBIX_APK_DIR`, or an `apk` directory beside the SQLite database.
pub fn apk_dir() -> PathBuf {
    if let Ok(dir) = std::env::var("CUBIX_APK_DIR").map(PathBuf::from)
        && !dir.as_os_str().is_empty()
    {
        return dir;
    }
    let db = std::env::var("CUBIX_DB").unwrap_or_else(|_| "cubix.db".into());
    PathBuf::from(db)
        .parent()
        .map(|parent| parent.join("apk"))
        .unwrap_or_else(|| PathBuf::from("apk"))
}
/// Metadata written next to the APK at upload time; `null` when nothing was uploaded yet.
fn metadata() -> Value {
    std::fs::read(apk_dir().join(META_FILE))
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .filter(|value: &Value| value["build"].is_u64() && apk_dir().join(APK_FILE).is_file())
        .unwrap_or(Value::Null)
}
pub fn info() -> Value {
    let apk = metadata();
    json!({
        "version": env!("CARGO_PKG_VERSION"),
        "build": build_number(),
        "commit": commit(),
        "apk": APK_PATH,
        "apkBuild": apk["build"],
        "apkCommit": apk["commit"],
        "apkSha256": apk["sha256"],
        "apkSize": apk["size"],
        "apkUploadedAt": apk["uploadedAt"],
    })
}
/// `GET /api/mobile/apk` sends the uploaded APK; the phone's browser offers to install it.
pub async fn apk() -> Result<Response> {
    let meta = metadata();
    if meta.is_null() {
        return Err(ApiError::new(
            404,
            "No APK has been uploaded to this server yet",
        ));
    }
    let path = apk_dir().join(APK_FILE);
    let bytes = tokio::task::spawn_blocking(move || std::fs::read(path))
        .await
        .map_err(ApiError::internal)?
        .map_err(ApiError::internal)?;
    let mut response = bytes.into_response();
    let headers = response.headers_mut();
    headers.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("application/vnd.android.package-archive"),
    );
    headers.insert(
        header::CONTENT_DISPOSITION,
        HeaderValue::from_static("attachment; filename=\"cubix-android-arm64.apk\""),
    );
    if let Some(sha) = meta["sha256"].as_str()
        && let Ok(etag) = HeaderValue::from_str(&format!("\"{sha}\""))
    {
        headers.insert(header::ETAG, etag);
    }
    Ok(response)
}
/// `PUT /api/mobile/apk` with `Authorization: Bearer <admin password>`, `X-Cubix-Build` and
/// `X-Cubix-Commit` stores a new APK atomically. Uploading the same build again is harmless.
pub async fn upload(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<Response> {
    let admin = state.admin.as_ref().as_ref().ok_or_else(|| {
        ApiError::new(
            503,
            "Set CUBIX_ADMIN_PASSWORD in .env to accept APK uploads",
        )
    })?;
    let password = headers
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .map(str::trim)
        .filter(|value| !value.is_empty() && value.len() <= 256)
        .ok_or_else(|| ApiError::new(401, "Missing admin password"))?
        .to_owned();
    if !admin.verify(password).await? {
        return Err(ApiError::new(401, "Incorrect password"));
    }
    let text = |name: &str| {
        headers
            .get(name)
            .and_then(|value| value.to_str().ok())
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_owned)
    };
    let build: u64 = text("x-cubix-build")
        .and_then(|value| value.parse().ok())
        .filter(|value| *value > 0)
        .ok_or_else(|| ApiError::new(422, "X-Cubix-Build must be a positive build number"))?;
    let commit = text("x-cubix-commit")
        .filter(|value| value.len() <= 64 && value.bytes().all(|b| b.is_ascii_hexdigit()))
        .ok_or_else(|| ApiError::new(422, "X-Cubix-Commit must be a hexadecimal commit"))?;
    // Every APK is a ZIP archive; anything else is a wrong file, not a signed build.
    if body.len() < 1024 || !body.starts_with(b"PK\x03\x04") {
        return Err(ApiError::new(422, "The body is not an APK"));
    }
    let sha256 = format!("{:x}", Sha256::digest(&body));
    let size = body.len();
    let meta = json!({
        "build": build,
        "commit": commit,
        "sha256": sha256,
        "size": size,
        "uploadedAt": crate::accounts::now(),
    });
    let dir = apk_dir();
    tokio::task::spawn_blocking(move || -> std::io::Result<()> {
        std::fs::create_dir_all(&dir)?;
        let apk = dir.join(APK_FILE);
        let temporary = dir.join(format!("{APK_FILE}.tmp"));
        std::fs::write(&temporary, &body)?;
        std::fs::rename(&temporary, &apk)?;
        let meta_path = dir.join(META_FILE);
        let temporary = dir.join(format!("{META_FILE}.tmp"));
        std::fs::write(&temporary, serde_json::to_vec_pretty(&meta)?)?;
        std::fs::rename(&temporary, &meta_path)
    })
    .await
    .map_err(ApiError::internal)?
    .map_err(ApiError::internal)?;
    println!(
        "Stored APK build {build} ({}) — {size} bytes",
        &commit[..commit.len().min(7)]
    );
    Ok((StatusCode::OK, Json(info())).into_response())
}
