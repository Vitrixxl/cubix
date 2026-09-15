//! Mobile release information. The server and the Android APK are built from the same
//! commit, so the deployed server knows which build the application should be running.
use axum::response::Redirect;
use serde_json::{Value, json};

/// Every push to `main` publishes the ARM64 APK as an asset of the latest GitHub release.
pub const APK_URL: &str =
    "https://github.com/Vitrixxl/cubix/releases/latest/download/cubix-android-arm64.apk";

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
pub fn info() -> Value {
    json!({
        "version": env!("CARGO_PKG_VERSION"),
        "build": build_number(),
        "commit": commit(),
        "apk": APK_URL,
    })
}
/// `GET /api/mobile/apk` sends the phone's browser to the latest APK without storing it here.
pub async fn apk() -> Redirect {
    Redirect::temporary(APK_URL)
}
