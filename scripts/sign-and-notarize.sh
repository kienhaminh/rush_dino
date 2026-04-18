#!/usr/bin/env bash
#
# Sign + notarize + staple the RushDino macOS desktop app.
#
# Assumes `cargo tauri build --target <target>` has already produced the
# .app and .dmg under `crates/desktop-app/src-tauri/target/<target>/release/bundle/`.
#
# Required environment:
#   APPLE_SIGNING_IDENTITY   e.g. "Developer ID Application: Your Name (TEAMID)"
#   APPLE_NOTARY_PROFILE     notarytool keychain profile name (set up once via
#                            `xcrun notarytool store-credentials`)
#
# Optional:
#   TAURI_TARGET             default: universal-apple-darwin
#   APP_NAME                 default: RushDino
#
# Usage:
#   export APPLE_SIGNING_IDENTITY="Developer ID Application: ... (TEAMID)"
#   export APPLE_NOTARY_PROFILE="rushdino-notary"
#   scripts/sign-and-notarize.sh
set -euo pipefail

cd "$(dirname "$0")/.."

TAURI_TARGET="${TAURI_TARGET:-universal-apple-darwin}"
APP_NAME="${APP_NAME:-RushDino}"
BUNDLE_DIR="crates/desktop-app/src-tauri/target/${TAURI_TARGET}/release/bundle"
APP_PATH="${BUNDLE_DIR}/macos/${APP_NAME}.app"
DMG_PATH=$(ls "${BUNDLE_DIR}/dmg/${APP_NAME}"_*_*.dmg 2>/dev/null | head -n 1 || true)

: "${APPLE_SIGNING_IDENTITY:?APPLE_SIGNING_IDENTITY is required}"
: "${APPLE_NOTARY_PROFILE:?APPLE_NOTARY_PROFILE is required}"

if [[ ! -d "${APP_PATH}" ]]; then
  echo "✗ app not found: ${APP_PATH}" >&2
  echo "  run scripts/build-desktop-app.sh first" >&2
  exit 1
fi

echo "▸ signing ${APP_PATH}"
codesign --force --deep --options runtime --timestamp \
  --sign "${APPLE_SIGNING_IDENTITY}" \
  "${APP_PATH}"

echo "▸ verifying signature"
codesign -vvv --deep --strict "${APP_PATH}"

echo "▸ zipping for notarization"
ZIP_PATH="/tmp/${APP_NAME}-notarize.zip"
/usr/bin/ditto -c -k --sequesterRsrc --keepParent "${APP_PATH}" "${ZIP_PATH}"

echo "▸ submitting to notarytool (this can take a few minutes)"
xcrun notarytool submit "${ZIP_PATH}" \
  --keychain-profile "${APPLE_NOTARY_PROFILE}" \
  --wait

echo "▸ stapling ticket to .app"
xcrun stapler staple "${APP_PATH}"
xcrun stapler validate "${APP_PATH}"

if [[ -n "${DMG_PATH}" && -f "${DMG_PATH}" ]]; then
  echo "▸ signing + stapling ${DMG_PATH}"
  codesign --force --timestamp --sign "${APPLE_SIGNING_IDENTITY}" "${DMG_PATH}"
  xcrun notarytool submit "${DMG_PATH}" \
    --keychain-profile "${APPLE_NOTARY_PROFILE}" \
    --wait
  xcrun stapler staple "${DMG_PATH}"
  xcrun stapler validate "${DMG_PATH}"
fi

rm -f "${ZIP_PATH}"

echo "▸ final Gatekeeper check"
spctl -a -vvv -t install "${APP_PATH}" 2>&1 | sed 's/^/  /'

echo "✓ signed, notarized, stapled"
echo "  app: ${APP_PATH}"
[[ -n "${DMG_PATH}" ]] && echo "  dmg: ${DMG_PATH}"
