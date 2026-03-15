#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./scripts/release.sh <major|minor|patch> [--latest|--beta]
       ./scripts/release.sh --beta

  major|minor|patch  Bump version, then tag (stable or beta).
  --latest           Tag as stable release (default).
  --beta             With bump: tag bumped version as beta (e.g. 0.1.0 -> v0.1.1-beta.1).
                     Alone: tag current version as beta, no bump (e.g. 0.1.0 -> v0.1.0-beta.1).
EOF
}

die() {
  printf '%s\n' "$*" >&2
  exit 1
}

rollback_version_file() {
  if [[ -n "${VERSION_FILE_BACKUP:-}" && -f "${VERSION_FILE_BACKUP:-}" && -n "${VERSION_FILE_TARGET:-}" ]]; then
    cp "$VERSION_FILE_BACKUP" "$VERSION_FILE_TARGET"
    rm -f "$VERSION_FILE_BACKUP"
  fi
}

cleanup_release_state() {
  local exit_code="$1"

  if [[ "$exit_code" -ne 0 ]]; then
    rollback_version_file
  elif [[ -n "${VERSION_FILE_BACKUP:-}" ]]; then
    rm -f "$VERSION_FILE_BACKUP"
  fi
}

require_tool() {
  local tool="$1"
  command -v "$tool" >/dev/null 2>&1 || die "Missing required tool: $tool"
}

parse_args() {
  if [[ $# -lt 1 || $# -gt 2 ]]; then
    usage
    exit 1
  fi

  if [[ $# -eq 1 && "$1" == "--beta" ]]; then
    BUMP_MODE="none"
    RELEASE_MODE="beta"
    return
  fi

  BUMP_MODE="$1"
  RELEASE_MODE="stable"

  case "$BUMP_MODE" in
    major|minor|patch)
      if [[ $# -eq 2 ]]; then
        case "$2" in
          --latest) RELEASE_MODE="stable" ;;
          --beta) RELEASE_MODE="beta" ;;
          *)
            usage
            exit 1
            ;;
        esac
      fi
      ;;
    *)
      usage
      exit 1
      ;;
  esac
}

validate_semver() {
  local version="$1"
  [[ "$version" =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)$ ]] || die "Invalid semver version: $version"
}

bump_version() {
  local current_version="$1"
  local bump_mode="$2"
  local major minor patch

  validate_semver "$current_version"
  IFS=. read -r major minor patch <<<"$current_version"

  case "$bump_mode" in
    major)
      major=$((major + 1))
      minor=0
      patch=0
      ;;
    minor)
      minor=$((minor + 1))
      patch=0
      ;;
    patch)
      patch=$((patch + 1))
      ;;
    *)
      die "Invalid bump mode: $bump_mode"
      ;;
  esac

  printf '%s.%s.%s\n' "$major" "$minor" "$patch"
}

format_tag() {
  local version="$1"

  validate_semver "$version"
  printf 'v%s\n' "$version"
}

# Find the next available beta tag for a version, auto-incrementing the beta
# number if prior betas already exist locally or on origin.
next_beta_tag() {
  local version="$1"
  local n=1 tag rc

  validate_semver "$version"

  while true; do
    tag="v${version}-beta.${n}"

    # Skip if the tag exists locally.
    git rev-parse -q --verify "refs/tags/$tag" >/dev/null 2>&1 && { n=$((n + 1)); continue; }

    # Check remote; exit code 2 means "not found" (--exit-code), anything
    # else is an unexpected error.
    git ls-remote --exit-code --tags origin "refs/tags/$tag" >/dev/null 2>&1; rc=$?
    [[ $rc -eq 0 ]] && { n=$((n + 1)); continue; }
    [[ $rc -ne 2 ]] && die "Could not verify remote tag '$tag' (git ls-remote exit code: $rc)"

    break
  done

  printf '%s\n' "$tag"
}

