#!/usr/bin/env bash
set -euo pipefail

# Build (and optionally sign/notarize) the RushDino macOS desktop app.
#
# Environment toggles:
#   TAURI_TARGET           default: universal-apple-darwin
#   BUNDLE_TARGETS         default: app,dmg
#
# Requires:
#   - pnpm (npm i -g pnpm)
#   - cargo-tauri (cargo install tauri-cli --version '^2' --locked)
#   - For the universal target: `rustup target add aarch64-apple-darwin
#     x86_64-apple-darwin` on an Apple Silicon Mac
#
# If APPLE_SIGNING_IDENTITY + APPLE_NOTARY_PROFILE are set, the build is
# signed and notarized via scripts/sign-and-notarize.sh afterwards.
# Otherwise you'll get an unsigned dev .app that macOS Gatekeeper will
# flag on first launch.

cd "$(dirname "$0")/.."

TAURI_TARGET="${TAURI_TARGET:-universal-apple-darwin}"
BUNDLE_TARGETS="${BUNDLE_TARGETS:-app,dmg}"

echo "▸ installing UI dependencies"
pnpm --dir crates/desktop-app/ui install --frozen-lockfile 2>/dev/null || \
  pnpm --dir crates/desktop-app/ui install

echo "▸ building React UI"
pnpm --dir crates/desktop-app/ui build

echo "▸ building Tauri app (target=${TAURI_TARGET}, bundles=${BUNDLE_TARGETS})"
(cd crates/desktop-app/src-tauri && \
  cargo tauri build --target "${TAURI_TARGET}" --bundles "${BUNDLE_TARGETS}")

echo "✓ built: crates/desktop-app/src-tauri/target/${TAURI_TARGET}/release/bundle/"

if [[ -n "${APPLE_SIGNING_IDENTITY:-}" && -n "${APPLE_NOTARY_PROFILE:-}" ]]; then
  echo
  echo "▸ APPLE_SIGNING_IDENTITY set — signing + notarizing"
  TAURI_TARGET="${TAURI_TARGET}" scripts/sign-and-notarize.sh
else
  echo
  echo "ℹ  APPLE_SIGNING_IDENTITY / APPLE_NOTARY_PROFILE not set — skipping"
  echo "   signing. See docs/desktop-app.md for the one-time setup to enable"
  echo "   signed + notarized builds."
fi
