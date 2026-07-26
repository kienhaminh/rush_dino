#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

RUSHDINO_BUILD_CONFIGURATION=release ./script/build_and_run.sh --build

echo "✓ built native app: dist/RushDino.app"

if [[ -n "${APPLE_SIGNING_IDENTITY:-}" && -n "${APPLE_NOTARY_PROFILE:-}" ]]; then
  scripts/sign-and-notarize.sh
else
  echo "ℹ APPLE_SIGNING_IDENTITY / APPLE_NOTARY_PROFILE not set — using ad-hoc signature"
fi
