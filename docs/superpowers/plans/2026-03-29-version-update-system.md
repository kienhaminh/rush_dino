# Version Update System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a frontend-driven version update system with animated navbar notification, one-click upgrade, skip persistence, and per-version cleanup manifests.

**Architecture:** Extract shared release-checking logic from CLI to `crates/common`. Add `/api/version/*` endpoints to the server. Frontend gets a React hook + dialog component in the navbar header. Cleanup manifests are embedded at compile time.

**Tech Stack:** Rust (axum, self_update, semver, serde_json, arc-swap), React (TypeScript, Radix Dialog, lucide-react, sonner toasts), Tailwind CSS

---

### Task 1: Extract shared release logic to `crates/common/src/release_check.rs`

**Files:**
- Create: `crates/common/src/release_check.rs`
- Modify: `crates/common/src/lib.rs:1-12`
- Modify: `crates/common/Cargo.toml:7-25`
- Modify: `crates/cli/src/commands/release_updater.rs` (simplify imports)
- Modify: `crates/cli/Cargo.toml:22` (keep self_update for install logic)

- [ ] **Step 1: Add `semver` and `self_update` dependencies to common Cargo.toml**

Add to `crates/common/Cargo.toml` under `[dependencies]`:

```toml
semver.workspace = true
self_update = { workspace = true }
```

- [ ] **Step 2: Create `crates/common/src/release_check.rs`**

This module contains all the shared release-checking logic extracted from the CLI's `release_updater.rs`. The CLI will import from here instead of defining its own.

