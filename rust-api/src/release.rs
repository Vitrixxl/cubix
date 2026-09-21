//! Mobile release information, the Android APK the server hands out and the over-the-air
//! JavaScript updates expo-updates fetches from it.
//!
//! The server and the APK are built from the same commit, but not in the same place: the
//! Raspberry Pi has neither the memory for Gradle nor an ARM64 Android NDK. `scripts/deploy.ts`
//! therefore builds the APK on the developer's machine and uploads it here with the admin
//! password. The file lives next to the database, so it survives container rebuilds, and the
//! application only offers an APK download once a build with another runtime version (that is,
//! other native code) has been uploaded.
//!
//! Most deployments only change JavaScript. For those the script runs `expo export` and
//! publishes the bundle here: each asset is stored under its SHA-256 and a manifest per runtime
//! version points at them. Phones ask `GET /api/mobile/updates/manifest` on launch following the
//! expo-updates protocol (version 1) and download a newer bundle for their next start.
use crate::{
    AppState,
    error::{ApiError, Result},
};
use axum::{
    Json,
    body::Bytes,
    extract::{Path, State},
    http::{HeaderMap, HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
};
use serde_json::{Map, Value, json};
use sha2::{Digest, Sha256};
use std::path::PathBuf;

const APK_FILE: &str = "cubix-android-arm64.apk";
const META_FILE: &str = "cubix-android-arm64.json";
/// Path the application downloads from; `info()` announces it so clients need not hard-code it.
pub const APK_PATH: &str = "/api/mobile/apk";
/// Over-the-air assets are served from here, followed by their hexadecimal SHA-256.
pub const ASSETS_PATH: &str = "/api/mobile/updates/assets";

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
        "apkRuntimeVersion": apk["runtimeVersion"],
        "apkSha256": apk["sha256"],
        "apkSize": apk["size"],
        "apkUploadedAt": apk["uploadedAt"],
        "updates": published_updates(),
    })
}
/// The over-the-air update stored for each runtime version, so the deploy script knows what to skip.
fn published_updates() -> Value {
    let mut updates = Map::new();
    let Ok(entries) = std::fs::read_dir(updates_dir()) else {
        return Value::Object(updates);
    };
    for entry in entries.flatten() {
        let name = entry.file_name();
        let Some(runtime) = name.to_str().and_then(|name| name.strip_suffix(".json")) else {
            continue;
        };
        if let Some(update) = read_update(runtime) {
            updates.insert(
                runtime.to_owned(),
                json!({
                    "id": update["id"],
                    "build": update["build"],
                    "commit": update["commit"],
                    "createdAt": update["createdAt"],
                }),
            );
        }
    }
    Value::Object(updates)
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
    authorize(&state, &headers).await?;
    let text = |name: &str| header_text(&headers, name);
    let build: u64 = text("x-cubix-build")
        .and_then(|value| value.parse().ok())
        .filter(|value| *value > 0)
        .ok_or_else(|| ApiError::new(422, "X-Cubix-Build must be a positive build number"))?;
    let commit = text("x-cubix-commit")
        .filter(|value| is_commit(value))
        .ok_or_else(|| ApiError::new(422, "X-Cubix-Commit must be a hexadecimal commit"))?;
    // APKs built before expo-updates carry no runtime version; the application then falls
    // back to comparing build numbers.
    let runtime = text("x-cubix-runtime")
        .map(|value| {
            is_runtime_version(&value)
                .then_some(value)
                .ok_or_else(|| ApiError::new(422, "X-Cubix-Runtime is not a runtime version"))
        })
        .transpose()?;
    // Every APK is a ZIP archive; anything else is a wrong file, not a signed build.
    if body.len() < 1024 || !body.starts_with(b"PK\x03\x04") {
        return Err(ApiError::new(422, "The body is not an APK"));
    }
    let sha256 = format!("{:x}", Sha256::digest(&body));
    let size = body.len();
    let meta = json!({
        "build": build,
        "commit": commit,
        "runtimeVersion": runtime,
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

/// Checks the admin password sent as `Authorization: Bearer <password>`.
pub(crate) async fn authorize(state: &AppState, headers: &HeaderMap) -> Result<()> {
    let admin = state.admin.as_ref().as_ref().ok_or_else(|| {
        ApiError::new(
            503,
            "Set CUBIX_ADMIN_PASSWORD in .env to accept mobile uploads",
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
    Ok(())
}
fn header_text(headers: &HeaderMap, name: &str) -> Option<String> {
    headers
        .get(name)
        .and_then(|value| value.to_str().ok())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}
fn is_commit(value: &str) -> bool {
    !value.is_empty() && value.len() <= 64 && value.bytes().all(|b| b.is_ascii_hexdigit())
}
/// Runtime versions name files on disk, so only a conservative character set is accepted.
fn is_runtime_version(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 64
        && value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'.' || b == b'-' || b == b'_')
}
fn is_sha256(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|b| b.is_ascii_hexdigit())
}

// ---------------------------------------------------------------------------------------------
// Over-the-air updates
// ---------------------------------------------------------------------------------------------

fn updates_dir() -> PathBuf {
    apk_dir().join("updates")
}
fn assets_dir() -> PathBuf {
    updates_dir().join("assets")
}
fn read_update(runtime: &str) -> Option<Value> {
    std::fs::read(updates_dir().join(format!("{runtime}.json")))
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .filter(|value: &Value| value["id"].is_string() && value["launchAsset"].is_object())
}
fn write_atomically(path: PathBuf, bytes: &[u8]) -> std::io::Result<()> {
    let temporary = path.with_extension(format!(
        "{}.tmp",
        path.extension().and_then(|e| e.to_str()).unwrap_or("")
    ));
    std::fs::write(&temporary, bytes)?;
    std::fs::rename(&temporary, &path)
}
/// `PUT /api/mobile/updates/assets/{sha256}` stores one exported file under its hash. The
/// content is verified against the path, so a corrupt upload is refused rather than served.
pub async fn upload_asset(
    State(state): State<AppState>,
    Path(hash): Path<String>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<Response> {
    authorize(&state, &headers).await?;
    if !is_sha256(&hash) {
        return Err(ApiError::new(
            422,
            "The asset path must be a hexadecimal SHA-256",
        ));
    }
    if body.is_empty() {
        return Err(ApiError::new(422, "The asset is empty"));
    }
    if format!("{:x}", Sha256::digest(&body)) != hash {
        return Err(ApiError::new(422, "The asset does not match its SHA-256"));
    }
    let size = body.len();
    let dir = assets_dir();
    tokio::task::spawn_blocking(move || -> std::io::Result<()> {
        std::fs::create_dir_all(&dir)?;
        write_atomically(dir.join(&hash), &body)
    })
    .await
    .map_err(ApiError::internal)?
    .map_err(ApiError::internal)?;
    Ok((StatusCode::OK, Json(json!({ "size": size }))).into_response())
}
/// Validates one manifest asset from the publish request and keeps the fields expo-updates reads.
fn asset_entry(value: &Value, launch: bool) -> Result<Value> {
    let hash = value["hash"].as_str().filter(|hash| is_sha256(hash));
    let key = value["key"].as_str().filter(|key| {
        !key.is_empty()
            && key.len() <= 128
            && key
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_' || b == b'.')
    });
    let content_type = value["contentType"]
        .as_str()
        .filter(|kind| !kind.is_empty() && kind.len() <= 128 && kind.is_ascii());
    let extension = value["fileExtension"].as_str().filter(|ext| {
        ext.starts_with('.')
            && ext.len() <= 16
            && ext[1..].bytes().all(|b| b.is_ascii_alphanumeric())
    });
    let (Some(hash), Some(key), Some(content_type)) = (hash, key, content_type) else {
        return Err(ApiError::new(
            422,
            "Each asset needs a SHA-256 hash, a key and a content type",
        ));
    };
    if extension.is_none() && (!launch || value["fileExtension"].is_string()) {
        return Err(ApiError::new(
            422,
            "Asset file extensions look like \".png\"",
        ));
    }
    if !assets_dir().join(hash).is_file() {
        return Err(ApiError::new(422, format!("Asset {hash} was not uploaded")));
    }
    Ok(json!({ "hash": hash, "key": key, "contentType": content_type, "fileExtension": extension }))
}
/// `PUT /api/mobile/updates` publishes a manifest for one runtime version once its assets are
/// stored. The body carries `runtimeVersion`, `build`, `commit`, `launchAsset`, `assets` and
/// the public Expo config (`expoClient`) the application reads through `Constants.expoConfig`.
/// Republishing the same commit keeps the existing update id, so phones do not download it again.
pub async fn publish(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Result<Response> {
    authorize(&state, &headers).await?;
    let runtime = body["runtimeVersion"]
        .as_str()
        .filter(|value| is_runtime_version(value))
        .ok_or_else(|| ApiError::new(422, "runtimeVersion is required"))?
        .to_owned();
    let build = body["build"]
        .as_u64()
        .filter(|value| *value > 0)
        .ok_or_else(|| ApiError::new(422, "build must be a positive build number"))?;
    let commit = body["commit"]
        .as_str()
        .filter(|value| is_commit(value))
        .ok_or_else(|| ApiError::new(422, "commit must be a hexadecimal commit"))?
        .to_owned();
    let launch_asset = asset_entry(&body["launchAsset"], true)?;
    let assets = body["assets"]
        .as_array()
        .ok_or_else(|| ApiError::new(422, "assets must be an array"))?
        .iter()
        .map(|asset| asset_entry(asset, false))
        .collect::<Result<Vec<_>>>()?;
    if assets.len() > 10_000 {
        return Err(ApiError::new(422, "Too many assets"));
    }
    let expo_client = match &body["expoClient"] {
        Value::Object(config) => Value::Object(config.clone()),
        Value::Null => Value::Null,
        _ => return Err(ApiError::new(422, "expoClient must be an object")),
    };
    let previous = read_update(&runtime);
    let unchanged = previous.as_ref().is_some_and(|update| {
        update["commit"] == commit && update["launchAsset"]["hash"] == launch_asset["hash"]
    });
    let id = match (&previous, unchanged) {
        (Some(update), true) => update["id"].as_str().unwrap_or_default().to_owned(),
        _ => uuid::Uuid::new_v4().to_string(),
    };
    let created_at = match (&previous, unchanged) {
        (Some(update), true) => update["createdAt"].clone(),
        _ => Value::String(iso_date(crate::accounts::now())),
    };
    let update = json!({
        "id": id,
        "createdAt": created_at,
        "runtimeVersion": runtime,
        "build": build,
        "commit": commit,
        "launchAsset": launch_asset,
        "assets": assets,
        "expoClient": expo_client,
    });
    let path = updates_dir().join(format!("{runtime}.json"));
    let bytes = serde_json::to_vec_pretty(&update).map_err(ApiError::internal)?;
    tokio::task::spawn_blocking(move || -> std::io::Result<()> {
        std::fs::create_dir_all(path.parent().unwrap())?;
        write_atomically(path, &bytes)
    })
    .await
    .map_err(ApiError::internal)?
    .map_err(ApiError::internal)?;
    println!(
        "Published update build {build} ({}) for runtime {runtime}",
        &commit[..commit.len().min(7)]
    );
    Ok((StatusCode::OK, Json(info())).into_response())
}
/// `GET /api/mobile/updates/manifest`: the expo-updates protocol. The phone names its runtime
/// version and platform in headers; the answer is the stored manifest or an empty 204 that
/// means "nothing newer". The manifest's own build identity rides in `extra.expoClient.extra`.
pub async fn manifest(headers: HeaderMap) -> Result<Response> {
    let mut response = match header_text(&headers, "expo-runtime-version") {
        Some(runtime)
            if is_runtime_version(&runtime)
                && header_text(&headers, "expo-platform")
                    .is_none_or(|platform| platform == "android") =>
        {
            match read_update(&runtime) {
                Some(update) => {
                    let origin = public_origin(&headers);
                    let asset = |entry: &Value| {
                        let hash = entry["hash"].as_str().unwrap_or_default();
                        json!({
                            "hash": base64_url(&hex_bytes(hash)),
                            "key": entry["key"],
                            "contentType": entry["contentType"],
                            "fileExtension": entry["fileExtension"],
                            "url": format!("{origin}{ASSETS_PATH}/{hash}"),
                        })
                    };
                    let assets: Vec<Value> = update["assets"]
                        .as_array()
                        .map(|list| list.iter().map(asset).collect())
                        .unwrap_or_default();
                    let manifest = json!({
                        "id": update["id"],
                        "createdAt": update["createdAt"],
                        "runtimeVersion": update["runtimeVersion"],
                        "launchAsset": asset(&update["launchAsset"]),
                        "assets": assets,
                        "metadata": {},
                        "extra": { "expoClient": update["expoClient"] },
                    });
                    (StatusCode::OK, Json(manifest)).into_response()
                }
                None => StatusCode::NO_CONTENT.into_response(),
            }
        }
        _ => StatusCode::NO_CONTENT.into_response(),
    };
    let headers = response.headers_mut();
    headers.insert("expo-protocol-version", HeaderValue::from_static("1"));
    headers.insert("expo-sfv-version", HeaderValue::from_static("0"));
    headers.insert(
        header::CACHE_CONTROL,
        HeaderValue::from_static("private, max-age=0"),
    );
    Ok(response)
}
/// `GET /api/mobile/updates/assets/{sha256}` sends one stored file. The manifest carries the
/// content type, so the file itself is served as opaque bytes.
pub async fn asset(Path(hash): Path<String>) -> Result<Response> {
    if !is_sha256(&hash) {
        return Err(ApiError::new(404, "No such asset"));
    }
    let path = assets_dir().join(&hash);
    let bytes = tokio::task::spawn_blocking(move || std::fs::read(path))
        .await
        .map_err(ApiError::internal)?
        .map_err(|_| ApiError::new(404, "No such asset"))?;
    let mut response = bytes.into_response();
    let headers = response.headers_mut();
    headers.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("application/octet-stream"),
    );
    if let Ok(etag) = HeaderValue::from_str(&format!("\"{hash}\"")) {
        headers.insert(header::ETAG, etag);
    }
    Ok(response)
}
/// Where phones reach this server: `CUBIX_PUBLIC_ORIGIN`, or the request's own host through
/// Caddy's forwarding headers.
fn public_origin(headers: &HeaderMap) -> String {
    if let Ok(origin) = std::env::var("CUBIX_PUBLIC_ORIGIN")
        && !origin.trim().is_empty()
    {
        return origin.trim().trim_end_matches('/').to_owned();
    }
    let proto = header_text(headers, "x-forwarded-proto").unwrap_or_else(|| "http".into());
    let host = header_text(headers, "x-forwarded-host")
        .or_else(|| header_text(headers, "host"))
        .unwrap_or_else(|| "localhost".into());
    format!("{proto}://{host}")
}
fn hex_bytes(hex: &str) -> Vec<u8> {
    (0..hex.len() / 2)
        .filter_map(|i| u8::from_str_radix(&hex[2 * i..2 * i + 2], 16).ok())
        .collect()
}
/// Unpadded base64url, the encoding expo-updates expects for asset hashes.
fn base64_url(bytes: &[u8]) -> String {
    const ALPHABET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let n =
            chunk.iter().fold(0u32, |acc, b| (acc << 8) | u32::from(*b)) << (8 * (3 - chunk.len()));
        for i in 0..=chunk.len() {
            out.push(ALPHABET[((n >> (18 - 6 * i)) & 63) as usize] as char);
        }
    }
    out
}
/// `2026-09-17T10:04:05.006Z` from milliseconds since the Unix epoch (the manifest's `createdAt`).
fn iso_date(millis: i64) -> String {
    let (days, rem) = (millis.div_euclid(86_400_000), millis.rem_euclid(86_400_000));
    // Howard Hinnant's civil_from_days.
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    format!(
        "{y:04}-{m:02}-{d:02}T{:02}:{:02}:{:02}.{:03}Z",
        rem / 3_600_000,
        rem / 60_000 % 60,
        rem / 1000 % 60,
        rem % 1000
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base64url_matches_the_standard_alphabet_without_padding() {
        assert_eq!(base64_url(b""), "");
        assert_eq!(base64_url(b"f"), "Zg");
        assert_eq!(base64_url(b"fo"), "Zm8");
        assert_eq!(base64_url(b"foo"), "Zm9v");
        assert_eq!(base64_url(&[0xfb, 0xff]), "-_8");
    }
    #[test]
    fn iso_dates_are_rendered_in_utc() {
        assert_eq!(iso_date(0), "1970-01-01T00:00:00.000Z");
        assert_eq!(iso_date(1_789_984_245_006), "2026-09-21T09:50:45.006Z");
        assert_eq!(iso_date(951_782_400_000), "2000-02-29T00:00:00.000Z");
    }
}