read_workspace_version() {
  local cargo_toml="$1"
  local version_line

  version_line="$(sed -n '/^\[workspace.package\]/,/^\[/s/^version = "\(.*\)"/\1/p' "$cargo_toml" | head -n 1)"
  [[ -n "$version_line" ]] || die "Could not read workspace version from $cargo_toml"
  printf '%s\n' "$version_line"
}

update_workspace_version() {
  local cargo_toml="$1"
  local new_version="$2"

  validate_semver "$new_version"

  VERSION_FILE_TARGET="$cargo_toml"
  VERSION_FILE_BACKUP="$(mktemp)"
  cp "$cargo_toml" "$VERSION_FILE_BACKUP"

  # Slurp the file (-0), locate the [workspace.package] section, skip lines
  # that don't start a new section (negative lookahead (?!^\[) with /m), then
  # replace only the version value using \K to avoid re-matching the prefix.
  perl -0pi -e 's/\[workspace\.package\]\n((?:(?!^\[).*\n)*)version = "\K[^"]+/'"$new_version"'/m' "$cargo_toml"
}

ensure_clean_tree() {
  [[ -z "$(git status --porcelain)" ]] || die "Working tree must be clean before releasing"
}

ensure_not_detached() {
  git symbolic-ref --quiet HEAD >/dev/null 2>&1 || die "HEAD is detached; checkout a branch before releasing"
}

current_branch() {
  git branch --show-current
}

ensure_upstream() {
  local branch="$1"
  git rev-parse --abbrev-ref "${branch}@{upstream}" >/dev/null 2>&1 || die "Current branch has no upstream configured"
}

ensure_tag_absent() {
  local tag="$1" rc

  git rev-parse -q --verify "refs/tags/$tag" >/dev/null 2>&1 && die "Tag already exists locally: $tag"

  # --exit-code: exits 0 if ref found, 2 if not found, 128+ on error.
  # Treat anything other than 0 (exists) or 2 (absent) as a network failure.
  git ls-remote --exit-code --tags origin "refs/tags/$tag" >/dev/null 2>&1; rc=$?
  [[ $rc -eq 0 ]] && die "Tag already exists on origin: $tag"
  [[ $rc -ne 2 ]] && die "Could not verify remote tag '$tag' (git ls-remote exit code: $rc)"
}

run_release() {
  local repo_root cargo_toml current_version next_version tag branch commit_message

  repo_root="$(cd "$(dirname "$0")/.." && pwd)"
  cargo_toml="$repo_root/Cargo.toml"

  require_tool git
  require_tool cargo
  require_tool node
  require_tool npm
  require_tool perl

  ensure_clean_tree
  ensure_not_detached

  branch="$(current_branch)"
  ensure_upstream "$branch"

  current_version="$(read_workspace_version "$cargo_toml")"
  if [[ "$BUMP_MODE" == "none" ]]; then
    next_version="$current_version"
  else
    next_version="$(bump_version "$current_version" "$BUMP_MODE")"
  fi
  if [[ "$RELEASE_MODE" == "beta" ]]; then
    tag="$(next_beta_tag "$next_version")"
  else
    tag="$(format_tag "$next_version")"
    ensure_tag_absent "$tag"
  fi

  if [[ "$BUMP_MODE" != "none" ]]; then
    update_workspace_version "$cargo_toml" "$next_version"
  fi

  "$repo_root/scripts/build-release.sh"

  if [[ "$BUMP_MODE" != "none" ]]; then
    git -C "$repo_root" add Cargo.toml Cargo.lock
    commit_message="chore: release $tag"
    git -C "$repo_root" commit -m "$commit_message"
  fi
  git -C "$repo_root" tag "$tag"
  git -C "$repo_root" push
  git -C "$repo_root" push origin "$tag"

  printf 'Released %s\n' "$tag"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  trap 'cleanup_release_state $?' EXIT
  parse_args "$@"
  run_release
fi
