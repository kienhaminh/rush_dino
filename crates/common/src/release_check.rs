/// Shared release-checking logic used by both CLI and server crates.
///
/// Provides version resolution, caching, and platform helpers so the server
/// can expose version-check API endpoints without depending on the CLI crate.
use std::cmp::Ordering;
use std::env::consts::{ARCH, OS};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use self_update::{backends::github::ReleaseList, update::Release};
use semver::Version;
use serde::Serialize;

use crate::{AppError, Result};

// ---------------------------------------------------------------------------
// Repository constants
// ---------------------------------------------------------------------------

const REPO_OWNER: &str = "kienhaminh";
const REPO_NAME: &str = "rush_dino";
const BIN_NAME: &str = "rushdino";

/// Cache TTL for version checks — 1 hour.
const CACHE_TTL: Duration = Duration::from_secs(3600);

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
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

/// Result returned by [`cached_version_check`].
#[derive(Debug, Clone, Serialize)]
pub struct VersionCheckResult {
    /// Version tag of the latest stable release (e.g. `"v1.2.3"`).
    pub latest_stable: String,
    /// Version tag of the latest beta release, if one exists.
    pub latest_beta: Option<String>,
    /// Whether the running binary is behind the latest stable release.
    pub update_available: bool,
    /// Whether the release body contains `[CRITICAL]` or `[HOTFIX]`.
    pub is_critical: bool,
    /// The version string currently running.
    pub current_version: String,
}

// ---------------------------------------------------------------------------
// Version-check cache
// ---------------------------------------------------------------------------

struct CachedCheck {
    result: VersionCheckResult,
    fetched_at: Instant,
}

fn version_cache() -> &'static Mutex<Option<CachedCheck>> {
    static CACHE: OnceLock<Mutex<Option<CachedCheck>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(None))
}

/// Invalidate the in-process version-check cache (useful after an upgrade).
pub fn invalidate_cache() {
    if let Ok(mut guard) = version_cache().lock() {
        *guard = None;
    }
}

/// Return a cached [`VersionCheckResult`], refreshing when the 1-hour TTL
/// expires.  `skipped_versions` is informational only — it does not affect
/// resolution but is threaded through to callers that want to suppress
/// notifications for already-skipped versions.
pub fn cached_version_check(_skipped_versions: &[String]) -> Result<VersionCheckResult> {
    // Check cache under lock first
    {
        let guard = version_cache()
            .lock()
            .map_err(|_| AppError::Agent("version check cache lock poisoned".to_string()))?;

        if let Some(cached) = guard.as_ref() {
            if cached.fetched_at.elapsed() < CACHE_TTL {
                return Ok(cached.result.clone());
            }
        }
    }

    // Cache miss or expired — fetch from GitHub
    let result = fetch_version_check_result()?;

    {
        let mut guard = version_cache()
            .lock()
            .map_err(|_| AppError::Agent("version check cache lock poisoned".to_string()))?;

        *guard = Some(CachedCheck {
            result: result.clone(),
            fetched_at: Instant::now(),
        });
    }

    Ok(result)
}

fn fetch_version_check_result() -> Result<VersionCheckResult> {
    let releases = fetch_releases()?;
    let current = current_version().to_string();

    let stable = resolve_latest_stable(&releases)?;
    let stable_tag = stable.tag.clone();

    let beta = resolve_latest_beta(&releases).ok().map(|r| r.tag);

    let current_semver = Version::parse(&current)
        .map_err(|e| AppError::Validation(format!("invalid current version {current}: {e}")))?;
    let stable_semver = parse_release_version(&stable_tag)?;
    let update_available = stable_semver > current_semver;

    let is_critical = stable
        .release
        .body
        .as_deref()
        .is_some_and(is_critical_release);

    Ok(VersionCheckResult {
        latest_stable: stable_tag,
        latest_beta: beta,
        update_available,
        is_critical,
        current_version: current,
    })
}

// ---------------------------------------------------------------------------
// Release resolution
// ---------------------------------------------------------------------------