```rust
use std::cmp::Ordering;
use std::env::consts::{ARCH, OS};
use std::sync::OnceLock;
use std::time::{Duration, Instant};

use self_update::backends::github::ReleaseList;
use self_update::update::Release;
use semver::Version;
use serde::Serialize;
use tokio::sync::Mutex;

use crate::{AppError, Result};

const REPO_OWNER: &str = "kienhaminh";
const REPO_NAME: &str = "rush_dino";
const BIN_NAME: &str = "rushdino";
const CACHE_TTL: Duration = Duration::from_secs(3600);

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

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

#[derive(Debug, Clone, Serialize)]
pub struct VersionCheckResult {
    pub current_version: String,
    pub latest_version: String,
    pub has_update: bool,
    pub is_critical: bool,
    pub release_notes: Option<String>,
    pub release_url: String,
    pub skipped: bool,
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

struct CachedCheck {
    result: VersionCheckResult,
    fetched_at: Instant,
}

static VERSION_CACHE: OnceLock<Mutex<Option<CachedCheck>>> = OnceLock::new();

fn cache_mutex() -> &'static Mutex<Option<CachedCheck>> {
    VERSION_CACHE.get_or_init(|| Mutex::new(None))
}

pub async fn invalidate_cache() {
    let mut guard = cache_mutex().lock().await;
    *guard = None;
}

pub async fn cached_version_check(skipped_versions: &[String]) -> Result<VersionCheckResult> {
    let mut guard = cache_mutex().lock().await;
    if let Some(cached) = guard.as_ref() {
        if cached.fetched_at.elapsed() < CACHE_TTL {
            let mut result = cached.result.clone();
            result.skipped =
                !result.is_critical && skipped_versions.contains(&result.latest_version);
            return Ok(result);
        }
    }

    let result = check_for_update_inner(skipped_versions)?;
    *guard = Some(CachedCheck {
        result: result.clone(),
        fetched_at: Instant::now(),
    });
    Ok(result)
}

fn check_for_update_inner(skipped_versions: &[String]) -> Result<VersionCheckResult> {
    let releases = fetch_releases()?;
    let current = current_version();

    let resolved = match resolve_latest_stable(&releases) {
        Ok(r) => r,
        Err(_) => {
            return Ok(VersionCheckResult {
                current_version: current.to_string(),
                latest_version: current.to_string(),
                has_update: false,
                is_critical: false,
                release_notes: None,
                release_url: format!(
                    "https://github.com/{REPO_OWNER}/{REPO_NAME}/releases"
                ),
                skipped: false,
            });
        }
    };

    let latest_semver = parse_release_version(&resolved.tag)?;
    let current_semver =
        Version::parse(current).map_err(|e| AppError::Validation(e.to_string()))?;
    let has_update = latest_semver > current_semver;
    let is_critical = resolved
        .release
        .body
        .as_deref()
        .map(is_critical_release)
        .unwrap_or(false);
    let latest_ver = resolved.release.version.clone();
    let skipped = !is_critical && skipped_versions.contains(&latest_ver);

    Ok(VersionCheckResult {
        current_version: current.to_string(),
        latest_version: latest_ver,
        has_update,
        is_critical,
        release_notes: resolved.release.body.clone(),
        release_url: format!(
            "https://github.com/{REPO_OWNER}/{REPO_NAME}/releases/tag/{}",
            resolved.tag
        ),
        skipped,
    })
}

// ---------------------------------------------------------------------------
// Release resolution (reusable by CLI)
// ---------------------------------------------------------------------------

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
        .filter(|r| !is_beta_tag(&tag_for_release(r)))
        .filter(|r| {
            r.asset_for(&platform_target(), Some(&platform_asset_identifier()))
                .is_some()
        })
        .max_by(|a, b| compare_releases(a, b))
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
        .filter(|r| is_beta_tag(&tag_for_release(r)))
        .filter(|r| {
            r.asset_for(&platform_target(), Some(&platform_asset_identifier()))
                .is_some()
        })
        .max_by(|a, b| compare_releases(a, b))
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
        .find(|r| tag_for_release(r) == normalized)
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

pub fn fetch_releases() -> Result<Vec<Release>> {
    ReleaseList::configure()
        .repo_owner(REPO_OWNER)
        .repo_name(REPO_NAME)
        .build()
        .map_err(|err| AppError::Agent(format!("failed to configure release lookup: {err}")))?
        .fetch()
        .map_err(|err| AppError::Agent(format!("failed to fetch GitHub releases: {err}")))
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

// ---------------------------------------------------------------------------
// Critical detection
// ---------------------------------------------------------------------------

pub fn is_critical_release(body: &str) -> bool {
    let lower = body.to_lowercase();
    lower.contains("[critical]") || lower.contains("[hotfix]")
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

pub fn parse_release_version(tag: &str) -> Result<Version> {
    let normalized = normalize_version_tag(tag);
    Version::parse(normalized.trim_start_matches('v'))
        .map_err(|err| AppError::Validation(format!("invalid release tag {normalized}: {err}")))
}

fn is_beta_tag(tag: &str) -> bool {
    parse_release_version(tag)
        .map(|v| v.pre.as_str().starts_with("beta."))
        .unwrap_or(false)
}

fn tag_for_release(release: &Release) -> String {
    format!("v{}", release.version)
}

fn compare_releases(left: &Release, right: &Release) -> Ordering {
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
    use super::*;

    fn make_release(tag: &str, body: Option<&str>) -> Release {
        let asset_name = platform_asset_identifier();
        Release {
            name: tag.to_string(),
            version: tag.trim_start_matches('v').to_string(),
            date: "2026-03-15T00:00:00Z".to_string(),
            body: body.map(|s| s.to_string()),
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
    fn is_critical_detects_markers() {
        assert!(is_critical_release("This is a [CRITICAL] fix for auth"));
        assert!(is_critical_release("Emergency [HOTFIX] for data loss"));
        assert!(is_critical_release("[critical] lowercase also works"));
        assert!(!is_critical_release("Regular release with improvements"));
    }

    #[test]
    fn latest_stable_excludes_prereleases() {
        let releases = vec![
            make_release("v1.2.3-beta.1", None),
            make_release("v1.2.2", None),
            make_release("v1.2.3", None),
        ];
        let resolved = resolve_latest_stable(&releases).unwrap();
        assert_eq!(resolved.tag, "v1.2.3");
        assert_eq!(resolved.channel, ReleaseChannel::Stable);
    }

    #[test]
    fn latest_beta_chooses_highest_prerelease() {
        let releases = vec![
            make_release("v1.2.3-beta.1", None),
            make_release("v1.2.3-beta.2", None),
            make_release("v1.2.3", None),
        ];
        let resolved = resolve_latest_beta(&releases).unwrap();
        assert_eq!(resolved.tag, "v1.2.3-beta.2");
        assert_eq!(resolved.channel, ReleaseChannel::Beta);
    }

    #[test]
    fn exact_release_lookup_works() {
        let releases = vec![make_release("v1.2.3-beta.2", None), make_release("v1.2.3", None)];
        let resolved = resolve_exact_release(&releases, "1.2.3-beta.2").unwrap();
        assert_eq!(resolved.tag, "v1.2.3-beta.2");
        assert_eq!(resolved.channel, ReleaseChannel::Pinned);
    }

    #[test]
    fn downgrade_rejects_same_version() {
        let err = ensure_version_direction("1.2.3", "v1.2.3", ReleaseAction::Downgrade)
            .expect_err("same version downgrade should fail");
        assert!(err.to_string().contains("older"));
    }

    #[test]
    fn downgrade_rejects_newer_version() {
        let err = ensure_version_direction("1.2.3", "v1.2.4", ReleaseAction::Downgrade)
            .expect_err("newer version downgrade should fail");
        assert!(err.to_string().contains("older"));
    }
}
```

- [ ] **Step 3: Register the module in `crates/common/src/lib.rs`**

Add after line 11 (`pub mod workflow_templates;`):

```rust
pub mod release_check;
```

- [ ] **Step 4: Run tests to verify the new module compiles and passes**

Run: `cargo test -p rushdino-common -- release_check`
Expected: All tests PASS

- [ ] **Step 5: Simplify CLI `release_updater.rs` to use shared logic**

Replace `crates/cli/src/commands/release_updater.rs` to import from common and only keep install logic:

```rust
use self_update::backends::github::Update;

use rushdino_common::release_check::{
    self, ReleaseAction, ReleaseChannel, ResolvedRelease,
};
use rushdino_common::{AppError, Result};

// Re-export for CLI callers
pub use rushdino_common::release_check::{
    current_version, ensure_version_direction, fetch_releases, normalize_version_tag,
    release_channel_label, resolve_exact_release, resolve_latest_beta, resolve_latest_stable,
};

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

    release_check::ensure_platform_asset(&resolved.release, &resolved.tag)?;
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
    release_check::ensure_platform_asset(&resolved.release, &resolved.tag)?;
    ensure_version_direction(current_version(), &resolved.tag, ReleaseAction::Downgrade)?;
    install_release(&resolved, ReleaseAction::Downgrade)
}

fn install_release(resolved: &ResolvedRelease, action: ReleaseAction) -> Result<String> {
    let mut update = Update::configure();
    let status = update
        .repo_owner(release_check::repo_owner())
        .repo_name(release_check::repo_name())
        .bin_name(release_check::bin_name())
        .identifier(&release_check::platform_asset_identifier())
        .target(&release_check::platform_target())
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
```

