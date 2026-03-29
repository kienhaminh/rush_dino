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

// --- skip persistence ---

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
