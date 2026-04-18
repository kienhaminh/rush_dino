#!/usr/bin/env bash
#
# One-time: generate the Ed25519 keypair that Tauri's updater uses to
# verify new releases. The private key stays on whatever machine cuts
# releases (CI secret or local keychain); the public key gets embedded
# in tauri.conf.json so installed apps can verify updates.
#
# Usage:
#   scripts/desktop-updater-keygen.sh
#
# Afterwards:
#   1. Copy the printed public key into
#      `crates/desktop-app/src-tauri/tauri.conf.json`
#      at `plugins.updater.pubkey`, and flip `plugins.updater.active`
#      to true.
#   2. Store the private key in your CI secrets as
#      TAURI_SIGNING_PRIVATE_KEY (and the passphrase as
#      TAURI_SIGNING_PRIVATE_KEY_PASSWORD if you used one).
#   3. `scripts/release.sh --desktop` will sign each release with the
#      private key; the updater plugin inside the running app verifies
#      with the embedded pubkey.
set -euo pipefail

cd "$(dirname "$0")/.."

OUT_DIR="${OUT_DIR:-$HOME/.config/tauri/rushdino}"
mkdir -p "${OUT_DIR}"

if [[ ! -x "$(command -v cargo)" ]]; then
  echo "cargo not found" >&2
  exit 1
fi

if [[ ! -x "$(command -v cargo-tauri)" && ! -x "$(command -v cargo)" ]]; then
  echo "cargo-tauri CLI not found; install with:" >&2
  echo "  cargo install tauri-cli --version '^2' --locked" >&2
  exit 1
fi

echo "▸ generating keypair into ${OUT_DIR}"
cargo tauri signer generate --write-keys -p "" -w "${OUT_DIR}/updater-private.key" 2>&1 | tee "${OUT_DIR}/keygen.log"

PUB_KEY_PATH="${OUT_DIR}/updater-private.key.pub"
if [[ -f "${PUB_KEY_PATH}" ]]; then
  echo
  echo "▸ public key — paste into tauri.conf.json > plugins.updater.pubkey:"
  echo
  cat "${PUB_KEY_PATH}"
  echo
fi

echo "✓ private key: ${OUT_DIR}/updater-private.key"
echo "  DO NOT commit this. Stash it in 1Password / your CI secret store."
