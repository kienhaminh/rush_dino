//! Local HTTP callback server for Codex OAuth login.
//!
//! Binds to `http://localhost:1455/auth/callback`, waits for the browser redirect
//! containing the authorization code, validates the OAuth state parameter, and
//! returns the code to the caller.

use std::collections::HashMap;
use std::future::IntoFuture;
use std::sync::{Arc, Mutex};

use axum::{extract::Query, routing::get, Router};
use tokio::net::TcpListener;

use rushdino_common::{AppError, Result};

/// HTML page returned to the browser after a successful OAuth callback.
const SUCCESS_HTML: &str = r#"<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>Authentication successful</title>
</head>
<body>
  <p id="status">Authentication successful. This tab can close now.</p>
  <script>
    window.addEventListener("load", () => {
      window.close();
      setTimeout(() => {
        const status = document.getElementById("status");
        if (status) {
          status.textContent =
            "Authentication successful. You can close this tab and return to your terminal.";
        }
      }, 300);
    });
  </script>
</body>
</html>"#;

/// Start a local HTTP server on `:1455`, wait for the OAuth callback, and return
/// the authorization code.
///
/// The server validates that the `state` query parameter matches `expected_state`
/// before accepting the code, guarding against CSRF injection.
///
/// Times out after 5 minutes (600 polls × 500 ms).
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
                // Only accept the code when the state matches to prevent CSRF injection.
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

    // Poll for up to 5 minutes (600 x 500 ms).
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
