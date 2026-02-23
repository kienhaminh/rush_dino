use axum::{http::StatusCode, response::IntoResponse};
use rust_embed::RustEmbed;

#[derive(RustEmbed)]
#[folder = "../../frontend/dist"]
struct Assets;

pub async fn serve_static(uri: axum::http::Uri) -> impl IntoResponse {
    let path = uri.path().trim_start_matches('/');
    let key = if path.is_empty() { "index.html" } else { path };

    if let Some(asset) = Assets::get(key) {
        return (content_type(key), asset.data.into_owned()).into_response();
    }

    if let Some(index) = Assets::get("index.html") {
        return (content_type("index.html"), index.data.into_owned()).into_response();
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
