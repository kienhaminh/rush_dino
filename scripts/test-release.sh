#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

source ./scripts/release.sh

failures=0

assert_eq() {
  local expected="$1"
  local actual="$2"
  local message="$3"

  if [[ "$expected" != "$actual" ]]; then
    printf 'FAIL: %s\n  expected: %s\n  actual:   %s\n' "$message" "$expected" "$actual" >&2
    failures=$((failures + 1))
  fi
}

assert_nonzero_cmd() {
  local message="$1"
  shift
  local status=0

  set +e
  bash -lc "$*" >/dev/null 2>&1
  status=$?
  set -e

  if [[ "$status" -eq 0 ]]; then
    printf 'FAIL: %s\n  expected command to fail\n' "$message" >&2
    failures=$((failures + 1))
  fi
}

main() {
  assert_eq "0.1.1" "$(bump_version 0.1.0 patch)" "patch bump"
  assert_eq "0.2.0" "$(bump_version 0.1.0 minor)" "minor bump"
  assert_eq "1.0.0" "$(bump_version 0.1.0 major)" "major bump"

  assert_eq "v0.1.1" "$(format_tag 0.1.1)" "stable tag"

  # next_beta_tag: mock git so no prior betas exist → should return beta.1
  git() { case "$1" in rev-parse) return 1 ;; ls-remote) return 2 ;; esac }
  assert_eq "v0.1.1-beta.1" "$(next_beta_tag 0.1.1)" "beta tag (no prior betas)"
  unset -f git

  # next_beta_tag: mock git so beta.1 exists locally → should return beta.2
  git() {
    case "$1" in
      rev-parse) [[ "$*" == *"beta.1"* ]] && return 0; return 1 ;;
      ls-remote) return 2 ;;
    esac
  }
  assert_eq "v0.1.1-beta.2" "$(next_beta_tag 0.1.1)" "beta tag (beta.1 exists locally)"
  unset -f git

  # next_beta_tag: mock git so beta.1 exists on origin → should return beta.2
  git() {
    case "$1" in
      rev-parse) return 1 ;;
      ls-remote) [[ "$*" == *"beta.1"* ]] && return 0; return 2 ;;
    esac
  }
  assert_eq "v0.1.1-beta.2" "$(next_beta_tag 0.1.1)" "beta tag (beta.1 exists on origin)"
  unset -f git

  assert_nonzero_cmd "invalid bump mode" "source ./scripts/release.sh && bump_version 0.1.0 invalid"
  assert_nonzero_cmd "invalid semver in format_tag" "source ./scripts/release.sh && format_tag 0.1.x"
  assert_nonzero_cmd "invalid semver in next_beta_tag" "source ./scripts/release.sh && next_beta_tag 0.1.x"

  if [[ "$failures" -gt 0 ]]; then
    exit 1
  fi

  printf 'release tests passed\n'
}

main "$@"
