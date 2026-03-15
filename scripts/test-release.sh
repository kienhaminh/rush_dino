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

  assert_eq "v0.1.1" "$(format_tag 0.1.1 stable)" "stable tag"
  assert_eq "v0.1.1-beta.1" "$(format_tag 0.1.1 beta)" "beta tag"

  assert_nonzero_cmd "invalid bump mode" "source ./scripts/release.sh && bump_version 0.1.0 invalid"
  assert_nonzero_cmd "invalid release mode" "source ./scripts/release.sh && format_tag 0.1.1 nightly"

  if [[ "$failures" -gt 0 ]]; then
    exit 1
  fi

  printf 'release tests passed\n'
}

main "$@"
