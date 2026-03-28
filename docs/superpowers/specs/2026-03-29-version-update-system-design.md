# Version Update System

**Date:** 2026-03-29
**Status:** Draft

## Problem

Users have no way to know a new RushDino version is available from the web dashboard. The existing `rushdino upgrade` CLI command works, but requires terminal access and manual checking. Additionally, there is no mechanism to clean up files from `.rushdino` that become obsolete between versions.

## Goals

1. Frontend notification when a new version is available (animated navbar icon + popup)
2. One-click update from the dashboard (triggers backend self-update + restart prompt)
3. Critical/hotfix releases cannot be skipped; normal releases can
4. Per-version cleanup manifests to remove obsolete files from `~/.rushdino`
5. Skipped versions are remembered and not shown again (until a newer release appears)

## Non-Goals

- Auto-updating without user interaction
- Cleaning up user-generated data (memory, documents, agents)
- Changing the existing CLI `upgrade`/`downgrade` commands

---

## Architecture

Three layers: backend API, frontend UI, cleanup manifests.

### Backend

#### New Route Module: `crates/server/src/routes/version.rs`

Four endpoints:

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/version/check` | Check for updates, return version info |
| `POST` | `/api/version/upgrade` | Trigger self-update to latest |
| `POST` | `/api/version/restart` | Restart the RushDino service |
| `POST` | `/api/version/skip` | Mark a version as skipped |

#### Version Check (`GET /api/version/check`)

Reuses `release_updater::fetch_releases()` and resolution logic from `crates/cli/src/commands/release_updater.rs`. The existing `release_updater` module lives in the CLI crate; the shared logic (fetching, resolving, version comparison) will be extracted to a new module in `crates/common` so both CLI and server can use it.

**Response shape:**

```json
{
  "current_version": "0.1.0",
  "latest_version": "0.2.0",
  "has_update": true,
  "is_critical": false,
  "release_notes": "### What's new\n...",
  "release_url": "https://github.com/kienhaminh/rush_dino/releases/tag/v0.2.0",
  "skipped": false
}
```

**Caching:** The backend caches the GitHub release check result in an `ArcSwap<Option<CachedVersionCheck>>` on `AppState`. Cache TTL is 1 hour. Subsequent requests within the TTL return the cached result without hitting GitHub.

**Critical detection:** The release body (from GitHub API) is scanned for `[CRITICAL]` or `[HOTFIX]` markers (case-insensitive). If found, `is_critical: true`.

**Skip awareness:** Reads `~/.rushdino/skipped_versions.json`. If the latest version is in the skipped list and is NOT critical, returns `skipped: true`.

#### Upgrade (`POST /api/version/upgrade`)

Calls the extracted upgrade logic (same as `rushdino upgrade` stable channel). Returns success/failure with the installed version.

**Response:**

```json
{
  "success": true,
  "installed_version": "0.2.0",
  "cleanup_files": ["old-template.md", "deprecated/dir"]
}
```

After binary replacement, reads the cleanup manifest for the target version and removes listed files. The `cleanup_files` field reports what was removed.

#### Restart (`POST /api/version/restart`)

Triggers a graceful service restart. Implementation depends on the service manager:
- macOS: `launchctl kickstart -k` the LaunchAgent
- Linux: `systemctl restart` the systemd unit
- Foreground mode: uses Rust's `std::os::unix::process::CommandExt` exec to replace the current process with the new binary (same args)

The frontend should expect the connection to drop and auto-reconnect/refresh.

#### Skip (`POST /api/version/skip`)

**Request:** `{ "version": "0.2.0" }`

Appends the version to `~/.rushdino/skipped_versions.json`. File format:

```json
["0.1.5", "0.2.0"]
```

---

### Shared Release Logic: `crates/common/src/release_check.rs`

Extract from `crates/cli/src/commands/release_updater.rs` into common:

- `fetch_releases()` — GitHub API call
- `resolve_latest_stable()` / `resolve_latest_beta()` — release resolution
- `current_version()` — compile-time version
- `normalize_version_tag()` — tag normalization
- `parse_release_version()` — semver parsing
- `platform_target()` / `platform_asset_identifier()` — platform detection
- `is_critical_release(release_body: &str) -> bool` — new function, checks for `[CRITICAL]`/`[HOTFIX]`

The CLI `release_updater.rs` will be simplified to import from common and only keep CLI-specific logic (the `install_release` function using `self_update::Update`, console output).

---

### Cleanup Manifests

**Location:** `crates/common/src/cleanup_manifests/`

One JSON file per version: `v0.2.0.json`, `v0.3.0.json`, etc.

**Format:**

```json
{
  "version": "0.2.0",
  "remove": [
    "old-deprecated-template.md",
    "deprecated-dir/"
  ]
}
```

Paths are relative to `~/.rushdino/`. Trailing `/` indicates a directory (removed recursively).

**Embedding:** Files are included at compile time via `include_str!` in a `cleanup_manifests.rs` module. A function `get_cleanup_manifest(version: &str) -> Option<CleanupManifest>` looks up the manifest for a given version.

**Execution:** After a successful binary upgrade, the new binary's first run (or the upgrade endpoint) reads the manifest for the freshly installed version and removes listed paths. Only paths that actually exist are touched. The operation is logged.

**Safety:** The manifest can only reference paths within `~/.rushdino/`. Any path traversal attempt (e.g., `../`) is rejected. User data directories (`memory/`, `documents/`, `agents/`, `skills/`) are on a deny-list and cannot appear in manifests.

---

### Frontend

#### Version Check Hook: `frontend/src/hooks/use-version-check.ts`

- Calls `GET /api/version/check` on mount (dashboard load)
- Exposes: `{ hasUpdate, isCritical, latestVersion, releaseNotes, releaseUrl, skipped, isLoading }`
- Used by the navbar icon and popup

#### Navbar Icon: in `AppLayout.tsx` header

Placed in the header's right-side controls (next to ThemeToggle and avatar):

- **No update / skipped:** Static package icon, muted color, no animation
- **Normal update:** Pulsing green dot badge on the icon
- **Critical update:** Pulsing red dot badge on the icon
- Click opens the update popup dialog

#### Update Popup: `frontend/src/components/version-update-dialog.tsx`

Uses the existing Radix `Dialog` component pattern.

**Content:**
- Version badge: `v{current} -> v{latest}`
- Release notes (rendered markdown, truncated with "View full release" link)
- If critical: warning banner explaining this is a required update

**Actions:**
- **"Update Now"** button — calls `POST /api/version/upgrade`, shows progress spinner, then prompts restart
- **"Skip This Version"** button — calls `POST /api/version/skip`, closes dialog, removes animation
  - Hidden/disabled when `is_critical: true`
- **"Remind Me Later"** button — closes dialog without skipping (animation persists)

**Post-upgrade flow:**
1. "Update Now" clicked -> button shows spinner + "Downloading..."
2. Upgrade completes -> dialog shows "Update installed! Restart to apply."
3. User clicks "Restart Now" -> calls `POST /api/version/restart`
4. Connection drops -> frontend shows reconnecting state -> auto-refreshes when server is back

---

### Release Script Update: `scripts/release.sh`

Add a prompt after version bump, before tagging:

```bash
echo "Is this a critical/hotfix release?"
select criticality in "No (normal)" "Yes (critical/hotfix)"; do
  case $criticality in
    "Yes (critical/hotfix)")
      # Prepend [CRITICAL] to the release body
      release_body="[CRITICAL] ${release_body:-}"
      break ;;
    *)
      break ;;
  esac
