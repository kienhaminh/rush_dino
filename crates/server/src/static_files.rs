use axum::{
    http::{header, HeaderValue, StatusCode},
    response::IntoResponse,
};
#[cfg(all(not(test), not(debug_assertions)))]
use rust_embed::RustEmbed;

#[cfg(all(not(test), not(debug_assertions)))]
#[derive(RustEmbed)]
#[folder = "../desktop-app/ui/dist"]
struct Assets;

fn load_asset(key: &str) -> Option<Vec<u8>> {
    #[cfg(all(not(test), not(debug_assertions)))]
    {
        return Assets::get(key).map(|asset| asset.data.into_owned());
    }

    #[cfg(any(test, debug_assertions))]
    {
        let _ = key;
        None
    }
}

pub async fn serve_static(uri: axum::http::Uri) -> impl IntoResponse {
    let path = uri.path().trim_start_matches('/');
    let key = if path.is_empty() { "index.html" } else { path };

    if let Some(asset) = load_asset(key) {
        let ct = HeaderValue::from_static(content_type(key));
        return ([(header::CONTENT_TYPE, ct)], asset).into_response();
    }

    if let Some(index) = load_asset("index.html") {
        let ct = HeaderValue::from_static("text/html; charset=utf-8");
        return ([(header::CONTENT_TYPE, ct)], index).into_response();
    }

    (StatusCode::NOT_FOUND, "not found").into_response()
}

fn content_type(path: &str) -> &'static str {
    if path.ends_with(".js") {
        "application/javascript"
    } else if path.ends_with(".css") {
        "text/css"
    } else if path.ends_with(".svg") {
        "image/svg+xml"
    } else if path.ends_with(".json") {
        "application/json"
    } else {
        "text/html; charset=utf-8"
    }
}

#[cfg(test)]
mod tests {
    use super::serve_static;
    use axum::{http::{StatusCode, Uri}, response::IntoResponse};

    #[tokio::test]
    async fn serve_static_returns_not_found_without_embedded_assets() {
        let response = serve_static(Uri::from_static("/")).await.into_response();
        assert_eq!(response.status(), StatusCode::NOT_FOUND);
    }
}
