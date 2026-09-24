//! Immutable desktop assets and signed release envelopes. The launcher pins the signing key.
use crate::{
    AppState,
    error::{ApiError, Result},
    release,
};
use axum::{
    Json,
    body::Body,
    extract::{Path, Request, State},
    http::{HeaderMap, HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
};
use http_body_util::BodyExt;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::path::PathBuf;
use tokio::io::AsyncWriteExt;
use tokio_util::io::ReaderStream;
static UPLOAD: tokio::sync::Semaphore = tokio::sync::Semaphore::const_new(1);
fn root() -> PathBuf {
    release::apk_dir().join("desktop")
}
fn target(v: &str) -> bool {
    matches!(
        v,
        "linux-x64" | "linux-arm64" | "darwin-x64" | "darwin-arm64" | "win32-x64" | "win32-arm64"
    )
}
fn hash(v: &str) -> bool {
    v.len() == 64
        && v.bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}
async fn write(path: PathBuf, bytes: Vec<u8>) -> Result<()> {
    tokio::task::spawn_blocking(move || -> std::io::Result<()> {
        std::fs::create_dir_all(path.parent().unwrap())?;
        let temp = path.with_extension(format!("{}.tmp", uuid::Uuid::new_v4()));
        std::fs::write(&temp, bytes)?;
        std::fs::rename(temp, path)
    })
    .await
    .map_err(ApiError::internal)?
    .map_err(ApiError::internal)
}
pub async fn manifest(Path(platform): Path<String>) -> Result<Response> {
    if !target(&platform) {
        return Err(ApiError::new(404, "Unknown platform"));
    }
    let path = root().join(format!("{platform}.json"));
    let bytes = tokio::task::spawn_blocking(move || std::fs::read(path))
        .await
        .map_err(ApiError::internal)?
        .map_err(|_| ApiError::new(404, "No desktop release published"))?;
    Ok(([(header::CONTENT_TYPE, "application/json")], bytes).into_response())
}
pub async fn publish(
    State(state): State<AppState>,
    Path(platform): Path<String>,
    headers: HeaderMap,
    Json(envelope): Json<Value>,
) -> Result<Response> {
    release::authorize(&state, &headers).await?;
    if !target(&platform) {
        return Err(ApiError::new(422, "Unknown platform"));
    }
    let raw = envelope["manifest"]
        .as_str()
        .ok_or_else(|| ApiError::new(422, "Missing signed manifest"))?;
    if envelope["signature"]
        .as_str()
        .is_none_or(|v| v.is_empty() || v.len() > 256)
    {
        return Err(ApiError::new(422, "Missing signature"));
    }
    let manifest: Value =
        serde_json::from_str(raw).map_err(|_| ApiError::new(422, "Invalid manifest"))?;
    if manifest["schema"] != 1
        || manifest["target"] != platform
        || manifest["build"].as_u64().is_none_or(|v| v == 0)
    {
        return Err(ApiError::new(422, "Invalid release identity"));
    }
    let files = manifest["files"]
        .as_array()
        .filter(|v| !v.is_empty() && v.len() <= 20000)
        .ok_or_else(|| ApiError::new(422, "Invalid files"))?;
    for file in files {
        let digest = file["sha256"]
            .as_str()
            .filter(|v| hash(v))
            .ok_or_else(|| ApiError::new(422, "Invalid asset hash"))?;
        let size = file["size"]
            .as_u64()
            .ok_or_else(|| ApiError::new(422, "Invalid asset size"))?;
        if std::fs::metadata(root().join("assets").join(digest)).map_or(true, |m| m.len() != size) {
            return Err(ApiError::new(422, "Upload every asset before publishing"));
        }
    }
    write(
        root().join(format!("{platform}.json")),
        serde_json::to_vec(&envelope).map_err(ApiError::internal)?,
    )
    .await?;
    Ok(Json(json!({"build":manifest["build"],"target":platform})).into_response())
}
pub async fn upload_asset(
    State(state): State<AppState>,
    Path(digest): Path<String>,
    request: Request,
) -> Result<Response> {
    release::authorize(&state, request.headers()).await?;
    if !hash(&digest) {
        return Err(ApiError::new(422, "Invalid asset hash"));
    }
    let _permit = UPLOAD.acquire().await.map_err(ApiError::internal)?;
    let path = root().join("assets").join(&digest);
    tokio::fs::create_dir_all(path.parent().unwrap())
        .await
        .map_err(ApiError::internal)?;
    let temp = path.with_extension(format!("{}.tmp", uuid::Uuid::new_v4()));
    let result = async {
        let mut file = tokio::fs::File::create(&temp)
            .await
            .map_err(ApiError::internal)?;
        let mut body = request.into_body();
        let mut hasher = Sha256::new();
        let mut size = 0u64;
        while let Some(frame) = body.frame().await {
            let frame = frame.map_err(ApiError::internal)?;
            if let Ok(bytes) = frame.into_data() {
                size += bytes.len() as u64;
                if size > 512 * 1024 * 1024 {
                    return Err(ApiError::new(413, "Asset too large"));
                }
                hasher.update(&bytes);
                file.write_all(&bytes).await.map_err(ApiError::internal)?;
            }
        }
        if format!("{:x}", hasher.finalize()) != digest {
            return Err(ApiError::new(422, "Asset hash mismatch"));
        }
        file.flush().await.map_err(ApiError::internal)?;
        drop(file);
        tokio::fs::rename(&temp, &path)
            .await
            .map_err(ApiError::internal)?;
        Ok(size)
    }
    .await;
    if result.is_err() {
        let _ = tokio::fs::remove_file(temp).await;
    }
    let size = result?;
    Ok(Json(json!({"size":size})).into_response())
}
/// Assets are immutable, so a `Range: bytes=N-` request resumes a download exactly where an
/// earlier session stopped: the desktop application fetches the launcher binary this way.
pub async fn asset(Path(digest): Path<String>, headers: HeaderMap) -> Result<Response> {
    if !hash(&digest) {
        return Err(ApiError::new(404, "Unknown asset"));
    }
    let path = root().join("assets").join(digest);
    let mut file = tokio::fs::File::open(path)
        .await
        .map_err(|_| ApiError::new(404, "Unknown asset"))?;
    let size = file.metadata().await.map_err(ApiError::internal)?.len();
    let offset = headers
        .get(header::RANGE)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("bytes="))
        .and_then(|value| value.strip_suffix('-'))
        .and_then(|value| value.parse::<u64>().ok())
        .filter(|offset| *offset > 0 && *offset < size);
    if let Some(offset) = offset {
        use tokio::io::AsyncSeekExt;
        file.seek(std::io::SeekFrom::Start(offset))
            .await
            .map_err(ApiError::internal)?;
    }
    let mut response = (
        [
            (header::CONTENT_TYPE, "application/octet-stream"),
            (header::CACHE_CONTROL, "public, max-age=31536000, immutable"),
            (header::ACCEPT_RANGES, "bytes"),
        ],
        Body::from_stream(ReaderStream::with_capacity(file, 64 * 1024)),
    )
        .into_response();
    match offset {
        Some(offset) => {
            *response.status_mut() = StatusCode::PARTIAL_CONTENT;
            let range = format!("bytes {}-{}/{}", offset, size - 1, size);
            response.headers_mut().insert(
                header::CONTENT_RANGE,
                HeaderValue::from_str(&range).map_err(ApiError::internal)?,
            );
            response
                .headers_mut()
                .insert(header::CONTENT_LENGTH, (size - offset).into());
        }
        None => {
            response
                .headers_mut()
                .insert(header::CONTENT_LENGTH, size.into());
        }
    }
    Ok(response)
}
