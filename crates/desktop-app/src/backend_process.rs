//! Spawns and supervises the bundled `rushdino-server` helper process.

use anyhow::{anyhow, Context as _, Result};
use rand::RngCore;

pub struct BackendProcess {
    child: tokio::process::Child,
    pub base_url: String,
    pub secret_hex: String,
}

impl BackendProcess {
    /// Start the server binary on a free local port and wait until healthy.
    pub async fn start() -> Result<Self> {
        let port = free_port()?;
        let base_url = format!("http://127.0.0.1:{port}");
        let secret_hex = random_secret_hex();

        let mut command = tokio::process::Command::new(server_binary_path()?);
        command
            .current_dir(dirs::home_dir().unwrap_or_else(|| std::path::PathBuf::from(".")))
            .env("RUSHDINO_HOST", "127.0.0.1")
            .env("RUSHDINO_PORT", port.to_string())
            .env("RUSHDINO_SECURITY__DASHBOARD_AUTH_ENABLED", "false")
            .env("RUSHDINO_SECURITY__HMAC_AUTH_ENABLED", "true")
            .env("RUSH_DINO_API_SECRET", &secret_hex)
            .env("RUSH_DINO_TRANSIENT_CONFIG", "1")
            .env("RUST_LOG", "info")
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null());
        #[cfg(target_os = "macos")]
        {
            // Keep the helper from stealing focus when launched from Finder.
            command.env("RUSHDINO_BACKGROUND", "1");
        }

        let mut child = command.spawn().context("spawn rushdino-server")?;

        for _ in 0..80 {
            if is_healthy(&base_url).await {
                return Ok(Self { child, base_url, secret_hex });
            }
            if let Some(status) = child.try_wait()? {
                drop(child.kill().await);
                anyhow::bail!("rushdino-server exited early with {status}");
            }
            tokio::time::sleep(std::time::Duration::from_millis(125)).await;
        }
        let _ = child.kill().await;
        Err(anyhow!("rushdino-server did not become healthy in time"))
    }

    pub async fn stop(&mut self) {
        let _ = self.child.kill().await;
    }
}

async fn is_healthy(base_url: &str) -> bool {
    let url = format!("{base_url}/healthz");
    let request = reqwest::Client::new().get(url).timeout(std::time::Duration::from_millis(500));
    matches!(request.send().await.map(|r| r.status().is_success()), Ok(true))
}

/// Locate `rushdino-server`: next to this binary, an env override, or the repo target dir.
fn server_binary_path() -> Result<std::path::PathBuf> {
    if let Some(path) = std::env::var_os("RUSHDINO_SERVER_BIN") {
        return Ok(std::path::PathBuf::from(path));
    }
    if let Ok(exe) = std::env::current_exe() {
        let dir = exe.parent().unwrap();
        for candidate in [
            dir.join("rushdino-server"),
            dir.join("../Resources/rushdino-server"),
        ] {
            if candidate.is_file() {
                return Ok(candidate);
            }
        }
    }
    let repo_build = std::path::PathBuf::from("../target/debug/rushdino-server");
    if repo_build.is_file() {
        return Ok(repo_build);
    }
    Err(anyhow!("rushdino-server binary not found"))
}

fn free_port() -> Result<u16> {
    let listener = std::net::TcpListener::bind(("127.0.0.1", 0))?;
    Ok(listener.local_addr()?.port())
}

fn random_secret_hex() -> String {
    let mut bytes = [0u8; 32];
    rand::rng().fill_bytes(&mut bytes);
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}
