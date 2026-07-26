#!/usr/bin/env bash
#
# Sign + notarize + staple the RushDino macOS desktop app.
#
# Assumes `scripts/build-desktop-app.sh` has produced `dist/RushDino.app`.
#
# Required environment:
#   APPLE_SIGNING_IDENTITY   e.g. "Developer ID Application: Your Name (TEAMID)"
#   APPLE_NOTARY_PROFILE     notarytool keychain profile name (set up once via
#                            `xcrun notarytool store-credentials`)
#
# Optional:
#   APP_NAME                 default: RushDino
#
# Usage:
#   export APPLE_SIGNING_IDENTITY="Developer ID Application: ... (TEAMID)"
#   export APPLE_NOTARY_PROFILE="rushdino-notary"
#   scripts/sign-and-notarize.sh
set -euo pipefail

cd "$(dirname "$0")/.."

APP_NAME="${APP_NAME:-RushDino}"
APP_PATH="dist/${APP_NAME}.app"

: "${APPLE_SIGNING_IDENTITY:?APPLE_SIGNING_IDENTITY is required}"
: "${APPLE_NOTARY_PROFILE:?APPLE_NOTARY_PROFILE is required}"

if [[ ! -d "${APP_PATH}" ]]; then
  echo "✗ app not found: ${APP_PATH}" >&2
  echo "  run scripts/build-desktop-app.sh first" >&2
  exit 1
fi

echo "▸ signing ${APP_PATH}"
codesign --force --options runtime --timestamp \
  --sign "${APPLE_SIGNING_IDENTITY}" \
  "${APP_PATH}/Contents/Resources/rushdino-server"
codesign --force --options runtime --timestamp \
  --sign "${APPLE_SIGNING_IDENTITY}" \
  "${APP_PATH}/Contents/MacOS/${APP_NAME}"
codesign --force --options runtime --timestamp \
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

rm -f "${ZIP_PATH}"

echo "▸ final Gatekeeper check"
spctl -a -vvv -t install "${APP_PATH}" 2>&1 | sed 's/^/  /'

echo "✓ signed, notarized, stapled"
echo "  app: ${APP_PATH}"
