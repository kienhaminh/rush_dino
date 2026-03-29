/// Remote asset synchronization.
///
/// Skills are downloaded from GitHub and cached in `~/.rushdino/skills/`.
/// A manifest file (`~/.rushdino/skills/.bundled_manifest.json`) tracks the
/// installed binary version and a SHA-256 hash of every bundled skill file.
///
/// On each `init` or `upgrade`:
/// - If the manifest version matches the running binary → nothing to do.
/// - If the version differs (or manifest is absent):
///   - Files that are absent or whose on-disk hash matches the stored original
///     hash (i.e. the user has not modified them) are re-downloaded.
///   - Files whose hash differs from the stored original are user-modified and
///     are left untouched; a warning is emitted instead.
///   - After all downloads complete the manifest is rewritten with the current
///     version and the fresh hashes.
///
/// Agent templates (`~/.rushdino/agents/`) use the original existence-only
/// check — they are user-editable identity files and should never be
/// overwritten automatically.
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::Duration;

use sha2::{Digest, Sha256};
use tracing::{info, warn};

use crate::agents::AGENT_NAMES;
use crate::skills::SKILL_PATHS;

/// Base URL for raw file access on GitHub. Points to the `main` branch of the
/// canonical repository. Override with the `RUSHDINO_ASSETS_BASE` environment
/// variable for forks or local development.
const DEFAULT_GITHUB_RAW_BASE: &str =
    "https://raw.githubusercontent.com/kienhaminh/rush_dino/refs/heads/main/crates/common/src";

/// Path of the manifest file relative to `~/.rushdino/skills/`.
const MANIFEST_FILENAME: &str = ".bundled_manifest.json";

fn assets_base() -> String {
    std::env::var("RUSHDINO_ASSETS_BASE").unwrap_or_else(|_| DEFAULT_GITHUB_RAW_BASE.to_owned())
}

// ── Manifest ─────────────────────────────────────────────────────────────────

#[derive(serde::Serialize, serde::Deserialize, Default)]
struct BundledManifest {
    /// Binary version that wrote this manifest (matches `CARGO_PKG_VERSION`).
    version: String,
    /// Maps skill relative path → SHA-256 hex of the file as it was originally
    /// downloaded. Used to detect user modifications before overwriting.
    files: HashMap<String, String>,
}

impl BundledManifest {
    fn load(skills_dir: &Path) -> Self {
        let path = skills_dir.join(MANIFEST_FILENAME);
        std::fs::read_to_string(&path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    }

    fn save(&self, skills_dir: &Path) -> crate::error::Result<()> {
        let path = skills_dir.join(MANIFEST_FILENAME);
        let json = serde_json::to_string_pretty(self)
            .map_err(|e| crate::error::AppError::Agent(format!("manifest serialize: {e}")))?;
        std::fs::write(&path, json)
            .map_err(|e| crate::error::AppError::Agent(format!("manifest write: {e}")))?;
        Ok(())
    }
}

// ── Public API ────────────────────────────────────────────────────────────────

/// Version-aware skill sync.  Called from both `rushdino init` and
/// `rushdino upgrade`.
///
/// Agent templates are synced with the legacy existence-only strategy because
/// they are personal identity files the user is expected to customise.
pub async fn sync_bundled_assets(home: &Path) -> crate::error::Result<()> {
    // Agent templates: download only when missing (never overwrite).
    seed_agent_templates(home).await;

    // Skills: version + hash-aware sync.
    sync_bundled_skills(home).await
}

// ── Agent templates (existence-only) ─────────────────────────────────────────

async fn seed_agent_templates(home: &Path) {
    let base = assets_base();
    let mut pending = Vec::new();

    for name in AGENT_NAMES {
        let dest = home.join("agents").join(format!("{name}.md"));
        if !dest.exists() {
            pending.push((format!("{base}/agents/{name}.md"), dest));
        }
    }

    if pending.is_empty() {
        info!("asset_sync: all agent templates already present");
        return;
    }

    info!(
        "asset_sync: downloading {} missing agent template(s)",
        pending.len()
    );

    if let Ok(client) = build_http_client() {
        let results = download_all(&client, pending).await;
        let failed = results.iter().filter(|r| r.is_err()).count();
        if failed > 0 {
            warn!("asset_sync: {failed} agent template(s) failed to download");
        }
    }
}

// ── Skill sync (version + hash aware) ────────────────────────────────────────

async fn sync_bundled_skills(home: &Path) -> crate::error::Result<()> {
    let skills_dir = home.join("skills");
    let current_version = env!("CARGO_PKG_VERSION");
    let base = assets_base();

    let manifest = BundledManifest::load(&skills_dir);

    if manifest.version == current_version {
        info!(
            "asset_sync: bundled skills are up-to-date (v{})",
            current_version
        );
        return Ok(());
    }

    info!(
        "asset_sync: skill version mismatch (installed={:?}, current={}) — syncing",
        if manifest.version.is_empty() {
            "none"
        } else {
            &manifest.version
        },
        current_version
    );

    // Determine which skill files need (re-)downloading.
    let mut pending: Vec<(String, PathBuf)> = Vec::new();
    let mut skipped_modified: Vec<&str> = Vec::new();

    for rel_path in SKILL_PATHS {
        let dest = skills_dir.join(rel_path);

        if dest.exists() {
            let on_disk_hash = sha256_file(&dest);
            let stored_hash = manifest.files.get(*rel_path).map(String::as_str).unwrap_or("");

            if !stored_hash.is_empty() && on_disk_hash != stored_hash {
                // User modified this file — preserve it.
                skipped_modified.push(rel_path);
                continue;
            }
        }

        // File is absent or pristine — queue for download.
        pending.push((format!("{base}/skills/{rel_path}"), dest));
    }

    for path in &skipped_modified {
        warn!(
            "asset_sync: skipping modified skill file (user changes preserved): {path}"
        );
    }

    if pending.is_empty() && skipped_modified.len() == SKILL_PATHS.len() {
        info!("asset_sync: all skill files are user-modified — updating manifest version only");
        let new_manifest = BundledManifest {
            version: current_version.to_owned(),
            files: manifest.files,
        };
        new_manifest.save(&skills_dir)?;
        return Ok(());
    }

    // Download all pending files concurrently.
    let client = build_http_client()?;
    let results = download_all(&client, pending.clone()).await;

    let (ok, failed): (Vec<_>, Vec<_>) = results.into_iter().partition(Result::is_ok);
    for err in failed {
        warn!("asset_sync: {}", err.unwrap_err());
    }
    info!(
        "asset_sync: {} skill file(s) updated, {} skipped (user-modified)",
        ok.len(),
        skipped_modified.len()
    );

    // Rebuild manifest: start from the old entries, then update hashes for
    // every successfully downloaded file.
    let mut new_files = manifest.files;
    for (_, dest) in &pending {
        if dest.exists() {
            let rel = dest
                .strip_prefix(&skills_dir)
                .map(|p| p.to_string_lossy().replace('\\', "/"))
                .unwrap_or_default();
            new_files.insert(rel, sha256_file(dest));
        }
    }

    BundledManifest {
        version: current_version.to_owned(),
        files: new_files,
    }
    .save(&skills_dir)?;

    Ok(())
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn sha256_file(path: &Path) -> String {
    let bytes = std::fs::read(path).unwrap_or_default();
    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    hex::encode(hasher.finalize())
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
