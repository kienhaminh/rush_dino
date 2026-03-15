use std::cmp::Ordering;
use std::env::consts::{ARCH, OS};

use self_update::{
    backends::github::{ReleaseList, Update},
    update::Release,
};
use semver::Version;

use rushdino_common::{AppError, Result};

const REPO_OWNER: &str = "rushdino";
const REPO_NAME: &str = "rushdino";
const BIN_NAME: &str = "rushdino";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ReleaseChannel {
    Stable,
    Beta,
    Pinned,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ReleaseAction {
    Upgrade,
    Downgrade,
}

#[derive(Debug, Clone)]
pub struct ResolvedRelease {
    pub release: Release,
    pub tag: String,
    pub channel: ReleaseChannel,
}

pub fn normalize_version_tag(version: &str) -> String {
    if version.starts_with('v') {
        version.to_string()
    } else {
        format!("v{version}")
    }
}

pub fn resolve_latest_stable(releases: &[Release]) -> Result<ResolvedRelease> {
    let release = releases
        .iter()
        .filter(|release| !is_beta_tag(&tag_for_release(release)))
        .filter(|release| {
            release
                .asset_for(&platform_target(), Some(&platform_asset_identifier()))
                .is_some()
        })
        .max_by(|left, right| compare_releases_desc(left, right))
        .cloned()
        .ok_or_else(|| {
            AppError::NotFound("no stable release found for this platform".to_string())
        })?;

    Ok(ResolvedRelease {
        tag: tag_for_release(&release),
        release,
        channel: ReleaseChannel::Stable,
    })
}

pub fn resolve_latest_beta(releases: &[Release]) -> Result<ResolvedRelease> {
    let release = releases
        .iter()
        .filter(|release| is_beta_tag(&tag_for_release(release)))
        .filter(|release| {
            release
                .asset_for(&platform_target(), Some(&platform_asset_identifier()))
                .is_some()
        })
        .max_by(|left, right| compare_releases_desc(left, right))
        .cloned()
        .ok_or_else(|| AppError::NotFound("no beta release found for this platform".to_string()))?;

    Ok(ResolvedRelease {
        tag: tag_for_release(&release),
        release,
        channel: ReleaseChannel::Beta,
    })
}

pub fn resolve_exact_release(releases: &[Release], version: &str) -> Result<ResolvedRelease> {
    let normalized = normalize_version_tag(version);
    let release = releases
        .iter()
        .find(|release| tag_for_release(release) == normalized)
        .cloned()
        .ok_or_else(|| AppError::NotFound(format!("release tag not found: {normalized}")))?;

    Ok(ResolvedRelease {
        tag: normalized,
        release,
        channel: ReleaseChannel::Pinned,
    })
}

pub fn ensure_version_direction(
    current_version: &str,
    target_tag: &str,
    action: ReleaseAction,
) -> Result<()> {
    let target = parse_release_version(target_tag)?;
    let current = Version::parse(current_version).map_err(|err| {
        AppError::Validation(format!("invalid current version {current_version}: {err}"))
    })?;

    match action {
        ReleaseAction::Upgrade if target < current => Err(AppError::Validation(format!(
            "requested upgrade target {target_tag} is older than current version v{current_version}"
        ))),
        ReleaseAction::Downgrade if target >= current => Err(AppError::Validation(format!(
            "requested downgrade target {target_tag} must be older than current version v{current_version}"
        ))),
        _ => Ok(()),
    }
}

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
    ensure_version_direction(current_version(), &resolved.tag, ReleaseAction::Upgrade)?;

    if resolved.release.version == current_version() {
        return Ok(format!(
            "Already up to date on v{} ({})",
            current_version(),
            release_channel_label(resolved.channel)
        ));
    }

    install_release(&resolved, ReleaseAction::Upgrade)
}

pub fn downgrade(version: String) -> Result<String> {
    let releases = fetch_releases()?;
    let resolved = resolve_exact_release(&releases, &version)?;
    ensure_platform_asset(&resolved.release, &resolved.tag)?;
    ensure_version_direction(current_version(), &resolved.tag, ReleaseAction::Downgrade)?;
    install_release(&resolved, ReleaseAction::Downgrade)
}

pub fn current_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

pub fn release_channel_label(channel: ReleaseChannel) -> &'static str {
    match channel {
        ReleaseChannel::Stable => "stable",
        ReleaseChannel::Beta => "beta",
        ReleaseChannel::Pinned => "pinned",
    }
}

pub fn platform_target() -> String {
    let arch_name = match ARCH {
        "x86_64" => "x86_64",
        "aarch64" => "aarch64",
        "arm64" => "aarch64",
        other => other,
    };
    format!("{OS}-{arch_name}")
}

pub fn repo_owner() -> &'static str {
    REPO_OWNER
}

pub fn repo_name() -> &'static str {
    REPO_NAME
}

pub fn bin_name() -> &'static str {
    BIN_NAME
}

pub fn platform_asset_identifier() -> String {
    format!("{}-{}", BIN_NAME, platform_target())
}

