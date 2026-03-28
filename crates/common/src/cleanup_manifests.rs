//! Cleanup manifest system for version upgrades.
//!
//! When RushDino upgrades to a new version, obsolete files in `~/.rushdino/`
//! may need to be removed. Each version ships a JSON manifest (embedded at
//! compile time) that lists relative paths to delete. A deny-list prevents
//! accidental removal of user data directories.

use std::path::Path;

use serde::Deserialize;

use crate::{AppError, Result};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/// A versioned cleanup manifest listing files/directories to remove on upgrade.
#[derive(Debug, Deserialize)]
pub struct CleanupManifest {
    /// Semver version string this manifest was shipped with.
    pub version: String,
    /// Relative paths (within `~/.rushdino/`) to remove.
    pub remove: Vec<String>,
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Paths that are never allowed to appear in a cleanup manifest's `remove` list.
/// These protect critical user-data directories and files.
const DENY_LIST: &[&str] = &[
    "memory/",
    "documents/",
    "agents/",
    "skills/",
    "workspaces/",
    "data.db",
    "credentials.toml",
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Load the cleanup manifest for a given version string.
///
/// The leading `v` is stripped before matching so both `"v0.2.0"` and
/// `"0.2.0"` are accepted. Returns `None` when no manifest is bundled for
/// that version.
pub fn get_cleanup_manifest(version: &str) -> Option<CleanupManifest> {
    // Strip optional leading 'v'.
    let version = version.strip_prefix('v').unwrap_or(version);

    // All manifests are embedded at compile time. Add new entries here as
    // new versions are released.
    match version {
        "0.2.0" => {
            let raw = include_str!("cleanup_manifests/v0.2.0.json");
            serde_json::from_str(raw).ok()
        }
        _ => None,
    }
}

/// Validate that a manifest's `remove` list does not contain path-traversal
/// sequences or protected (deny-listed) paths.
pub fn validate_manifest(manifest: &CleanupManifest) -> Result<()> {
    for path in &manifest.remove {
        // Reject directory traversal.
        if path.contains("..") {
            return Err(AppError::Validation(format!(
                "cleanup manifest contains path traversal: {path}"
            )));
        }

        // Reject deny-listed paths.
        for denied in DENY_LIST {
            if path == *denied || path.starts_with(denied) {
                return Err(AppError::Validation(format!(
                    "cleanup manifest contains protected path: {path}"
                )));
            }
        }
    }
    Ok(())
}

/// Execute a cleanup manifest against the given home directory.
///
/// Validates the manifest first, then removes each listed file or directory.
/// Returns the list of paths that were actually removed. Paths that do not
/// exist are silently skipped.
///
/// # Errors
///
/// Returns an error if validation fails or if a canonical path escapes the
/// home directory (safety check).
pub fn execute_cleanup(home: &Path, manifest: &CleanupManifest) -> Result<Vec<String>> {
    validate_manifest(manifest)?;

    // Canonicalize the home dir so we can verify no path escapes it.
    let canonical_home = home.canonicalize()?;

    let mut removed = Vec::new();

    for rel_path in &manifest.remove {
        let target = home.join(rel_path);

        // Verify the target stays inside home after resolving symlinks/dots.
        // We only perform this check when the target actually exists, because
        // `canonicalize` fails on missing paths.
        if target.exists() {
            let canonical_target = target.canonicalize()?;
            if !canonical_target.starts_with(&canonical_home) {
                tracing::warn!(
                    path = %rel_path,
                    "cleanup manifest path escapes home directory — skipping"
                );
                continue;
            }

            if target.is_dir() {
                tracing::info!(path = %rel_path, "cleanup: removing directory");
                std::fs::remove_dir_all(&target)?;
            } else {
                tracing::info!(path = %rel_path, "cleanup: removing file");
                std::fs::remove_file(&target)?;
            }

            removed.push(rel_path.clone());
        }
    }

    Ok(removed)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    // Helper: build a minimal manifest for testing.
    fn manifest_with(paths: Vec<&str>) -> CleanupManifest {
        CleanupManifest {
            version: "test".into(),
            remove: paths.into_iter().map(String::from).collect(),
        }
    }

    #[test]
    fn rejects_path_traversal() {
        let manifest = manifest_with(vec!["../escape"]);
        assert!(validate_manifest(&manifest).is_err());

        let manifest = manifest_with(vec!["subdir/../../escape"]);
        assert!(validate_manifest(&manifest).is_err());
    }

    #[test]
    fn rejects_protected_paths() {
        // Every entry in the deny list must be rejected.
        let protected = [
            "memory/",
            "documents/",
            "agents/",
            "skills/",
            "workspaces/",
            "data.db",
            "credentials.toml",
        ];
        for path in &protected {
            let manifest = manifest_with(vec![path]);
            assert!(
                validate_manifest(&manifest).is_err(),
                "expected rejection of protected path: {path}"
            );
        }

        // Paths that start with a deny-listed prefix should also be rejected.
        let manifest = manifest_with(vec!["memory/notes.json"]);
        assert!(validate_manifest(&manifest).is_err());

        let manifest = manifest_with(vec!["agents/my-agent/"]);
        assert!(validate_manifest(&manifest).is_err());
    }

    #[test]
    fn accepts_valid_paths() {
        let manifest = manifest_with(vec!["cache/old_file.json", "tmp/stale_dir/"]);
        assert!(validate_manifest(&manifest).is_ok());
    }

    #[test]
    fn execute_cleanup_removes_files_and_dirs() {
        let tmp: TempDir = tempfile::tempdir().expect("tempdir");
        let home = tmp.path();

        // Create a file and a directory to be cleaned up.
        let file_path = home.join("stale_file.txt");
        std::fs::write(&file_path, "old data").expect("write file");

        let dir_path = home.join("old_cache");
        std::fs::create_dir(&dir_path).expect("create dir");
        std::fs::write(dir_path.join("inner.txt"), "inner").expect("write inner");

        let manifest = manifest_with(vec!["stale_file.txt", "old_cache"]);
        let removed = execute_cleanup(home, &manifest).expect("execute_cleanup");

        assert!(removed.contains(&"stale_file.txt".to_string()));
        assert!(removed.contains(&"old_cache".to_string()));
        assert!(!file_path.exists(), "file should be removed");
        assert!(!dir_path.exists(), "directory should be removed");
    }

    #[test]
    fn placeholder_manifest_loads() {
        let manifest = get_cleanup_manifest("v0.2.0").expect("v0.2.0 manifest must exist");
        assert_eq!(manifest.version, "0.2.0");
        assert!(
            manifest.remove.is_empty(),
            "placeholder manifest remove list should be empty"
        );

        // Also works without the 'v' prefix.
        let manifest2 = get_cleanup_manifest("0.2.0").expect("0.2.0 (no v) manifest must exist");
        assert_eq!(manifest2.version, "0.2.0");
    }
}
