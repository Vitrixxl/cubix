//! The web application built by `desktop/web.ts`, which the desktop app loads too.
//! Only files that exist are served, and the administration's pages (`/admin`, `/admin/…`), which
//! the same single-page app draws from `index.html`. The site's root is the landing page
//! (`landing.html`): the app lives under its own paths, `/timer` first.
use axum::{
    Router,
    extract::Request,
    http::{HeaderValue, StatusCode, header},
    middleware::{self, Next},
    response::Response,
};
use std::path::PathBuf;
use tower_http::services::{ServeDir, ServeFile};

/// `CUBIX_WEB_DIR`, else `dist/web` next to the working directory when it has been built.
pub fn directory() -> Option<PathBuf> {
    let dir = std::env::var_os("CUBIX_WEB_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("dist/web"));
    dir.join("index.html").is_file().then_some(dir)
}

pub fn router(dir: PathBuf) -> Router {
    let index = ServeFile::new(dir.join("index.html"))
        .precompressed_br()
        .precompressed_gzip();
    // A build from before the landing page keeps the app at the root.
    let landing = if dir.join("landing.html").is_file() { "landing.html" } else { "index.html" };
    Router::new()
        .route_service("/", ServeFile::new(dir.join(landing)).precompressed_br().precompressed_gzip())
        .route_service("/admin", index.clone())
        .route_service("/admin/{*page}", index)
        // The legal notice, the privacy policy and the terms of use, pages of their own.
        .route_service("/legal", ServeFile::new(dir.join("legal.html")).precompressed_br().precompressed_gzip())
        .route_service("/privacy", ServeFile::new(dir.join("privacy.html")).precompressed_br().precompressed_gzip())
        .route_service("/terms", ServeFile::new(dir.join("terms.html")).precompressed_br().precompressed_gzip())
        .route_service("/onboarding", ServeFile::new(dir.join("index.html")))
        .route_service("/timer", ServeFile::new(dir.join("index.html")))
        .route_service("/algorithms", ServeFile::new(dir.join("index.html")))
        .route_service("/algorithms/{*case}", ServeFile::new(dir.join("index.html")))
        .route_service("/training", ServeFile::new(dir.join("index.html")))
        .route_service("/training/{*page}", ServeFile::new(dir.join("index.html")))
        .route_service("/duel", ServeFile::new(dir.join("index.html")))
        .route_service("/learn", ServeFile::new(dir.join("index.html")))
        .route_service("/learn/{*method}", ServeFile::new(dir.join("index.html")))
        .route_service("/coaching", ServeFile::new(dir.join("index.html")))
        .route_service("/coaching/{*page}", ServeFile::new(dir.join("index.html")))
        .route_service("/community", ServeFile::new(dir.join("index.html")))
        .route_service("/community/{*page}", ServeFile::new(dir.join("index.html")))
        .route_service("/tournaments", ServeFile::new(dir.join("index.html")))
        .route_service("/tournaments/{*page}", ServeFile::new(dir.join("index.html")))
        .route_service("/match/{*page}", ServeFile::new(dir.join("index.html")))
        .route_service("/profile", ServeFile::new(dir.join("index.html")))
        .route_service("/profile/{*page}", ServeFile::new(dir.join("index.html")))
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
