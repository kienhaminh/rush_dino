//! Version update API routes.
//!
//! Provides endpoints for checking for updates, triggering upgrades,
//! restarting the service, and skipping versions.

use axum::{extract::State, Json};
use serde::Deserialize;
use serde_json::json;

use rushdino_common::cleanup_manifests;
use rushdino_common::init;
use rushdino_common::release_check::{
    add_skipped_version, cached_version_check, fetch_releases, invalidate_cache,
    load_skipped_versions, resolve_latest_stable,
};
use rushdino_common::{AppError, Result};
use self_update::backends::github::Update;

use crate::state::AppState;

// ---------------------------------------------------------------------------
// GET /api/version/check
// ---------------------------------------------------------------------------

/// Check for available updates. Returns a [`VersionCheckResult`] as JSON.
///
/// Skipped versions are loaded from `~/.rushdino/skipped_versions.json` so
/// that previously dismissed updates are marked as such.
pub async fn check_version(_state: State<AppState>) -> Result<Json<serde_json::Value>> {
    let home = init::default_home_dir();
    let skipped = load_skipped_versions(&home);
    let result = cached_version_check(&skipped).await?;
    Ok(Json(json!(result)))
}

// ---------------------------------------------------------------------------
// POST /api/version/upgrade
// ---------------------------------------------------------------------------

/// Trigger a self-update to the latest stable release.
///
/// 1. Fetches all GitHub releases (blocking — runs in spawn_blocking).
/// 2. Resolves the latest stable release for the current platform.
/// 3. Runs the self_update binary replacement.
/// 4. Runs the cleanup manifest for the new version.
/// 5. Invalidates the version-check cache.
///
/// Returns `{ success, installed_version, cleanup_files }`.
pub async fn trigger_upgrade(_state: State<AppState>) -> Result<Json<serde_json::Value>> {
    // Fetch releases off the async executor — self_update uses reqwest blocking.
    let releases = tokio::task::spawn_blocking(fetch_releases)
        .await
        .map_err(|e| AppError::Agent(format!("spawn_blocking join error: {e}")))?
        .map_err(|e| AppError::Agent(format!("failed to fetch releases: {e}")))?;

    let resolved = resolve_latest_stable(&releases)?;
    let new_version = resolved.release.version.clone();

    // Run the binary replacement in a blocking thread.
    let repo_owner = rushdino_common::release_check::repo_owner().to_owned();
    let repo_name = rushdino_common::release_check::repo_name().to_owned();
    let bin_name = rushdino_common::release_check::bin_name().to_owned();
    let version_clone = new_version.clone();

    tokio::task::spawn_blocking(move || {
        Update::configure()
            .repo_owner(&repo_owner)
            .repo_name(&repo_name)
            .bin_name(&bin_name)
            .target_version_tag(&format!("v{version_clone}"))
            .no_confirm(true)
            .show_download_progress(false)
            .build()
            .map_err(|e| AppError::Agent(format!("self_update build error: {e}")))?
            .update()
            .map_err(|e| AppError::Agent(format!("self_update failed: {e}")))?;
        Ok::<_, AppError>(())
    })
    .await
    .map_err(|e| AppError::Agent(format!("spawn_blocking join error: {e}")))??;

    // Run cleanup manifest for the newly installed version.
    let home = init::default_home_dir();
    let cleanup_files =
        if let Some(manifest) = cleanup_manifests::get_cleanup_manifest(&new_version) {
            cleanup_manifests::execute_cleanup(&home, &manifest).unwrap_or_else(|e| {
                tracing::warn!("cleanup manifest execution failed: {e}");
                vec![]
            })
        } else {
            vec![]
        };

    // Invalidate cached version result so the next check reflects the upgrade.
    invalidate_cache().await;

    Ok(Json(json!({
        "success": true,
        "installed_version": new_version,
        "cleanup_files": cleanup_files,
    })))
}

// ---------------------------------------------------------------------------
// POST /api/version/restart
// ---------------------------------------------------------------------------

/// Trigger a graceful service restart.
///
/// Spawns a background task that sleeps 500 ms (so the HTTP response can
/// flush), then restarts the process via the appropriate service manager:
/// - macOS:   `launchctl unload` / `launchctl load` on the LaunchAgent plist
/// - Linux:   `systemctl --user restart rushdino`
/// - Fallback: `std::process::exit(0)` to let the service manager restart
///
/// Returns `{ "status": "restarting" }` immediately.
pub async fn trigger_restart(_state: State<AppState>) -> Result<Json<serde_json::Value>> {
    tokio::spawn(async move {
        // Give the response time to flush before we tear down.
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;

        #[cfg(target_os = "macos")]
        {
            // Resolve the user's home directory from the HOME env var, falling
            // back to "." so we always have a valid (if non-functional) path.
            let home = std::env::var("HOME")
                .map(std::path::PathBuf::from)
                .unwrap_or_else(|_| std::path::PathBuf::from("."));
            let plist = home.join("Library/LaunchAgents/com.rushdino.agent.plist");
            let plist_str = plist.to_string_lossy().into_owned();

            let _ = std::process::Command::new("launchctl")
                .args(["unload", &plist_str])
                .status();
            let _ = std::process::Command::new("launchctl")
                .args(["load", "-w", &plist_str])
                .status();
        }

        #[cfg(target_os = "linux")]
        {
            let _ = std::process::Command::new("systemctl")
                .args(["--user", "restart", "rushdino"])
                .status();
        }

        // Fallback for other platforms or if the commands above did not restart.
        #[cfg(not(any(target_os = "macos", target_os = "linux")))]
        {
            std::process::exit(0);
        }
    });

    Ok(Json(json!({ "status": "restarting" })))
}

// ---------------------------------------------------------------------------
// POST /api/version/skip
// ---------------------------------------------------------------------------

/// Request body for the skip endpoint.
#[derive(Debug, Deserialize)]
pub struct SkipVersionRequest {
    pub version: String,
}

/// Mark a version as skipped so it no longer surfaces in update notifications.
///
/// Persists the skipped version to `~/.rushdino/skipped_versions.json`.
/// Returns `{ status: "skipped", version }`.
pub async fn skip_version(
    _state: State<AppState>,
    Json(body): Json<SkipVersionRequest>,
) -> Result<Json<serde_json::Value>> {
    let home = init::default_home_dir();
    add_skipped_version(&home, &body.version)?;
    Ok(Json(
        json!({ "status": "skipped", "version": body.version }),
    ))
}