done
```

The release body is passed to `git tag -a` or included in the GitHub release via the CI workflow. Since the current workflow uses `softprops/action-gh-release@v2` which auto-generates release notes, we add a step that prepends the `[CRITICAL]` marker to the release body when the tag message contains it.

---

## Files to Create

| File | Purpose |
|------|---------|
| `crates/common/src/release_check.rs` | Shared release checking logic (extracted from CLI) |
| `crates/common/src/cleanup_manifests.rs` | Cleanup manifest loader |
| `crates/common/src/cleanup_manifests/` | Directory for per-version JSON manifests |
| `crates/server/src/routes/version.rs` | Backend API endpoints |
| `frontend/src/hooks/use-version-check.ts` | React hook for version check |
| `frontend/src/components/version-update-dialog.tsx` | Update popup dialog |

## Files to Modify

| File | Change |
|------|--------|
| `crates/common/src/lib.rs` | Add `pub mod release_check; pub mod cleanup_manifests;` |
| `crates/cli/src/commands/release_updater.rs` | Simplify to import shared logic from common |
| `crates/cli/Cargo.toml` | May remove `semver` if fully delegated to common |
| `crates/server/src/routes/mod.rs` | Add `pub mod version;` |
| `crates/server/src/lib.rs` | Register `/api/version/*` routes |
| `crates/server/src/state.rs` | Add `version_cache: ArcSwap<Option<CachedVersionCheck>>` |
| `frontend/src/lib/api.ts` | Add `fetchVersionCheck`, `triggerUpgrade`, `triggerRestart`, `skipVersion` |
| `frontend/src/layouts/AppLayout.tsx` | Add version check icon to header |
| `scripts/release.sh` | Add criticality prompt |

## Testing

- **Unit tests** for `release_check.rs`: critical detection parsing, version comparison, manifest loading
- **Unit tests** for `cleanup_manifests.rs`: path validation, deny-list enforcement, traversal rejection
- **Unit tests** for `routes/version.rs`: mock release data, verify response shapes
- **Frontend**: manual testing of icon animation states, dialog flows, skip persistence
- **Integration**: full upgrade cycle on a test build (binary replacement, cleanup, restart)