/// Return the highest stable (non-prerelease) release that has an asset for
/// the current platform.
pub fn resolve_latest_stable(releases: &[Release]) -> Result<ResolvedRelease> {
    let release = releases
        .iter()
        .filter(|r| !is_beta_tag(&tag_for_release(r)))
        .filter(|r| {
            r.asset_for(&platform_target(), Some(&platform_asset_identifier()))
                .is_some()
        })
        .max_by(|l, r| compare_releases_desc(l, r))
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

/// Return the highest beta (prerelease) release that has an asset for the
/// current platform.
pub fn resolve_latest_beta(releases: &[Release]) -> Result<ResolvedRelease> {
    let release = releases
        .iter()
        .filter(|r| is_beta_tag(&tag_for_release(r)))
        .filter(|r| {
            r.asset_for(&platform_target(), Some(&platform_asset_identifier()))
                .is_some()
        })
        .max_by(|l, r| compare_releases_desc(l, r))
        .cloned()
        .ok_or_else(|| {
            AppError::NotFound("no beta release found for this platform".to_string())
        })?;

    Ok(ResolvedRelease {
        tag: tag_for_release(&release),
        release,
        channel: ReleaseChannel::Beta,
    })
}

/// Return the exact release matching `version` (with or without a leading
/// `v` prefix).
pub fn resolve_exact_release(releases: &[Release], version: &str) -> Result<ResolvedRelease> {
    let normalized = normalize_version_tag(version);
    let release = releases
        .iter()
        .find(|r| tag_for_release(r) == normalized)
        .cloned()
        .ok_or_else(|| AppError::NotFound(format!("release tag not found: {normalized}")))?;

    Ok(ResolvedRelease {
        tag: normalized,
        release,
        channel: ReleaseChannel::Pinned,
    })
}

// ---------------------------------------------------------------------------
// Version helpers
// ---------------------------------------------------------------------------

/// Normalise a version string to always carry a leading `v`.
///
/// ```
/// # use rushdino_common::release_check::normalize_version_tag;
/// assert_eq!(normalize_version_tag("1.2.3"),       "v1.2.3");
/// assert_eq!(normalize_version_tag("v1.2.3-beta.1"), "v1.2.3-beta.1");
/// ```
pub fn normalize_version_tag(version: &str) -> String {
    if version.starts_with('v') {
        version.to_string()
    } else {
        format!("v{version}")
    }
}

/// Parse the semver inside a release tag (strips the leading `v`).
pub fn parse_release_version(tag: &str) -> Result<Version> {
    let normalized = normalize_version_tag(tag);
    Version::parse(normalized.trim_start_matches('v'))
        .map_err(|e| AppError::Validation(format!("invalid release tag {normalized}: {e}")))
}

/// Enforce that the `target_tag` is in the expected direction relative to
/// `current_version`.
///
/// - [`ReleaseAction::Upgrade`]   → target must be ≥ current
/// - [`ReleaseAction::Downgrade`] → target must be < current
pub fn ensure_version_direction(
    current_version: &str,
    target_tag: &str,
    action: ReleaseAction,
) -> Result<()> {
    let target = parse_release_version(target_tag)?;
    let current = Version::parse(current_version).map_err(|e| {
        AppError::Validation(format!("invalid current version {current_version}: {e}"))
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

/// Verify `release` carries an asset for the current platform, or return an
/// [`AppError::NotFound`].
pub fn ensure_platform_asset(release: &Release, tag: &str) -> Result<()> {
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

// ---------------------------------------------------------------------------
// Critical-release detection
// ---------------------------------------------------------------------------

/// Return `true` when the release body contains `[CRITICAL]` or `[HOTFIX]`
/// (case-insensitive).
pub fn is_critical_release(body: &str) -> bool {
    let lower = body.to_lowercase();
    lower.contains("[critical]") || lower.contains("[hotfix]")
}

// ---------------------------------------------------------------------------
// Platform helpers
// ---------------------------------------------------------------------------

/// Return the human-readable current version from the compiled binary.
pub fn current_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

/// E.g. `"linux-x86_64"` or `"macos-aarch64"`.
pub fn platform_target() -> String {
    let arch_name = match ARCH {
        "x86_64" => "x86_64",
        "aarch64" | "arm64" => "aarch64",
        other => other,
    };
    format!("{OS}-{arch_name}")
}

/// E.g. `"rushdino-linux-x86_64"`.
pub fn platform_asset_identifier() -> String {
    format!("{BIN_NAME}-{}", platform_target())
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

pub fn release_channel_label(channel: ReleaseChannel) -> &'static str {
    match channel {
        ReleaseChannel::Stable => "stable",
        ReleaseChannel::Beta => "beta",
        ReleaseChannel::Pinned => "pinned",
    }
}

// ---------------------------------------------------------------------------
// GitHub fetch
// ---------------------------------------------------------------------------

/// Fetch all releases from the GitHub repository.
pub fn fetch_releases() -> Result<Vec<Release>> {
    ReleaseList::configure()
        .repo_owner(repo_owner())
        .repo_name(repo_name())
        .build()
        .map_err(|e| AppError::Agent(format!("failed to configure release lookup: {e}")))?
        .fetch()
        .map_err(|e| AppError::Agent(format!("failed to fetch GitHub releases: {e}")))
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

fn is_beta_tag(tag: &str) -> bool {
    parse_release_version(tag)
        .map(|v| v.pre.as_str().starts_with("beta."))
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use self_update::update::ReleaseAsset;

    use super::*;

    /// Build a fake [`Release`] whose asset name matches the current platform.
    fn release(tag: &str) -> Release {
        let asset_name = platform_asset_identifier();
        Release {
            name: tag.to_string(),
            version: tag.trim_start_matches('v').to_string(),
            date: "2026-03-15T00:00:00Z".to_string(),
            body: None,
            assets: vec![ReleaseAsset {
                name: asset_name.clone(),
                download_url: format!("https://example.com/{asset_name}"),
            }],
        }
    }

    /// Build a fake [`Release`] with a custom release body.
    fn release_with_body(tag: &str, body: &str) -> Release {
        let mut r = release(tag);
        r.body = Some(body.to_string());
        r
    }

    // --- normalize_version_tag ---

    #[test]
    fn normalize_version_tag_accepts_tagged_and_untagged_inputs() {
        assert_eq!(normalize_version_tag("1.2.3"), "v1.2.3");
        assert_eq!(normalize_version_tag("v1.2.3-beta.1"), "v1.2.3-beta.1");
    }

    // --- is_critical_release ---

    #[test]
    fn critical_detection_matches_case_insensitive_critical_tag() {
        assert!(is_critical_release("[CRITICAL] important security fix"));
        assert!(is_critical_release("[critical] lower case"));
        assert!(is_critical_release("some text [Critical] mixed case"));
    }

    #[test]
    fn critical_detection_matches_hotfix_tag() {
        assert!(is_critical_release("[HOTFIX] patch something"));
        assert!(is_critical_release("[hotfix] lower case hotfix"));
    }

    #[test]
    fn critical_detection_returns_false_for_normal_release() {
        assert!(!is_critical_release("Routine maintenance release"));
        assert!(!is_critical_release(""));
        assert!(!is_critical_release("critical without brackets"));
    }

    // --- resolve_latest_stable ---

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
    fn latest_stable_returns_error_when_only_betas_exist() {
        let releases = vec![release("v1.2.3-beta.1"), release("v1.2.3-beta.2")];
        let result = resolve_latest_stable(&releases);
        assert!(result.is_err());
    }

    // --- resolve_latest_beta ---

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
    fn latest_beta_returns_error_when_no_beta_exists() {
        let releases = vec![release("v1.2.3"), release("v1.2.2")];
        let result = resolve_latest_beta(&releases);
        assert!(result.is_err());
    }

    // --- resolve_exact_release ---

    #[test]
    fn exact_release_lookup_accepts_prerelease_input() {
        let releases = vec![release("v1.2.3-beta.2"), release("v1.2.3")];

        let resolved = resolve_exact_release(&releases, "1.2.3-beta.2")
            .expect("exact prerelease should resolve");
        assert_eq!(resolved.tag, "v1.2.3-beta.2");
        assert_eq!(resolved.channel, ReleaseChannel::Pinned);
    }

    #[test]
    fn exact_release_returns_error_for_missing_tag() {
        let releases = vec![release("v1.2.3")];
        let result = resolve_exact_release(&releases, "v9.9.9");
        assert!(result.is_err());
    }

    // --- ensure_version_direction ---

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

    #[test]
    fn downgrade_accepts_older_version_target() {
        ensure_version_direction("1.2.3", "v1.2.2", ReleaseAction::Downgrade)
            .expect("older version should be a valid downgrade target");
    }

    #[test]
    fn upgrade_rejects_older_version_target() {
        let err = ensure_version_direction("1.2.3", "v1.2.2", ReleaseAction::Upgrade)
            .expect_err("older version upgrade should fail");
        assert!(err.to_string().contains("older"));
    }

    #[test]
    fn upgrade_accepts_newer_version_target() {
        ensure_version_direction("1.2.3", "v1.2.4", ReleaseAction::Upgrade)
            .expect("newer version should be a valid upgrade target");
    }

    // --- is_critical_release via release body ---

    #[test]
    fn resolve_latest_stable_carries_critical_body() {
        let releases = vec![release_with_body(
            "v1.2.3",
            "## Changes\n[CRITICAL] CVE-2026-001 fix",
        )];
        let resolved = resolve_latest_stable(&releases).unwrap();
        let body = resolved.release.body.as_deref().unwrap();
        assert!(is_critical_release(body));
    }
}
