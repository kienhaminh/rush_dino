/// Remote asset synchronization.
///
/// Replaces the old compile-time `include_str!` approach in `agents.rs` / `skills.rs`.
/// Files are downloaded from GitHub on first run and cached locally in `~/.rushdino/`.
/// Subsequent starts skip files that already exist — zero network cost.
use std::path::{Path, PathBuf};
use std::time::Duration;

use tracing::{info, warn};

use crate::agents::AGENT_NAMES;
use crate::skills::SKILL_PATHS;

/// Base URL for raw file access on GitHub. Points to the `main` branch of the
/// canonical repository. Override with the `RUSHDINO_ASSETS_BASE` environment
/// variable for forks or local development.
const DEFAULT_GITHUB_RAW_BASE: &str =
    "https://raw.githubusercontent.com/kienhaminh/rush_dino/refs/heads/main/crates/common/src";

fn assets_base() -> String {
    std::env::var("RUSHDINO_ASSETS_BASE").unwrap_or_else(|_| DEFAULT_GITHUB_RAW_BASE.to_owned())
}

/// Downloads missing agent templates and skill files into `~/.rushdino/`.
///
/// Files that already exist on disk are skipped. All downloads run concurrently.
/// Individual failures are logged as warnings but do not abort the process —
/// users with no internet connection get an empty agents directory, which is
/// acceptable (they can still add their own `.md` files manually).
pub async fn seed_bundled_assets(home: &Path) -> crate::error::Result<()> {
    let base = assets_base();

    // Collect (url, destination) pairs that are actually missing on disk.
    let pending: Vec<(String, PathBuf)> = build_pending_downloads(&base, home);

    if pending.is_empty() {
        info!("asset_sync: all bundled assets already present — skipping download");
        return Ok(());
    }

    info!(
        "asset_sync: downloading {} missing asset(s) from {}",
        pending.len(),
        base
    );

    let client = build_http_client()?;

    // Run all downloads concurrently and collect results.
    let results = download_all(&client, pending).await;

    let (ok, failed): (Vec<_>, Vec<_>) = results.into_iter().partition(Result::is_ok);
    for err in failed {
        warn!("asset_sync: {}", err.unwrap_err());
    }
    info!("asset_sync: {} asset(s) downloaded successfully", ok.len());

    Ok(())
}

/// Returns `(url, dest_path)` pairs for every asset that does not yet exist locally.
fn build_pending_downloads(base: &str, home: &Path) -> Vec<(String, PathBuf)> {
    let mut pending = Vec::new();

    // Agent markdown templates: `~/.rushdino/agents/<name>.md`
    for name in AGENT_NAMES {
        let dest = home.join("agents").join(format!("{name}.md"));
        if !dest.exists() {
            let url = format!("{base}/agents/{name}.md");
            pending.push((url, dest));
        }
    }

    // Skill file tree: `~/.rushdino/skills/<relative_path>`
    for rel_path in SKILL_PATHS {
        let dest = home.join("skills").join(rel_path);
        if !dest.exists() {
            let url = format!("{base}/skills/{rel_path}");
            pending.push((url, dest));
        }
    }

    pending
}

fn build_http_client() -> crate::error::Result<reqwest::Client> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .user_agent(concat!("rushdino/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| crate::error::AppError::Agent(format!("asset_sync: http client: {e}")))
}

/// Spawns one task per `(url, dest)` pair and awaits all of them.
async fn download_all(
    client: &reqwest::Client,
    pending: Vec<(String, PathBuf)>,
) -> Vec<crate::error::Result<()>> {
    let mut handles = Vec::with_capacity(pending.len());
    for (url, dest) in pending {
        let client = client.clone();
        handles.push(tokio::spawn(async move {
            fetch_and_write(client, url, dest).await
        }));
    }

    let mut results = Vec::with_capacity(handles.len());
    for handle in handles {
        match handle.await {
            Ok(r) => results.push(r),
            Err(join_err) => results.push(Err(crate::error::AppError::Agent(format!(
                "download task panicked: {join_err}"
            )))),
        }
    }
    results
}

/// Fetches `url` and writes the body to `dest`, creating parent directories as needed.
async fn fetch_and_write(
    client: reqwest::Client,
    url: String,
    dest: PathBuf,
) -> crate::error::Result<()> {
    // Create parent directories (e.g. `skills/skill-creator/scripts/`)
    if let Some(parent) = dest.parent() {
        tokio::fs::create_dir_all(parent).await.map_err(|e| {
            crate::error::AppError::Agent(format!("create dir {}: {e}", parent.display()))
        })?;
    }

    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| crate::error::AppError::Agent(format!("GET {url}: {e}")))?;

    if !response.status().is_success() {
        return Err(crate::error::AppError::Agent(format!(
            "GET {url}: HTTP {}",
            response.status()
        )));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|e| crate::error::AppError::Agent(format!("read body {url}: {e}")))?;

    tokio::fs::write(&dest, &bytes)
        .await
        .map_err(|e| crate::error::AppError::Agent(format!("write {}: {e}", dest.display())))?;

    info!(
        "asset_sync: ✔ {}",
        dest.file_name().unwrap_or_default().to_string_lossy()
    );
    Ok(())
}