- [ ] **Step 6: Run all CLI tests**

Run: `cargo test -p rushdino-cli`
Expected: All existing tests PASS (upgrade/downgrade parsing tests are in main.rs and should still work)

- [ ] **Step 7: Commit**

```bash
git add crates/common/src/release_check.rs crates/common/src/lib.rs crates/common/Cargo.toml crates/cli/src/commands/release_updater.rs
git commit -m "refactor: extract shared release-check logic to rushdino-common"
```

---

### Task 2: Add cleanup manifest system to `crates/common`

**Files:**
- Create: `crates/common/src/cleanup_manifests.rs`
- Create: `crates/common/src/cleanup_manifests/` (directory for JSON files)

- [ ] **Step 1: Create the cleanup manifests directory**

Run: `mkdir -p crates/common/src/cleanup_manifests`

- [ ] **Step 2: Create a placeholder manifest for the current version**

Create `crates/common/src/cleanup_manifests/v0.2.0.json`:

```json
{
  "version": "0.2.0",
  "remove": []
}
```

This is a placeholder. Real entries will be added as files become obsolete in future versions.

- [ ] **Step 3: Create `crates/common/src/cleanup_manifests.rs`**

```rust
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

use serde::Deserialize;
use tracing;

use crate::{AppError, Result};

#[derive(Debug, Clone, Deserialize)]
pub struct CleanupManifest {
    pub version: String,
    pub remove: Vec<String>,
}

/// Deny-listed directory prefixes that manifests cannot touch.
const DENY_LIST: &[&str] = &[
    "memory/",
    "documents/",
    "agents/",
    "skills/",
    "workspaces/",
    "data.db",
    "credentials.toml",
];

/// Load the embedded cleanup manifest for a given version tag (e.g. "0.2.0").
/// Returns `None` if no manifest exists for that version.
pub fn get_cleanup_manifest(version: &str) -> Option<CleanupManifest> {
    let stripped = version.trim_start_matches('v');
    // Embed all JSON manifests at compile time
    let json_str = match stripped {
        "0.2.0" => include_str!("cleanup_manifests/v0.2.0.json"),
        _ => return None,
    };
    serde_json::from_str(json_str).ok()
}

/// Validate that all paths in the manifest are safe (no traversal, not in deny-list).
pub fn validate_manifest(manifest: &CleanupManifest) -> Result<()> {
    for path in &manifest.remove {
        if path.contains("..") {
            return Err(AppError::Validation(format!(
                "cleanup manifest path contains traversal: {path}"
            )));
        }
        for denied in DENY_LIST {
            if path.starts_with(denied) || path == denied.trim_end_matches('/') {
                return Err(AppError::Validation(format!(
                    "cleanup manifest cannot remove protected path: {path}"
                )));
            }
        }
    }
    Ok(())
}

/// Execute the cleanup manifest against the given RushDino home directory.
/// Returns the list of paths that were actually removed.
pub fn execute_cleanup(home: &Path, manifest: &CleanupManifest) -> Result<Vec<String>> {
    validate_manifest(manifest)?;

    let mut removed = Vec::new();
    for relative in &manifest.remove {
        let target = home.join(relative);

        // Safety: ensure the resolved path is still within home
        let canonical_home = home.canonicalize().unwrap_or_else(|_| home.to_path_buf());
        if let Ok(canonical_target) = target.canonicalize() {
            if !canonical_target.starts_with(&canonical_home) {
                tracing::warn!(
                    "cleanup: skipping path that escapes home dir: {}",
                    relative
                );
                continue;
            }
        }

        if target.is_dir() {
            if let Err(e) = fs::remove_dir_all(&target) {
                tracing::warn!("cleanup: failed to remove dir {}: {e}", target.display());
            } else {
                tracing::info!("cleanup: removed dir {}", target.display());
                removed.push(relative.clone());
            }
        } else if target.is_file() {
            if let Err(e) = fs::remove_file(&target) {
                tracing::warn!("cleanup: failed to remove file {}: {e}", target.display());
            } else {
                tracing::info!("cleanup: removed file {}", target.display());
                removed.push(relative.clone());
            }
        }
    }
    Ok(removed)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn rejects_path_traversal() {
        let manifest = CleanupManifest {
            version: "0.2.0".to_string(),
            remove: vec!["../etc/passwd".to_string()],
        };
        assert!(validate_manifest(&manifest).is_err());
    }

    #[test]
    fn rejects_protected_paths() {
        for protected in &["memory/daily/file.md", "documents/readme.md", "agents/foo", "data.db", "credentials.toml"] {
            let manifest = CleanupManifest {
                version: "0.2.0".to_string(),
                remove: vec![protected.to_string()],
            };
            assert!(
                validate_manifest(&manifest).is_err(),
                "should reject: {protected}"
            );
        }
    }

    #[test]
    fn accepts_valid_paths() {
        let manifest = CleanupManifest {
            version: "0.2.0".to_string(),
            remove: vec![
                "old-template.md".to_string(),
                "deprecated-dir/".to_string(),
            ],
        };
        assert!(validate_manifest(&manifest).is_ok());
    }

    #[test]
    fn execute_cleanup_removes_files_and_dirs() {
        let tmp = tempfile::tempdir().unwrap();
        let home = tmp.path();

        // Create test files
        fs::write(home.join("old-template.md"), "old").unwrap();
        fs::create_dir_all(home.join("deprecated-dir")).unwrap();
        fs::write(home.join("deprecated-dir/file.txt"), "data").unwrap();

        let manifest = CleanupManifest {
            version: "0.2.0".to_string(),
            remove: vec![
                "old-template.md".to_string(),
                "deprecated-dir".to_string(),
                "nonexistent-file.txt".to_string(),
            ],
        };

        let removed = execute_cleanup(home, &manifest).unwrap();
        assert!(removed.contains(&"old-template.md".to_string()));
        assert!(removed.contains(&"deprecated-dir".to_string()));
        assert!(!removed.contains(&"nonexistent-file.txt".to_string()));
        assert!(!home.join("old-template.md").exists());
        assert!(!home.join("deprecated-dir").exists());
    }

    #[test]
    fn placeholder_manifest_loads() {
        let manifest = get_cleanup_manifest("0.2.0");
        assert!(manifest.is_some());
        assert!(manifest.unwrap().remove.is_empty());
    }
}
```

