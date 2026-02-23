#!/usr/bin/env bash
set -euo pipefail

REPO_OWNER="rushdino"
REPO_NAME="rushdino"
BASE_URL="https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/latest/download"

os="$(uname -s)"
arch="$(uname -m)"

case "$os" in
  Linux) os_name="linux" ;;
  Darwin) os_name="macos" ;;
  *) echo "Unsupported OS: $os"; exit 1 ;;
esac

case "$arch" in
  x86_64) arch_name="x86_64" ;;
  aarch64|arm64) arch_name="aarch64" ;;
  *) echo "Unsupported arch: $arch"; exit 1 ;;
esac

artifact="rushdino-${os_name}-${arch_name}"
url="${BASE_URL}/${artifact}"
sha_url="${BASE_URL}/${artifact}.sha256"

workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT

curl -fsSL "$url" -o "$workdir/rushdino"
curl -fsSL "$sha_url" -o "$workdir/rushdino.sha256"

if command -v sha256sum >/dev/null 2>&1; then
  ( cd "$workdir" && sha256sum -c rushdino.sha256 )
else
  expected="$(awk '{print $1}' "$workdir/rushdino.sha256")"
  actual="$(shasum -a 256 "$workdir/rushdino" | awk '{print $1}')"
  if [[ "$expected" != "$actual" ]]; then
    echo "Checksum mismatch"
    exit 1
  fi
fi
chmod +x "$workdir/rushdino"

install_dir="/usr/local/bin"
if [[ ! -w "$install_dir" ]]; then
  install_dir="$HOME/.local/bin"
  mkdir -p "$install_dir"
fi

cp "$workdir/rushdino" "$install_dir/rushdino"
echo "Installed to $install_dir/rushdino"
echo "Next: rushdino init"
