//! The web application built by `desktop/web.ts`, which the desktop app loads too.
//! Only files that exist are served: there is no client-side routing to fall back to.
use axum::{
    Router,
    extract::Request,
    http::{HeaderValue, StatusCode, header},
    middleware::{self, Next},
    response::Response,
};
use std::path::PathBuf;
use tower_http::services::ServeDir;

/// `CUBIX_WEB_DIR`, else `dist/web` next to the working directory when it has been built.
pub fn directory() -> Option<PathBuf> {
    let dir = std::env::var_os("CUBIX_WEB_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("dist/web"));
    dir.join("index.html").is_file().then_some(dir)
}

pub fn router(dir: PathBuf) -> Router {
    Router::new()
        .fallback_service(
            ServeDir::new(dir)
                .precompressed_br()
                .precompressed_gzip(),
        )
        .layer(middleware::from_fn(cache))
}

async fn cache(request: Request, next: Next) -> Response {
    let path = request.uri().path();
    // Bundles carry a content hash and vendor modules their version in the path.
    let immutable = path.starts_with("/build/") || path.starts_with("/vendor/");
    let mut response = next.run(request).await;
    if response.status().is_success() || response.status() == StatusCode::NOT_MODIFIED {
        response.headers_mut().insert(
            header::CACHE_CONTROL,
            HeaderValue::from_static(if immutable {
                "public, max-age=31536000, immutable"
            } else {
                "no-cache"
            }),
        );
    }
    response.headers_mut().insert(
        header::X_CONTENT_TYPE_OPTIONS,
        HeaderValue::from_static("nosniff"),
    );
    response
}
