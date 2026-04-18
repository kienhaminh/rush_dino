use std::sync::{Arc, Mutex};

use anyhow::Context;
use tokio::net::TcpListener;
use tokio::sync::oneshot;

/// Published to the webview so the React bundle knows which local
/// loopback port to talk to.
#[derive(Clone, Copy)]
pub struct ServerInfo {
    pub port: u16,
}

pub struct ServerHandle {
    pub port: u16,
    shutdown: Mutex<Option<oneshot::Sender<()>>>,
}

impl ServerHandle {
    pub fn shutdown(&self) {
        if let Ok(mut guard) = self.shutdown.lock() {
            if let Some(tx) = guard.take() {
                let _ = tx.send(());
            }
        }
    }
}

/// Boots the embedded RushDino HTTP server on a random free loopback port.
/// Mirrors the boot sequence of `rushdino_server::run_server` but keeps the
/// server inside the current (Tauri) process, sharing `~/.rushdino/` with the
/// CLI.
pub async fn start(_app: tauri::AppHandle) -> anyhow::Result<ServerHandle> {
    rushdino_common::init::ensure_rushdino_dir().context("ensure ~/.rushdino/")?;

    let home = rushdino_common::init::default_home_dir();
    let config_path = home.join("config.toml");
    let credentials_path = home.join("credentials.toml");

    let mut config = rushdino_common::AppConfig::load_and_reconcile().context("load AppConfig")?;

    // Desktop runs the UI inside a Tauri WebView; the vite dev server is on
    // 127.0.0.1:1420 during `tauri dev`, and production builds are loaded
    // from the `tauri://localhost` custom protocol. Both origins must be
    // allowed through the embedded server's CORS layer. The CLI's allow-list
    // is untouched because we're mutating the freshly loaded config struct.
    for origin in [
        "http://127.0.0.1:1420",
        "http://localhost:1420",
        "tauri://localhost",
        "http://tauri.localhost",
    ] {
        let origin = origin.to_owned();
        if !config.security.allowed_origins.contains(&origin) {
            config.security.allowed_origins.push(origin);
        }
    }

    let config = Arc::new(config);
    let credentials = Arc::new(
        rushdino_common::CredentialsConfig::load().context("load CredentialsConfig")?,
    );

    let pool = Arc::new(
        rushdino_common::db::init_pool(&config.db_path)
            .await
            .context("init sqlite pool")?,
    );
    rushdino_common::db::run_migrations(pool.as_ref())
        .await
        .context("run migrations")?;

    // Pick a random free loopback port instead of the CLI's default 28847,
    // so a user running `rushdino start` and the desktop app at the same
    // time don't collide.
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .context("bind embedded server listener")?;
    let port = listener.local_addr()?.port();

    let router = rushdino_server::build_app(
        config.clone(),
        credentials,
        config_path,
        credentials_path,
        pool,
    )
    .await
    .context("build rushdino router")?;

    let (tx, rx) = oneshot::channel::<()>();

    tokio::spawn(async move {
        if let Err(e) = axum::serve(listener, router)
            .with_graceful_shutdown(async move {
                let _ = rx.await;
            })
            .await
        {
            tracing::error!("embedded rushdino server error: {e}");
        }
    });

    // Kick off the bundled-asset sync in the background, same as the CLI.
    let asset_home = rushdino_common::init::default_home_dir();
    tokio::spawn(async move {
        if let Err(e) = rushdino_common::asset_sync::sync_bundled_assets(&asset_home).await {
            tracing::warn!("asset_sync failed: {e}");
        }
    });

    tracing::info!("embedded rushdino server listening on http://127.0.0.1:{port}");

    Ok(ServerHandle {
        port,
        shutdown: Mutex::new(Some(tx)),
    })
}