- [ ] **Step 4: Register module in `crates/common/src/lib.rs`**

Add after the `release_check` line:

```rust
pub mod cleanup_manifests;
```

- [ ] **Step 5: Add `tempfile` dev-dependency to common Cargo.toml**

Add to `crates/common/Cargo.toml`:

```toml
[dev-dependencies]
tempfile = "3"
```

- [ ] **Step 6: Run tests**

Run: `cargo test -p rushdino-common -- cleanup_manifests`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add crates/common/src/cleanup_manifests.rs crates/common/src/cleanup_manifests/ crates/common/src/lib.rs crates/common/Cargo.toml
git commit -m "feat: add cleanup manifest system for version upgrades"
```

---

### Task 3: Add skip persistence helpers to `crates/common`

**Files:**
- Modify: `crates/common/src/release_check.rs` (add skip functions)

- [ ] **Step 1: Add skip persistence functions to `release_check.rs`**

Append before the `#[cfg(test)]` block at the bottom of `crates/common/src/release_check.rs`:

```rust
// ---------------------------------------------------------------------------
// Skip persistence
// ---------------------------------------------------------------------------

pub fn skipped_versions_path(home: &Path) -> PathBuf {
    home.join("skipped_versions.json")
}

pub fn load_skipped_versions(home: &Path) -> Vec<String> {
    let path = skipped_versions_path(home);
    std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

pub fn add_skipped_version(home: &Path, version: &str) -> Result<()> {
    let mut skipped = load_skipped_versions(home);
    let normalized = version.trim_start_matches('v').to_string();
    if !skipped.contains(&normalized) {
        skipped.push(normalized);
    }
    let json = serde_json::to_string_pretty(&skipped)
        .map_err(|e| AppError::Agent(format!("failed to serialize skipped versions: {e}")))?;
    std::fs::write(skipped_versions_path(home), json)?;
    Ok(())
}
```

Add these imports at the top of the file (alongside existing ones):

```rust
use std::path::{Path, PathBuf};
```

- [ ] **Step 2: Add tests for skip persistence**

Add inside the existing `mod tests` block:

```rust
    #[test]
    fn skip_persistence_roundtrips() {
        let tmp = tempfile::tempdir().unwrap();
        let home = tmp.path();

        assert!(load_skipped_versions(home).is_empty());

        add_skipped_version(home, "0.2.0").unwrap();
        add_skipped_version(home, "v0.3.0").unwrap();
        add_skipped_version(home, "0.2.0").unwrap(); // duplicate

        let skipped = load_skipped_versions(home);
        assert_eq!(skipped, vec!["0.2.0", "0.3.0"]);
    }
```

Add `tempfile` dev-dep (already added in Task 2).

- [ ] **Step 3: Run tests**

Run: `cargo test -p rushdino-common -- release_check`
Expected: All tests PASS including the new skip persistence test

- [ ] **Step 4: Commit**

```bash
git add crates/common/src/release_check.rs
git commit -m "feat: add skip persistence for version update notifications"
```

---

### Task 4: Add server version API routes

**Files:**
- Create: `crates/server/src/routes/version.rs`
- Modify: `crates/server/src/routes/mod.rs:27`
- Modify: `crates/server/src/lib.rs` (route registration around line 578)
- Modify: `crates/server/Cargo.toml` (add `self_update` dep)

- [ ] **Step 1: Add `self_update` and `semver` to server Cargo.toml**

Add to `crates/server/Cargo.toml` under `[dependencies]`:

```toml
self_update = { workspace = true }
semver.workspace = true
```

- [ ] **Step 2: Create `crates/server/src/routes/version.rs`**

