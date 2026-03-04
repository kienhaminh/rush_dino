use std::collections::HashMap;
use std::future::IntoFuture;
use std::sync::{Arc, Mutex};

use axum::{extract::Query, routing::get, Router};
use tokio::net::TcpListener;

use rushdino_common::{AppError, Result};

const SUCCESS_HTML: &str = r#"<!doctype html>
<html lang=\"en\"><head><meta charset=\"utf-8\"/>
<title>Authentication successful</title></head>
<body><p>Authentication successful. Return to your app.</p></body>
</html>"#;

pub async fn run_local_callback_server(expected_state: &str) -> Result<String> {
    let code_cell: Arc<Mutex<Option<String>>> = Arc::new(Mutex::new(None));
    let code_cell_clone = code_cell.clone();
    let expected = expected_state.to_owned();

    let app = Router::new().route(
        "/auth/callback",
        get(move |Query(params): Query<HashMap<String, String>>| {
            let cell = code_cell_clone.clone();
            let exp = expected.clone();
            async move {
                let state_ok = params.get("state").map(|s| s == &exp).unwrap_or(false);
                if let Some(code) = params.get("code").filter(|_| state_ok) {
                    *cell.lock().unwrap() = Some(code.clone());
                }
                axum::response::Html(SUCCESS_HTML)
            }
        }),
    );

    let listener = TcpListener::bind("127.0.0.1:1455")
        .await
        .map_err(|e| AppError::Provider(format!("cannot bind :1455: {e}")))?;

    let server = axum::serve(listener, app);
    let handle = tokio::spawn(server.into_future());

    for _ in 0..600 {
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        if let Some(code) = code_cell.lock().unwrap().clone() {
            handle.abort();
            return Ok(code);
        }
    }

    handle.abort();
    Err(AppError::Provider("OAuth callback timed out after 5 minutes".into()))
}
