#!/usr/bin/env bash
set -euo pipefail

# --- Colors & Styling ---
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m' # No Color

echo -e "${BLUE}${BOLD}🦕 Installing RushDino${NC}"
echo -e "${DIM}========================================${NC}"

# --- Step 1: System Check ---
echo -e "\n${BLUE}${BOLD}Step 1: System Check...${NC}"

REPO_OWNER="rushdino"
REPO_NAME="rushdino"
BASE_URL="https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/latest/download"

os="$(uname -s)"
arch="$(uname -m)"

case "$os" in
  Linux) os_name="linux" ;;
  Darwin) os_name="macos" ;;
  *) echo -e "${RED}✖ Unsupported OS: $os${NC}"; exit 1 ;;
esac

case "$arch" in
  x86_64) arch_name="x86_64" ;;
  aarch64|arm64) arch_name="aarch64" ;;
  *) echo -e "${RED}✖ Unsupported arch: $arch${NC}"; exit 1 ;;
esac

echo -e "${GREEN}✔ Detected OS: ${os} (${arch})${NC}"

# --- Step 2: Downloading Binary ---
echo -e "\n${BLUE}${BOLD}Step 2: Downloading Binary...${NC}"

artifact="rushdino-${os_name}-${arch_name}"
url="${BASE_URL}/${artifact}"
sha_url="${BASE_URL}/${artifact}.sha256"

workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT

echo -e "📦 ${YELLOW}Fetching ${artifact}...${NC}"
# Use -# for progress bar instead of -s
curl -# -fL "$url" -o "$workdir/rushdino"
curl -s -fL "$sha_url" -o "$workdir/rushdino.sha256"

# --- Step 3: Verifying Checksum ---
echo -e "\n${BLUE}${BOLD}Step 3: Verifying Checksum...${NC}"

if command -v sha256sum >/dev/null 2>&1; then
  ( cd "$workdir" && sha256sum -c rushdino.sha256 > /dev/null 2>&1 )
else
  expected="$(awk '{print $1}' "$workdir/rushdino.sha256")"
  actual="$(shasum -a 256 "$workdir/rushdino" | awk '{print $1}')"
  if [[ "$expected" != "$actual" ]]; then
    echo -e "${RED}✖ Checksum mismatch!${NC}"
    exit 1
  fi
fi
echo -e "${GREEN}✔ Checksum verified successfully!${NC}"

# --- Step 4: Installation ---
echo -e "\n${BLUE}${BOLD}Step 4: Installation...${NC}"

chmod +x "$workdir/rushdino"

install_dir="/usr/local/bin"
if [[ ! -w "$install_dir" ]]; then
  install_dir="$HOME/.local/bin"
  if [[ ! -d "$install_dir" ]]; then
    mkdir -p "$install_dir"
  fi
fi

cp "$workdir/rushdino" "$install_dir/rushdino"

echo -e "\n${DIM}========================================${NC}"
echo -e "🚀 ${GREEN}${BOLD}RushDino successfully installed!${NC}"
echo -e "📂 Location: ${BLUE}$install_dir/rushdino${NC}"
echo -e "\n${BOLD}Next steps:${NC}"
echo -e "  Run ${YELLOW}rushdino init${NC} to configure your setup."
