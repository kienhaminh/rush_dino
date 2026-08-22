#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-run}"
APP_NAME="RushDino"
BUNDLE_ID="ai.rushdino.desktop"
BUILD_CONFIGURATION="${RUSHDINO_BUILD_CONFIGURATION:-debug}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist"
APP_BUNDLE="$DIST_DIR/$APP_NAME.app"
APP_CONTENTS="$APP_BUNDLE/Contents"
APP_MACOS="$APP_CONTENTS/MacOS"
APP_RESOURCES="$APP_CONTENTS/Resources"
APP_BINARY="$APP_MACOS/$APP_NAME"
DESKTOP_PACKAGE="rushdino-desktop"
SERVER_PACKAGE="rushdino-server"
APP_VERSION="${RUSHDINO_APP_VERSION:-$(
  awk -F ' *= *' '/^version = / { gsub(/"/, "", $2); print $2; exit }' "$ROOT_DIR/Cargo.toml"
)}"
APP_BUILD_NUMBER="${RUSHDINO_BUILD_NUMBER:-1}"

pkill -f "$APP_BINARY" >/dev/null 2>&1 || true
pkill -f "$APP_RESOURCES/rushdino-server" >/dev/null 2>&1 || true

if [[ "$BUILD_CONFIGURATION" == "release" ]]; then
  cargo build --release -p "$SERVER_PACKAGE" -p "$DESKTOP_PACKAGE"
else
  cargo build -p "$SERVER_PACKAGE" -p "$DESKTOP_PACKAGE"
fi

RUST_TARGET_DIR="$(
  cargo metadata --no-deps --format-version 1 \
    | /usr/bin/plutil -extract target_directory raw -o - -
)"
SERVER_BINARY="$RUST_TARGET_DIR/$BUILD_CONFIGURATION/rushdino-server"
DESKTOP_BINARY="$RUST_TARGET_DIR/$BUILD_CONFIGURATION/RushDino"

rm -rf "$APP_BUNDLE"
mkdir -p "$APP_MACOS" "$APP_RESOURCES"
cp "$DESKTOP_BINARY" "$APP_BINARY"
cp "$SERVER_BINARY" "$APP_RESOURCES/rushdino-server"
cp "$ROOT_DIR/crates/desktop-app/Resources/AppIcon.png" "$APP_RESOURCES/AppIcon.png"
cp "$ROOT_DIR/crates/desktop-app/Resources/Info.plist" "$APP_CONTENTS/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString $APP_VERSION" \
  "$APP_CONTENTS/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleVersion $APP_BUILD_NUMBER" \
  "$APP_CONTENTS/Info.plist"
chmod +x "$APP_BINARY" "$APP_RESOURCES/rushdino-server"
codesign --force --sign - "$APP_RESOURCES/rushdino-server" >/dev/null
codesign --force --sign - "$APP_BINARY" >/dev/null
codesign --force --sign - "$APP_BUNDLE" >/dev/null

open_app() {
  /usr/bin/open -n "$APP_BUNDLE"
}

case "$MODE" in
  --build|build)
    ;;
  run)
    open_app
    ;;
  --debug|debug)
    lldb -- "$APP_BINARY"
    ;;
  --logs|logs)
    open_app
    /usr/bin/log stream --info --style compact --predicate "process == \"$APP_NAME\""
    ;;
  --telemetry|telemetry)
    open_app
    /usr/bin/log stream --info --style compact --predicate "subsystem == \"$BUNDLE_ID\""
    ;;
  --verify|verify)
    open_app
    sleep 2
    pgrep -x "$APP_NAME" >/dev/null
    ;;
  *)
    echo "usage: $0 [build|run|--debug|--logs|--telemetry|--verify]" >&2
    exit 2
    ;;
esac
