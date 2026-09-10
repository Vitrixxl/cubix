use axum::{
    extract::Request,
    http::{header, HeaderValue},
    middleware::Next,
    response::{IntoResponse, Redirect, Response},
};

/** Canonical paths, private-page indexing and cache policy for content-hashed assets. */
pub async fn headers(request: Request, next: Next) -> Response {
    let path = request.uri().path().to_owned();
    let canonical = match path.as_str() {
        "/index.html" | "/timer" | "/timer/" => Some("/".to_owned()),
        _ => {
            let pages = ["/algorithms/", "/training/", "/community/", "/messages/", "/account/", "/guides/how-to-use-a-cube-timer/", "/guides/ao5-ao12/"];
            pages.iter().find(|page| path == page.trim_end_matches('/') || path == format!("{page}index.html")).map(|page| (*page).to_owned())
        }
    };
    if let Some(canonical) = canonical {
        let target = match request.uri().query() { Some(query) => format!("{canonical}?{query}"), None => canonical };
        return Redirect::permanent(&target).into_response();
    }
    let mut response = next.run(request).await;
    if response.status().is_success() && !path.starts_with("/api/") {
        response.headers_mut().append(header::VARY, HeaderValue::from_static("Accept-Encoding"));
    }
    if ["/api/", "/aaaaadmin", "/admin/", "/account/", "/messages/", "/community/"].iter().any(|prefix| path.starts_with(prefix)) {
        response.headers_mut().insert("x-robots-tag", HeaderValue::from_static("noindex, nofollow"));
    }
    // Only build-hashed files are immutable. Workers, HTML and the service worker revalidate.
    let name = path.rsplit('/').next().unwrap_or("");
    let hashed = name.rsplit_once('.').is_some_and(|(stem, ext)| {
        matches!(ext, "js" | "css" | "woff2" | "png") && stem.rsplit_once('-').is_some_and(|(_, hash)| hash.len() == 8 && hash.bytes().all(|b| b.is_ascii_alphanumeric()))
    });
    if response.status().is_success() && hashed {
        response.headers_mut().insert(header::CACHE_CONTROL, HeaderValue::from_static("public, max-age=31536000, immutable"));
    }
    response
}