fn parse_release_version(_tag: &str) -> Result<Version> {
    let normalized = normalize_version_tag(_tag);
    Version::parse(normalized.trim_start_matches('v'))
        .map_err(|err| AppError::Validation(format!("invalid release tag {normalized}: {err}")))
}

fn is_beta_tag(tag: &str) -> bool {
    parse_release_version(tag)
        .map(|version| version.pre.as_str().starts_with("beta."))
        .unwrap_or(false)
}

fn tag_for_release(release: &Release) -> String {
    format!("v{}", release.version)
}

fn compare_releases_desc(left: &Release, right: &Release) -> Ordering {
    let left_tag = tag_for_release(left);
    let right_tag = tag_for_release(right);
    let left_version = parse_release_version(&left_tag).expect("release tag should parse");
    let right_version = parse_release_version(&right_tag).expect("release tag should parse");
    left_version.cmp(&right_version)
}

fn fetch_releases() -> Result<Vec<Release>> {
    ReleaseList::configure()
        .repo_owner(repo_owner())
        .repo_name(repo_name())
        .build()
        .map_err(|err| AppError::Agent(format!("failed to configure release lookup: {err}")))?
        .fetch()
        .map_err(|err| AppError::Agent(format!("failed to fetch GitHub releases: {err}")))
}

fn ensure_platform_asset(release: &Release, tag: &str) -> Result<()> {
    if release
        .asset_for(&platform_target(), Some(&platform_asset_identifier()))
        .is_none()
    {
        return Err(AppError::NotFound(format!(
            "release {tag} has no asset for {}",
            platform_asset_identifier()
        )));
    }
    Ok(())
}

fn install_release(resolved: &ResolvedRelease, action: ReleaseAction) -> Result<String> {
    let mut update = Update::configure();
    let status = update
        .repo_owner(repo_owner())
        .repo_name(repo_name())
        .bin_name(bin_name())
        .identifier(&platform_asset_identifier())
        .target(&platform_target())
        .show_download_progress(true)
        .current_version(current_version())
        .target_version_tag(&resolved.tag)
        .build()
        .map_err(|err| AppError::Agent(format!("failed to configure self-update: {err}")))?
        .update()
        .map_err(|err| AppError::Agent(format!("failed to install {}: {err}", resolved.tag)))?;

    let action_label = match action {
        ReleaseAction::Upgrade => "Upgrade complete",
        ReleaseAction::Downgrade => "Downgrade complete",
    };

    Ok(format!(
        "{action_label}: current=v{} target={} channel={} installed={}",
        current_version(),
        resolved.tag,
        release_channel_label(resolved.channel),
        status.version()
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn release(tag: &str) -> Release {
        let asset_name = platform_asset_identifier();
        Release {
            name: tag.to_string(),
            version: tag.trim_start_matches('v').to_string(),
            date: "2026-03-15T00:00:00Z".to_string(),
            body: None,
            assets: vec![self_update::update::ReleaseAsset {
                name: asset_name.clone(),
                download_url: format!("https://example.com/{asset_name}"),
            }],
        }
    }

    #[test]
    fn normalize_version_tag_accepts_tagged_and_untagged_inputs() {
        assert_eq!(normalize_version_tag("1.2.3"), "v1.2.3");
        assert_eq!(normalize_version_tag("v1.2.3-beta.1"), "v1.2.3-beta.1");
    }

    #[test]
    fn latest_stable_selection_excludes_prereleases() {
        let releases = vec![
            release("v1.2.3-beta.1"),
            release("v1.2.2"),
            release("v1.2.3"),
        ];

        let resolved = resolve_latest_stable(&releases).expect("stable release should resolve");
        assert_eq!(resolved.tag, "v1.2.3");
        assert_eq!(resolved.channel, ReleaseChannel::Stable);
    }

    #[test]
    fn latest_beta_selection_chooses_highest_prerelease() {
        let releases = vec![
            release("v1.2.3-beta.1"),
            release("v1.2.3-beta.2"),
            release("v1.2.3"),
        ];

        let resolved = resolve_latest_beta(&releases).expect("beta release should resolve");
        assert_eq!(resolved.tag, "v1.2.3-beta.2");
        assert_eq!(resolved.channel, ReleaseChannel::Beta);
    }

    #[test]
    fn exact_release_lookup_accepts_prerelease_input() {
        let releases = vec![release("v1.2.3-beta.2"), release("v1.2.3")];

        let resolved = resolve_exact_release(&releases, "1.2.3-beta.2")
            .expect("exact prerelease should resolve");
        assert_eq!(resolved.tag, "v1.2.3-beta.2");
        assert_eq!(resolved.channel, ReleaseChannel::Pinned);
    }

    #[test]
    fn downgrade_rejects_same_version_target() {
        let err = ensure_version_direction("1.2.3", "v1.2.3", ReleaseAction::Downgrade)
            .expect_err("same version downgrade should fail");

        assert!(err.to_string().contains("older"));
    }

    #[test]
    fn downgrade_rejects_newer_version_target() {
        let err = ensure_version_direction("1.2.3", "v1.2.4", ReleaseAction::Downgrade)
            .expect_err("newer version downgrade should fail");

        assert!(err.to_string().contains("older"));
    }
}
