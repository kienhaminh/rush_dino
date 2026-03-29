/// CLI release-updater: performs the actual binary-replacement install.
///
/// All shared resolution/version-check logic lives in
/// `rushdino_common::release_check`.  This module only keeps the
/// `self_update::backends::github::Update` builder (which is not needed by
/// the server) and thin `upgrade` / `downgrade` entry points.
use self_update::backends::github::Update;

use rushdino_common::release_check as release;
use rushdino_common::{
    release_check::{
        ensure_platform_asset, ensure_version_direction, fetch_releases, release_channel_label,
        resolve_exact_release, resolve_latest_beta, resolve_latest_stable, ResolvedRelease,
    },
    AppError, Result,
};

// Re-export types that CLI callers rely on.
pub use rushdino_common::release_check::{ReleaseAction, ReleaseChannel};

// ---------------------------------------------------------------------------
// Public entry points
// ---------------------------------------------------------------------------

pub fn upgrade(channel: ReleaseChannel, version: Option<String>) -> Result<String> {
    let releases = fetch_releases()?;
    let resolved = match channel {
        ReleaseChannel::Stable => resolve_latest_stable(&releases)?,
        ReleaseChannel::Beta => resolve_latest_beta(&releases)?,
        ReleaseChannel::Pinned => resolve_exact_release(
            &releases,
            version.as_deref().ok_or_else(|| {
                AppError::Validation("upgrade --version requires a value".to_string())
            })?,
        )?,
    };

    ensure_platform_asset(&resolved.release, &resolved.tag)?;
    ensure_version_direction(
        release::current_version(),
        &resolved.tag,
        ReleaseAction::Upgrade,
    )?;

    if resolved.release.version == release::current_version() {
        return Ok(format!(
            "Already up to date on v{} ({})",
            release::current_version(),
            release_channel_label(resolved.channel)
        ));
    }

    install_release(&resolved, ReleaseAction::Upgrade)
}

pub fn downgrade(version: String) -> Result<String> {
    let releases = fetch_releases()?;
    let resolved = resolve_exact_release(&releases, &version)?;
    ensure_platform_asset(&resolved.release, &resolved.tag)?;
    ensure_version_direction(
        release::current_version(),
        &resolved.tag,
        ReleaseAction::Downgrade,
    )?;
    install_release(&resolved, ReleaseAction::Downgrade)
}

// ---------------------------------------------------------------------------
// Binary installation (CLI-only: uses self_update::Update builder)
// ---------------------------------------------------------------------------

fn install_release(resolved: &ResolvedRelease, action: ReleaseAction) -> Result<String> {
    let status = Update::configure()
        .repo_owner(release::repo_owner())
        .repo_name(release::repo_name())
        .bin_name(release::bin_name())
        .identifier(&release::platform_asset_identifier())
        .target(&release::platform_target())
        .show_download_progress(true)
        .current_version(release::current_version())
        .target_version_tag(&resolved.tag)
        .build()
        .map_err(|e| AppError::Agent(format!("failed to configure self-update: {e}")))?
        .update()
        .map_err(|e| AppError::Agent(format!("failed to install {}: {e}", resolved.tag)))?;

    let action_label = match action {
        ReleaseAction::Upgrade => "Upgrade complete",
        ReleaseAction::Downgrade => "Downgrade complete",
    };

    Ok(format!(
        "{action_label}: current=v{} target={} channel={} installed={}",
        release::current_version(),
        resolved.tag,
        release_channel_label(resolved.channel),
        status.version()
    ))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {}