```rust
use axum::{extract::State, Json};
use serde::{Deserialize, Serialize};
use serde_json::json;

use rushdino_common::cleanup_manifests;
use rushdino_common::init;
use rushdino_common::release_check::{
    self, cached_version_check, fetch_releases, invalidate_cache, load_skipped_versions,
    add_skipped_version, resolve_latest_stable, ensure_platform_asset, ensure_version_direction,
    current_version, ReleaseAction,
};
use rushdino_common::{AppError, Result};

use self_update::backends::github::Update;

use crate::state::AppState;

// ---------------------------------------------------------------------------
// GET /api/version/check
// ---------------------------------------------------------------------------

pub async fn check_version(State(state): State<AppState>) -> Result<Json<serde_json::Value>> {
    let home = init::canonical_home_dir();
    let skipped = load_skipped_versions(&home);
    let result = cached_version_check(&skipped).await?;
    Ok(Json(serde_json::to_value(result).map_err(|e| {
        AppError::Agent(format!("failed to serialize version check: {e}"))
    })?))
}

// ---------------------------------------------------------------------------
// POST /api/version/upgrade
// ---------------------------------------------------------------------------

#[derive(Serialize)]
struct UpgradeResponse {
    success: bool,
    installed_version: String,
    cleanup_files: Vec<String>,
}

pub async fn trigger_upgrade(State(state): State<AppState>) -> Result<Json<UpgradeResponse>> {
    let releases = fetch_releases()?;
    let resolved = resolve_latest_stable(&releases)?;

    ensure_platform_asset(&resolved.release, &resolved.tag)?;
    ensure_version_direction(current_version(), &resolved.tag, ReleaseAction::Upgrade)?;

    if resolved.release.version == current_version() {
        return Ok(Json(UpgradeResponse {
            success: true,
            installed_version: current_version().to_string(),
            cleanup_files: vec![],
        }));
    }

    // Perform the binary upgrade
    let mut update = Update::configure();
    update
        .repo_owner(release_check::repo_owner())
        .repo_name(release_check::repo_name())
        .bin_name(release_check::bin_name())
        .identifier(&release_check::platform_asset_identifier())
        .target(&release_check::platform_target())
        .show_download_progress(false)
        .current_version(current_version())
        .target_version_tag(&resolved.tag)
        .no_confirm(true)
        .build()
        .map_err(|err| AppError::Agent(format!("failed to configure self-update: {err}")))?
        .update()
        .map_err(|err| AppError::Agent(format!("failed to install {}: {err}", resolved.tag)))?;

    // Run cleanup manifest for the new version
    let home = init::canonical_home_dir();
    let cleanup_files =
        if let Some(manifest) = cleanup_manifests::get_cleanup_manifest(&resolved.release.version) {
            cleanup_manifests::execute_cleanup(&home, &manifest).unwrap_or_default()
        } else {
            vec![]
        };

    // Invalidate version check cache
    invalidate_cache().await;

    Ok(Json(UpgradeResponse {
        success: true,
        installed_version: resolved.release.version,
        cleanup_files,
    }))
}

// ---------------------------------------------------------------------------
// POST /api/version/restart
// ---------------------------------------------------------------------------

pub async fn trigger_restart(State(_state): State<AppState>) -> Result<Json<serde_json::Value>> {
    // Spawn the restart in a background task so the response is sent first
    tokio::spawn(async {
        // Give the HTTP response time to flush
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;

        let binary = std::env::current_exe().unwrap_or_default();
        let binary_path = binary.to_str().unwrap_or("rushdino");

        #[cfg(target_os = "macos")]
        {
            let plist_path = dirs::home_dir()
                .unwrap_or_default()
                .join("Library/LaunchAgents/com.rushdino.agent.plist");
            if plist_path.exists() {
                let _ = std::process::Command::new("launchctl")
                    .args(["unload", plist_path.to_str().unwrap_or("")])
                    .status();
                let _ = std::process::Command::new("launchctl")
                    .args(["load", "-w", plist_path.to_str().unwrap_or("")])
                    .status();
                return;
            }
        }

        #[cfg(target_os = "linux")]
        {
            let _ = std::process::Command::new("systemctl")
                .args(["--user", "restart", "rushdino"])
                .status();
            return;
        }

        // Fallback: exit and let the service manager restart us
        std::process::exit(0);
    });

    Ok(Json(json!({ "status": "restarting" })))
}

// ---------------------------------------------------------------------------
// POST /api/version/skip
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct SkipRequest {
    version: String,
}

pub async fn skip_version(
    State(_state): State<AppState>,
    Json(body): Json<SkipRequest>,
) -> Result<Json<serde_json::Value>> {
    let home = init::canonical_home_dir();
    add_skipped_version(&home, &body.version)?;
    Ok(Json(json!({ "status": "skipped", "version": body.version })))
}
```

- [ ] **Step 3: Register module in `crates/server/src/routes/mod.rs`**

Add at the end of the file (after line 27):

```rust
pub mod version;
```

- [ ] **Step 4: Register routes in `crates/server/src/lib.rs`**

Add the following routes after the sandbox routes block (after line 617, before `.fallback`):

```rust
        // Version update API
        .route("/api/version/check", get(routes::version::check_version))
        .route("/api/version/upgrade", post(routes::version::trigger_upgrade))
        .route("/api/version/restart", post(routes::version::trigger_restart))
        .route("/api/version/skip", post(routes::version::skip_version))
```

