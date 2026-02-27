use axum::{
    http::{header, HeaderValue, StatusCode},
    response::IntoResponse,
};
use rust_embed::RustEmbed;

#[derive(RustEmbed)]
#[folder = "../../frontend/dist"]
struct Assets;

pub async fn serve_static(uri: axum::http::Uri) -> impl IntoResponse {
    let path = uri.path().trim_start_matches('/');
    let key = if path.is_empty() { "index.html" } else { path };

    if let Some(asset) = Assets::get(key) {
        let ct = HeaderValue::from_static(content_type(key));
        return ([(header::CONTENT_TYPE, ct)], asset.data.into_owned()).into_response();
    }

    if let Some(index) = Assets::get("index.html") {
        let ct = HeaderValue::from_static("text/html; charset=utf-8");
        return ([(header::CONTENT_TYPE, ct)], index.data.into_owned()).into_response();
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
