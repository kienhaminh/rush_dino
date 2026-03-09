use std::{collections::HashMap, sync::Arc, time::Duration};

use axum::{
    extract::{Query, State},
    routing::get,
    Router,
};
use tokio::net::TcpListener;
use tokio::sync::{oneshot, Mutex, OnceCell};

use rushdino_common::{AppError, Result};

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
          status.textContent = "Authentication successful. You can close this tab and return to your app.";
        }
      }, 300);
    });
  </script>
</body>
</html>"#;

const INVALID_HTML: &str = r#"<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>Authentication failed</title>
</head>
<body>
  <p>Authentication failed. Please return to RushDino and start the login again.</p>
</body>
</html>"#;

type CallbackWaiters = Arc<Mutex<HashMap<String, oneshot::Sender<String>>>>;

struct CallbackService {
    waiters: CallbackWaiters,
}

static CALLBACK_SERVICE: OnceCell<CallbackService> = OnceCell::const_new();

impl CallbackService {
    async fn get() -> Result<&'static Self> {
        CALLBACK_SERVICE.get_or_try_init(Self::start).await
    }

    async fn start() -> Result<Self> {
        let waiters: CallbackWaiters = Arc::new(Mutex::new(HashMap::new()));
        let app = Router::new()
            .route("/auth/callback", get(handle_callback))
            .with_state(waiters.clone());

        let listener = TcpListener::bind("127.0.0.1:1455")
            .await
            .map_err(|e| AppError::Provider(format!("cannot bind :1455: {e}")))?;

        tokio::spawn(async move {
            if let Err(error) = axum::serve(listener, app).await {
                tracing::error!("oauth callback server stopped: {error}");
            }
        });

        Ok(Self { waiters })
    }
}

async fn handle_callback(
    State(waiters): State<CallbackWaiters>,
    Query(params): Query<HashMap<String, String>>,
) -> axum::response::Html<&'static str> {
    let Some(state) = params.get("state").cloned() else {
        return axum::response::Html(INVALID_HTML);
    };
    let Some(code) = params.get("code").cloned() else {
        return axum::response::Html(INVALID_HTML);
    };

    let tx = {
        let mut waiters = waiters.lock().await;
        waiters.remove(&state)
    };

    if let Some(tx) = tx {
        let _ = tx.send(code);
        return axum::response::Html(SUCCESS_HTML);
    }

    axum::response::Html(INVALID_HTML)
}

pub async fn run_local_callback_server(expected_state: &str) -> Result<String> {
    let service = CallbackService::get().await?;
    let (tx, rx) = oneshot::channel();

    {
        let mut waiters = service.waiters.lock().await;
        if waiters.insert(expected_state.to_owned(), tx).is_some() {
            return Err(AppError::Provider(
                "OAuth login state collision. Please retry the login.".into(),
            ));
        }
    }

    match tokio::time::timeout(Duration::from_secs(300), rx).await {
        Ok(Ok(code)) => Ok(code),
        Ok(Err(_)) => Err(AppError::Provider(
            "OAuth callback server stopped before the login completed".into(),
        )),
        Err(_) => {
            let mut waiters = service.waiters.lock().await;
            waiters.remove(expected_state);
            Err(AppError::Provider(
                "OAuth callback timed out after 5 minutes".into(),
            ))
        }
    }
}