- [ ] **Step 5: Verify it compiles**

Run: `cargo check -p rushdino-server`
Expected: Compiles without errors

- [ ] **Step 6: Commit**

```bash
git add crates/server/src/routes/version.rs crates/server/src/routes/mod.rs crates/server/src/lib.rs crates/server/Cargo.toml
git commit -m "feat: add /api/version/* endpoints for update check, upgrade, restart, skip"
```

---

### Task 5: Add frontend API functions

**Files:**
- Modify: `frontend/src/lib/api.ts` (append new functions)

- [ ] **Step 1: Add version API types and functions to `api.ts`**

Append at the end of `frontend/src/lib/api.ts`:

```typescript
// ---------------------------------------------------------------------------
// Version update API
// ---------------------------------------------------------------------------

export type VersionCheckResponse = {
  current_version: string;
  latest_version: string;
  has_update: boolean;
  is_critical: boolean;
  release_notes: string | null;
  release_url: string;
  skipped: boolean;
};

export type UpgradeResponse = {
  success: boolean;
  installed_version: string;
  cleanup_files: string[];
};

export async function fetchVersionCheck(): Promise<VersionCheckResponse> {
  const response = await fetch('/api/version/check');
  return parseJsonOrThrow(response, '/api/version/check');
}

export async function triggerUpgrade(): Promise<UpgradeResponse> {
  const response = await fetch('/api/version/upgrade', { method: 'POST' });
  return parseJsonOrThrow(response, '/api/version/upgrade');
}

export async function triggerRestart(): Promise<{ status: string }> {
  const response = await fetch('/api/version/restart', { method: 'POST' });
  return parseJsonOrThrow(response, '/api/version/restart');
}

export async function skipVersion(version: string): Promise<{ status: string; version: string }> {
  const response = await fetch('/api/version/skip', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ version }),
  });
  return parseJsonOrThrow(response, '/api/version/skip');
}
```

- [ ] **Step 2: Verify frontend compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/api.ts
git commit -m "feat: add frontend API functions for version update endpoints"
```

---

### Task 6: Create version check React hook

**Files:**
- Create: `frontend/src/hooks/use-version-check.ts`

- [ ] **Step 1: Create the hook**

```typescript
import { useCallback, useEffect, useState } from 'react';

import { fetchVersionCheck, skipVersion, triggerUpgrade, triggerRestart } from '@/lib/api';
import type { VersionCheckResponse, UpgradeResponse } from '@/lib/api';

type UpgradeState = 'idle' | 'upgrading' | 'upgraded' | 'restarting' | 'error';

