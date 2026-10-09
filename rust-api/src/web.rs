//! The web application built by `desktop/web.ts`, which the desktop app loads too.
//! Only files that exist are served, the administration's pages (`/admin`, `/admin/…`) and the app's: each of its
//! addresses, under the prefix of its language but English's (`/fr/timer`), is its page written ahead of time
//! (`desktop/prerender.tsx`) when it has one, else the single-page app's `index.html`. The site's root is the landing
//! page (`landing.html`): the app lives under its own paths, `/timer` first.
use axum::{
    Router,
    body::Body,
    extract::Request,
    http::{HeaderValue, Method, StatusCode, header},
    middleware::{self, Next},
    response::{IntoResponse, Response},
};
use percent_encoding::percent_decode_str;
use std::{collections::HashMap, path::PathBuf, sync::Arc};
use tower_http::services::{ServeDir, ServeFile};

/// The first segment of every address of the app (`src/client/lib/route.ts`).
const PAGES: &[&str] = &[
    "login", "onboarding", "timer", "algorithms", "training", "duel", "learn", "coaching", "community",
    "tournaments", "match", "profile", "solve",
];
/// The languages whose pages live under their prefix; English's are at the root.
const LANGUAGES: &[&str] = &["fr", "es", "it", "de"];

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
    let files = ServeDir::new(&dir).precompressed_br().precompressed_gzip();
    let app = Arc::new(dir.clone());
    Router::new()
        .route_service("/", ServeFile::new(dir.join(landing)).precompressed_br().precompressed_gzip())
        .route_service("/admin", index.clone())
        .route_service("/admin/{*page}", index)
        // The legal notice, the privacy policy and the terms of use, pages of their own.
        .route_service("/legal", ServeFile::new(dir.join("legal.html")).precompressed_br().precompressed_gzip())
        .route_service("/privacy", ServeFile::new(dir.join("privacy.html")).precompressed_br().precompressed_gzip())
        .route_service("/terms", ServeFile::new(dir.join("terms.html")).precompressed_br().precompressed_gzip())
        .fallback(move |request: Request| page(app.clone(), files.clone(), request))
        .layer(middleware::from_fn(cache))
}

/// An address of the app: its language and its path under it, decoded (`algorithms/OLL 21`); none for any other address
/// or one naming anything outside the app's pages.
fn app_path(path: &str) -> Option<(&'static str, String)> {
    let mut rest = path.strip_prefix('/')?;
    let mut language = "en";
    if let Some((first, after)) = rest.split_once('/') {
        if let Some(found) = LANGUAGES.iter().find(|l| **l == first) {
            language = found;
            rest = after;
        }
    }
    let first = rest.split('/').next()?;
    if !PAGES.contains(&first) {
        return None;
    }
    let decoded = percent_decode_str(rest).decode_utf8().ok()?;
    let safe = decoded
        .split('/')
        .all(|part| !part.is_empty() && part != "." && part != ".." && !part.contains(['\\', '\0']));
    safe.then(|| (language, decoded.into_owned()))
}

/// The app's address `path`: its page in its language (`pages/<language>/<path>[@<puzzle>[~<step>]].html`, compressed
/// as the browser accepts it), trying without the step, then without the puzzle; else the app's `index.html`. Any other
/// address is a file of the build.
async fn page(dir: Arc<PathBuf>, mut files: ServeDir, request: Request) -> Response {
    let Some((language, path)) = app_path(request.uri().path()) else {
        return match files.try_call(request).await {
            Ok(response) => response.map(Body::new),
            Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
        };
    };
    if request.method() != Method::GET && request.method() != Method::HEAD {
        return StatusCode::METHOD_NOT_ALLOWED.into_response();
    }
    let query: HashMap<String, String> = serde_urlencoded::from_str(request.uri().query().unwrap_or("")).unwrap_or_default();
    let plain = |key: &str| query.get(key).filter(|v| !v.is_empty() && v.chars().all(|c| c.is_ascii_alphanumeric()));
    let mut names = Vec::new();
    if let Some(puzzle) = plain("puzzle") {
        if let Some(step) = plain("step") {
            names.push(format!("{path}@{puzzle}~{step}"));
        }
        names.push(format!("{path}@{puzzle}"));
    }
    names.push(path);
    let accepted = request.headers().get(header::ACCEPT_ENCODING).and_then(|v| v.to_str().ok()).unwrap_or("");
    let encoding = ["br", "gzip"].into_iter().find(|e| accepted.split(',').any(|a| a.split(';').next().unwrap_or("").trim() == *e));
    if let Some(encoding) = encoding {
        let extension = if encoding == "br" { "br" } else { "gz" };
        for name in &names {
            if let Ok(bytes) = tokio::fs::read(dir.join("pages").join(language).join(format!("{name}.html.{extension}"))).await {
                return (
                    [
                        (header::CONTENT_TYPE, "text/html; charset=utf-8"),
                        (header::CONTENT_ENCODING, encoding),
                        (header::VARY, "accept-encoding"),
                    ],
                    bytes,
                )
                    .into_response();
            }
        }
    }
    match ServeFile::new(dir.join("index.html")).precompressed_br().precompressed_gzip().try_call(request).await {
        Ok(response) => response.map(Body::new),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
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
