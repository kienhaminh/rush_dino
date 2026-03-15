#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# test-glibc.sh
#
# Mirrors .github/workflows/release.yml exactly inside a local ubuntu:22.04
# Docker container, then checks which glibc symbols the binary requires.
#
# Usage:
#   ./scripts/test-glibc.sh
#
# Requirements: Docker
# ---------------------------------------------------------------------------

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_BIN="${REPO_ROOT}/rushdino-glibc-test"
TARGET="x86_64-unknown-linux-gnu"
TARGET_GLIBC="2.35"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'

info()    { echo -e "${BLUE}${BOLD}${1}${NC}"; }
success() { echo -e "${GREEN}✔ ${1}${NC}"; }
warn()    { echo -e "${YELLOW}⚠ ${1}${NC}"; }
error()   { echo -e "${RED}✖ ${1}${NC}" >&2; exit 1; }

command -v docker >/dev/null 2>&1 || error "Docker is required but not installed."

info "Replicating release.yml build inside ubuntu:22.04 container..."
echo -e "  Target : ${TARGET}"
echo -e "  Max GLIBC: ${TARGET_GLIBC}"
echo ""

# Mirror release.yml steps exactly:
#   1. apt: git curl build-essential pkg-config libssl-dev xz-utils
#   2. Node.js 22 via nodesource
#   3. Rust via rustup --no-modify-path
#   4. npm install && npm run build
#   5. cargo build --release --target <target> -p rushdino-cli
docker run --rm \
  --platform linux/amd64 \
  -v "${REPO_ROOT}:/workspace" \
  -w /workspace \
  -e DEBIAN_FRONTEND=noninteractive \
  ubuntu:22.04 bash -c "
    set -euo pipefail

    echo '>>> [Step 1] Installing base tools...'
    apt-get update -qq
    apt-get install -y -qq git curl build-essential pkg-config libssl-dev xz-utils

    echo '>>> [Step 2] Installing Node.js 22...'
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null 2>&1
    apt-get install -y -qq nodejs
    echo \"    Node \$(node --version), npm \$(npm --version)\"

    echo '>>> [Step 3] Installing Rust toolchain...'
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --no-modify-path >/dev/null 2>&1
    export PATH=\"\$HOME/.cargo/bin:\$PATH\"
    rustup target add ${TARGET}
    echo \"    \$(cargo --version)\"

    echo '>>> [Step 4] Building frontend...'
    cd frontend && npm install && npm run build && cd ..

    echo '>>> [Step 5] Building rushdino-cli (target: ${TARGET})...'
    CC_x86_64_unknown_linux_gnu=gcc cargo build --release --target ${TARGET} -p rushdino-cli

    cp target/${TARGET}/release/rushdino /workspace/rushdino-glibc-test
    echo '>>> Binary written to rushdino-glibc-test'
  "

[[ -f "${OUTPUT_BIN}" ]] || error "Build failed — binary not found."
success "Build complete: ${OUTPUT_BIN}"

echo ""
info "Checking glibc symbol requirements..."

GLIBC_VERSIONS=$(objdump -p "${OUTPUT_BIN}" 2>/dev/null \
  | grep "GLIBC_" \
  | grep -oE "GLIBC_[0-9]+\.[0-9]+(\.[0-9]+)?" \
  | sort -Vu)

if [[ -z "$GLIBC_VERSIONS" ]]; then
  warn "No GLIBC version requirements found (may be statically linked)."
  rm -f "${OUTPUT_BIN}"
  exit 0
fi

echo ""
echo -e "${BOLD}Required GLIBC versions:${NC}"
echo "$GLIBC_VERSIONS" | while read -r ver; do
  echo "  ${ver}"
done

MAX_VER=$(echo "$GLIBC_VERSIONS" | sed 's/GLIBC_//' | sort -V | tail -1)
echo ""

if printf '%s\n' "${TARGET_GLIBC}" "${MAX_VER}" | sort -V | tail -1 | grep -qxv "${TARGET_GLIBC}"; then
  error "Max required GLIBC: ${MAX_VER} — exceeds target (${TARGET_GLIBC})"
else
  success "Max required GLIBC: ${MAX_VER} — meets target (${TARGET_GLIBC})"
fi

echo ""
info "Symbols requiring GLIBC > ${TARGET_GLIBC}:"
VIOLATIONS=$(readelf -sW "${OUTPUT_BIN}" 2>/dev/null \
  | grep "@GLIBC_" \
  | grep -oE "[^@]+@GLIBC_[0-9]+\.[0-9]+(\.[0-9]+)?" \
  | while read -r entry; do
      ver=$(echo "$entry" | grep -oE "GLIBC_[0-9]+\.[0-9]+(\.[0-9]+)?" | sed 's/GLIBC_//')
      sym=$(echo "$entry" | cut -d@ -f1)
      if printf '%s\n' "${TARGET_GLIBC}" "${ver}" | sort -V | tail -1 | grep -qxv "${TARGET_GLIBC}"; then
        echo "  ${sym}  (GLIBC_${ver})"
      fi
    done | sort -u)

if [[ -z "$VIOLATIONS" ]]; then
  success "No violations found."
else
  echo -e "${RED}${VIOLATIONS}${NC}"
fi

rm -f "${OUTPUT_BIN}"