export function useVersionCheck() {
  const [data, setData] = useState<VersionCheckResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [upgradeState, setUpgradeState] = useState<UpgradeState>('idle');
  const [upgradeResult, setUpgradeResult] = useState<UpgradeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const check = useCallback(async () => {
    try {
      setIsLoading(true);
      const result = await fetchVersionCheck();
      setData(result);
    } catch (err) {
      // Silently fail — version check is non-critical
      console.warn('Version check failed:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    check();
  }, [check]);

  const doUpgrade = useCallback(async () => {
    try {
      setUpgradeState('upgrading');
      setError(null);
      const result = await triggerUpgrade();
      setUpgradeResult(result);
      setUpgradeState('upgraded');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upgrade failed');
      setUpgradeState('error');
    }
  }, []);

  const doRestart = useCallback(async () => {
    try {
      setUpgradeState('restarting');
      await triggerRestart();
      // Server will drop the connection — wait and reload
      setTimeout(() => {
        window.location.reload();
      }, 3000);
    } catch {
      // Expected: connection drops during restart
      setTimeout(() => {
        window.location.reload();
      }, 3000);
    }
  }, []);

  const doSkip = useCallback(async () => {
    if (!data) return;
    try {
      await skipVersion(data.latest_version);
      setData((prev) => (prev ? { ...prev, skipped: true } : prev));
    } catch (err) {
      console.warn('Skip version failed:', err);
    }
  }, [data]);

  return {
    data,
    isLoading,
    upgradeState,
    upgradeResult,
    error,
    doUpgrade,
    doRestart,
    doSkip,
    refresh: check,
  };
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/use-version-check.ts
git commit -m "feat: add useVersionCheck hook for version update state management"
```

---

### Task 7: Create version update dialog component

**Files:**
- Create: `frontend/src/components/version-update-dialog.tsx`

- [ ] **Step 1: Create the dialog component**

```tsx
import { ArrowUpCircle, AlertTriangle, Loader2, RotateCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useVersionCheck } from '@/hooks/use-version-check';

interface VersionUpdateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function VersionUpdateDialog({ open, onOpenChange }: VersionUpdateDialogProps) {
  const { data, upgradeState, upgradeResult, error, doUpgrade, doRestart, doSkip } =
    useVersionCheck();

  if (!data || !data.has_update) return null;

  const handleSkip = async () => {
    await doSkip();
    onOpenChange(false);
  };

  const handleRemindLater = () => {
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {data.is_critical ? (
              <AlertTriangle className="h-5 w-5 text-red-500" />
            ) : (
              <ArrowUpCircle className="h-5 w-5 text-emerald-500" />
            )}
            Update Available
          </DialogTitle>
          <DialogDescription>
            <div className="mt-2 flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                v{data.current_version}
              </Badge>
              <span className="text-muted-foreground">&rarr;</span>
              <Badge
                variant="outline"
                className={`text-xs ${
                  data.is_critical
                    ? 'border-red-500/40 bg-red-500/10 text-red-400'
                    : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                }`}
              >
                v{data.latest_version}
              </Badge>
              {data.is_critical && (
                <Badge variant="destructive" className="text-[10px]">
                  CRITICAL
                </Badge>
              )}
            </div>
          </DialogDescription>
        </DialogHeader>

        {data.is_critical && (
          <div className="rounded-md border border-red-500/30 bg-red-500/5 p-3 text-xs text-red-400">
            This is a critical update that includes important fixes. You must update to continue.
          </div>
        )}

        {data.release_notes && (
          <div className="max-h-40 overflow-y-auto rounded-md border border-border/40 bg-muted/30 p-3 text-xs text-muted-foreground">
            <pre className="whitespace-pre-wrap font-body">{data.release_notes}</pre>
          </div>
        )}

        {upgradeState === 'error' && error && (
          <div className="rounded-md border border-red-500/30 bg-red-500/5 p-3 text-xs text-red-400">
            {error}
          </div>
        )}

        {upgradeState === 'upgraded' && upgradeResult && (
          <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs text-emerald-400">
            Updated to v{upgradeResult.installed_version}.
            {upgradeResult.cleanup_files.length > 0 && (
              <span> Cleaned up {upgradeResult.cleanup_files.length} obsolete file(s).</span>
            )}
            {' '}Restart to apply.
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {upgradeState === 'idle' || upgradeState === 'error' ? (
            <>
              {!data.is_critical && (
                <>
                  <Button variant="ghost" size="sm" onClick={handleSkip}>
                    Skip This Version
                  </Button>
                  <Button variant="ghost" size="sm" onClick={handleRemindLater}>
                    Remind Me Later
                  </Button>
                </>
              )}
              <Button
                size="sm"
                onClick={doUpgrade}
                className={
                  data.is_critical
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }
              >
                <ArrowUpCircle className="mr-1.5 h-3.5 w-3.5" />
                Update Now
              </Button>
            </>
          ) : upgradeState === 'upgrading' ? (
            <Button size="sm" disabled>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              Downloading...
            </Button>
          ) : upgradeState === 'upgraded' ? (
            <Button size="sm" onClick={doRestart}>
              <RotateCw className="mr-1.5 h-3.5 w-3.5" />
              Restart Now
            </Button>
          ) : upgradeState === 'restarting' ? (
            <Button size="sm" disabled>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              Restarting...
            </Button>
          ) : null}
        </DialogFooter>

        {data.release_url && (
          <div className="text-center">
            <a
              href={data.release_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-muted-foreground underline hover:text-foreground"
            >
              View full release notes
            </a>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/version-update-dialog.tsx
git commit -m "feat: add VersionUpdateDialog component with upgrade/skip/restart flow"
```

---

### Task 8: Add version update icon to AppLayout navbar

**Files:**
- Modify: `frontend/src/layouts/AppLayout.tsx`

- [ ] **Step 1: Add imports and state to AppLayout**

Replace the full content of `frontend/src/layouts/AppLayout.tsx`:

```tsx
import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { ArrowUpCircle } from 'lucide-react';

import { Sidebar } from '@/components/sidebar/sidebar';
import { ThemeToggle } from '@/components/sidebar/theme-toggle';
import { Badge } from '@/components/ui/badge';
import { VersionUpdateDialog } from '@/components/version-update-dialog';
import { resolvePageHeader } from '@/lib/dashboard-routes';
import { useChatWsConnection } from '@/hooks/use-chat-ws';
import { useVersionCheck } from '@/hooks/use-version-check';

export function AppLayout() {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isUpdateDialogOpen, setIsUpdateDialogOpen] = useState(false);
  const location = useLocation();
  const shellView = resolvePageHeader(location.pathname);
  const { isConnected } = useChatWsConnection();
  const { data: versionData } = useVersionCheck();

  const showUpdateIcon = versionData?.has_update && !versionData.skipped;
  const isCritical = versionData?.is_critical ?? false;

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background font-body text-foreground">
      <Sidebar
        collapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed((value) => !value)}
      />

      <div className="relative flex min-w-0 flex-1 overflow-hidden">
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
          <header className="sticky top-0 z-10 flex h-[72px] shrink-0 items-center justify-between border-b border-border/40 bg-background/85 px-6 backdrop-blur-md">
            <div className="flex min-w-0 items-center gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <h2 className="font-display text-lg font-bold uppercase leading-none tracking-tight">
                    {shellView.title}
                  </h2>
                  {shellView.detail ? (
                    <Badge variant="outline" className="h-5 px-1.5 text-[10px] uppercase">
                      {shellView.detail}
                    </Badge>
                  ) : null}
                  {shellView.id === 'workspace' ? (
                    <Badge
                      variant="outline"
                      className={`h-5 px-1.5 text-[10px] uppercase tracking-widest font-bold ${
                        isConnected
                          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                          : 'border-red-500/40 bg-red-500/10 text-red-400'
                      }`}
                    >
                      {isConnected ? 'Connected' : 'Disconnected'}
                    </Badge>
                  ) : null}
                </div>
                <p className="mt-1 truncate text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  {shellView.subtitle}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {showUpdateIcon && (
                <button
                  onClick={() => setIsUpdateDialogOpen(true)}
                  className="relative flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-muted"
                  title={`Update available: v${versionData?.latest_version}`}
                >
                  <ArrowUpCircle
                    className={`h-4.5 w-4.5 ${isCritical ? 'text-red-500' : 'text-emerald-500'}`}
                  />
                  <span
                    className={`absolute right-1 top-1 h-2 w-2 rounded-full animate-pulse ${
                      isCritical ? 'bg-red-500' : 'bg-emerald-500'
                    }`}
                  />
                </button>
              )}
              <ThemeToggle />
              <div className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary ring-1 ring-primary/20 shadow-sm transition-colors hover:bg-primary/20">
                KH
              </div>
            </div>
          </header>

          <div className="relative flex min-h-0 flex-1 overflow-hidden">
            <Outlet />
          </div>
        </main>
      </div>

      <VersionUpdateDialog open={isUpdateDialogOpen} onOpenChange={setIsUpdateDialogOpen} />
    </div>
  );
}
```

- [ ] **Step 2: Verify frontend compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Verify frontend builds**

Run: `cd frontend && npm run build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add frontend/src/layouts/AppLayout.tsx
git commit -m "feat: add version update icon with pulse animation to navbar header"
```

---

### Task 9: Update release script for criticality prompt

**Files:**
- Modify: `scripts/release.sh`

- [ ] **Step 1: Add criticality prompt to `release.sh`**

In `scripts/release.sh`, add the criticality prompt inside the `run_release` function, after line 228 (`ensure_tag_absent "$tag"` / beta tag calculation) and before line 230 (`if [[ "$BUMP_MODE" != "none" ]]; then`). Insert:

```bash
  # Ask whether this is a critical/hotfix release
  release_body=""
  echo ""
  echo "Is this a critical/hotfix release?"
  echo "  1) No (normal release)"
  echo "  2) Yes (critical/hotfix — users cannot skip this update)"
  read -r -p "Choice [1]: " criticality_choice
  case "${criticality_choice:-1}" in
    2)
      release_body="[CRITICAL] "
      echo "Marked as CRITICAL release."
      ;;
    *)
      echo "Normal release."
      ;;
  esac
```

Then update the `git tag` line (line 241) to use an annotated tag with the release body:

Replace:
```bash
  git -C "$repo_root" tag "$tag"
```

With:
```bash
  if [[ -n "$release_body" ]]; then
    git -C "$repo_root" tag -a "$tag" -m "${release_body}Release ${tag}"
  else
    git -C "$repo_root" tag "$tag"
  fi
```

- [ ] **Step 2: Update GitHub Actions workflow to pass tag message as release body**

In `.github/workflows/release.yml`, add a step in the `publish` job to extract the tag message, and pass it to the release action. Replace both `softprops/action-gh-release` steps with:

```yaml
      - name: Extract tag message
        id: tag_message
        run: |
          TAG_MSG=$(git tag -l --format='%(contents)' "${{ github.ref_name }}" 2>/dev/null || echo "")
          echo "message<<EOF" >> "$GITHUB_OUTPUT"
          echo "$TAG_MSG" >> "$GITHUB_OUTPUT"
          echo "EOF" >> "$GITHUB_OUTPUT"
      - name: Publish beta release
        if: contains(github.ref_name, '-beta.')
        uses: softprops/action-gh-release@v2
        with:
          files: release-dist/**
          prerelease: true
          make_latest: false
          body: ${{ steps.tag_message.outputs.message }}
      - name: Publish stable release
        if: ${{ !contains(github.ref_name, '-beta.') }}
        uses: softprops/action-gh-release@v2
        with:
          files: release-dist/**
          make_latest: true
          body: ${{ steps.tag_message.outputs.message }}
```

Note: The `publish` job needs a checkout step to access the tag message. Add before the extract step:

```yaml
      - uses: actions/checkout@v5
        with:
          fetch-depth: 0
```

- [ ] **Step 3: Commit**

```bash
git add scripts/release.sh .github/workflows/release.yml
git commit -m "feat: add criticality prompt to release script, pass tag message to GitHub release"
```

---

### Task 10: Integration test — full build verification

**Files:** None created (verification only)

- [ ] **Step 1: Run all Rust tests**

Run: `cargo test --workspace`
Expected: All tests PASS

- [ ] **Step 2: Build the full release binary**

Run: `cargo build --release -p rushdino-cli`
Expected: Build succeeds

- [ ] **Step 3: Build the frontend**

Run: `cd frontend && npm run build`
Expected: Build succeeds

- [ ] **Step 4: Verify the version check endpoint compiles into the server**

Run: `cargo build -p rushdino-server`
Expected: Build succeeds

- [ ] **Step 5: Final commit — update spec status**

Update `docs/superpowers/specs/2026-03-29-version-update-system-design.md` first line status from `Draft` to `Implemented`.

```bash
git add docs/superpowers/specs/2026-03-29-version-update-system-design.md
git commit -m "docs: mark version update system spec as implemented"
```
