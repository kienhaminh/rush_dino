# Auto Release Script Design

## Goal

Add a single release entrypoint that bumps the workspace semver, verifies the release build, creates the release commit and tag, and pushes both for either stable latest releases or beta prereleases.

## Context

RushDino already publishes GitHub releases from tags matching `v*` in `.github/workflows/release.yml`. The missing piece is a safe local operator command that standardizes version bumps and emits tags that map cleanly to stable and beta GitHub releases.

## Requirements

- One command: `./scripts/release.sh <major|minor|patch> [--latest|--beta]`
- Strict semver bump modes only
- Clean working tree required before any release action
- Build verification required before commit, tag, or push
- Stable releases use `vX.Y.Z` and should publish as latest
- Beta releases use `vX.Y.Z-beta.1` and should publish as prereleases, not latest
- Version source of truth stays in `Cargo.toml` under `[workspace.package].version`

## Chosen Approach

Use a standalone POSIX-style bash script in `scripts/release.sh`.

Why this approach:

- Matches the repository’s existing shell-based build scripts
- Avoids adding a release-only Rust crate or external tooling dependency
- Keeps the operator workflow explicit and easy to audit

## Command Behavior

### Stable release

Example:

```bash
./scripts/release.sh patch --latest
```

Behavior:

- Read current workspace version from `Cargo.toml`
- Compute next version from the requested semver bump
- Update `[workspace.package].version`
- Run `./scripts/build-release.sh`
- Commit `chore: release vX.Y.Z`
- Create tag `vX.Y.Z`
- Push the current branch and the tag

### Beta release

Example:

```bash
./scripts/release.sh patch --beta
```

Behavior:

- Compute the next semver base version
- Update `[workspace.package].version` to that base version
- Run `./scripts/build-release.sh`
- Commit `chore: release vX.Y.Z-beta.1`
- Create tag `vX.Y.Z-beta.1`
- Push the current branch and the tag

Beta consumes the next semver number. A beta release from `0.1.0` on `patch` updates the repo version to `0.1.1`, so the next stable patch would become `0.1.2`.

## Safety Checks

The script must fail before changing files if:

- the git working tree is dirty
- `HEAD` is detached
- the bump argument is missing or invalid
- both `--latest` and `--beta` are passed
- required tools are missing
- the current branch has no upstream
- the target tag already exists locally or on `origin`

## Workflow Changes

`.github/workflows/release.yml` should be updated to:

- use Node 24 compatible action versions for `checkout`, `setup-node`, `upload-artifact`, and `download-artifact`
- keep the existing Node 24 opt-in env until the default flips
- detect beta tags by suffix
- publish beta tags as prereleases
- publish stable tags as latest releases

## Testing

Add a focused shell test harness that verifies:

- semver bump calculation for `major`, `minor`, and `patch`
- stable tag formatting
- beta tag formatting
- invalid argument handling

Manual verification should cover:

- script syntax validation
- shell test execution
- dry release path against the repository without pushing

