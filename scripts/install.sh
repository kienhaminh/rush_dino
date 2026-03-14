#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# RushDino Installer
#
# Modes (auto-detected, can be overridden with env vars):
#   Source mode  – when Cargo.toml + frontend/ exist relative to this script.
#                  Checks Rust toolchain + Node.js, builds frontend, builds
#                  the Rust binary, then installs it.
#   Binary mode  – downloads the pre-built binary from GitHub Releases,
#                  verifies its checksum, and installs it.
#
# Environment variable overrides:
#   RUSHDINO_BUILD_FROM_SOURCE=1   Force source mode (requires tools + source)
#   RUSHDINO_BINARY_INSTALL=1      Force binary download mode
#   RUSHDINO_INSTALL_DIR=/path     Override the installation directory
# ---------------------------------------------------------------------------

# --- Colors & Styling -------------------------------------------------------
# Disable colors when NO_COLOR is set, or when output is not a terminal
if [[ -z "${NO_COLOR:-}" ]] && [[ -t 1 ]]; then
  RED='\033[0;31m'
  GREEN='\033[0;32m'
  BLUE='\033[0;34m'
  YELLOW='\033[1;33m'
  BOLD='\033[1m'
  DIM='\033[2m'
  NC='\033[0m'
else
  RED='' GREEN='' BLUE='' YELLOW='' BOLD='' DIM='' NC=''
fi

info()    { echo -e "${BLUE}${BOLD}${1}${NC}"; }
success() { echo -e "${GREEN}✔ ${1}${NC}"; }
warn()    { echo -e "${YELLOW}⚠ ${1}${NC}"; }
error()   { echo -e "${RED}✖ ${1}${NC}" >&2; exit 1; }
step()    { echo -e "\n${BLUE}${BOLD}${1}${NC}"; }

echo -e "${BLUE}${BOLD}🦕 Installing RushDino${NC}"
echo -e "${DIM}========================================${NC}"

# ---------------------------------------------------------------------------
# Step 1: System Check
# ---------------------------------------------------------------------------
step "Step 1: System Check..."

REPO_OWNER="rushdino"
REPO_NAME="rushdino"
BASE_URL="https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/latest/download"

os="$(uname -s 2>/dev/null || echo "unknown")"
arch="$(uname -m 2>/dev/null || echo "unknown")"

case "$os" in
  Linux)  os_name="linux" ;;
  Darwin) os_name="macos" ;;
  *) error "Unsupported OS: $os. Only Linux and macOS are supported." ;;
esac

case "$arch" in
  x86_64)          arch_name="x86_64" ;;
  aarch64 | arm64) arch_name="aarch64" ;;
  *) error "Unsupported architecture: $arch. Only x86_64 and aarch64 are supported." ;;
esac

success "Detected OS: ${os} (${arch})"

# ---------------------------------------------------------------------------
# Step 2: Determine install mode
# ---------------------------------------------------------------------------
step "Step 2: Determining Install Mode..."

# Resolve repo root relative to this script (handles both direct and piped execution)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-./install.sh}")" 2>/dev/null && pwd || pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." 2>/dev/null && pwd || pwd)"

source_available=false
if [[ -f "${REPO_ROOT}/Cargo.toml" ]] && [[ -d "${REPO_ROOT}/frontend" ]]; then
  source_available=true
fi

build_from_source=false
if [[ "${RUSHDINO_BUILD_FROM_SOURCE:-0}" == "1" ]]; then
  [[ "$source_available" == "true" ]] \
    || error "RUSHDINO_BUILD_FROM_SOURCE=1 set but source tree not found at ${REPO_ROOT}"
  build_from_source=true
elif [[ "${RUSHDINO_BINARY_INSTALL:-0}" != "1" ]] && [[ "$source_available" == "true" ]]; then
  build_from_source=true
fi

if [[ "$build_from_source" == "true" ]]; then
  success "Mode: build from source  (repo: ${REPO_ROOT})"
else
  success "Mode: download pre-built binary"
fi

# ---------------------------------------------------------------------------
# Download helper (used in binary mode and for rustup)
# ---------------------------------------------------------------------------
download() {
  local src="$1" dst="$2" silent="${3:-false}"
  if command -v curl >/dev/null 2>&1; then
    if [[ "$silent" == "true" ]]; then
      curl -fsSL "$src" -o "$dst"
    else
      curl -# -fL "$src" -o "$dst"
    fi
  elif command -v wget >/dev/null 2>&1; then
    if [[ "$silent" == "true" ]]; then
      wget -q "$src" -O "$dst"
    else
      wget --show-progress "$src" -O "$dst"
    fi
  else
    error "Neither 'curl' nor 'wget' is available. Please install one and retry."
  fi
}

# ---------------------------------------------------------------------------
# Step 3: Tool checks
# ---------------------------------------------------------------------------
step "Step 3: Checking Required Tools..."

if [[ "$build_from_source" == "true" ]]; then
  # --- Rust toolchain check (auto-install via rustup if missing) ---
  if command -v cargo >/dev/null 2>&1; then
    success "Rust toolchain found: $(cargo --version)"
  else
    warn "Rust toolchain (cargo) not found. Installing via rustup..."
    if ! command -v curl >/dev/null 2>&1 && ! command -v wget >/dev/null 2>&1; then
      error "curl or wget is required to install rustup. Please install one first."
    fi
    if command -v curl >/dev/null 2>&1; then
      curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \
        | sh -s -- -y --no-modify-path
    else
      wget -qO- https://sh.rustup.rs \
        | sh -s -- -y --no-modify-path
    fi
    # Make cargo available in the current shell session
    # shellcheck source=/dev/null
    source "${HOME}/.cargo/env" 2>/dev/null \
      || export PATH="${HOME}/.cargo/bin:${PATH}"
    command -v cargo >/dev/null 2>&1 \
      || error "rustup installation completed but cargo is still not found. Open a new shell and retry."
    success "Rust toolchain installed: $(cargo --version)"
  fi

  # --- Node.js / npm check ---
  if ! command -v node >/dev/null 2>&1; then
    error "Node.js not found.\n  Install it from https://nodejs.org or via your system package manager (brew, apt, etc.)."
  fi
  if ! command -v npm >/dev/null 2>&1; then
    error "npm not found. It is bundled with Node.js — please reinstall from https://nodejs.org"
  fi
  success "Node.js found: $(node --version), npm $(npm --version)"

else
  # Binary mode only needs a download tool (already handled inside download())
  if ! command -v curl >/dev/null 2>&1 && ! command -v wget >/dev/null 2>&1; then
    error "Neither 'curl' nor 'wget' is available. Please install one and retry."
  fi
  if command -v curl >/dev/null 2>&1; then
    success "Download tool: curl $(curl --version | head -1 | awk '{print $2}')"
  else
    success "Download tool: wget $(wget --version 2>&1 | head -1 | awk '{print $3}')"
  fi
fi

# ---------------------------------------------------------------------------
# Step 4: Build (source mode) or Download (binary mode)
# ---------------------------------------------------------------------------
workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT

if [[ "$build_from_source" == "true" ]]; then
  # --- 4a: Build frontend ---
  step "Step 4a: Building Frontend..."
  info "  Running npm install..."
  ( cd "${REPO_ROOT}/frontend" && npm install --prefer-offline )
  info "  Running npm run build..."
  ( cd "${REPO_ROOT}/frontend" && npm run build )
  success "Frontend built successfully."

  # --- 4b: Build Rust binary ---
  step "Step 4b: Building Rust Binary..."
  info "  Running cargo build --release -p rushdino-cli ..."
  ( cd "${REPO_ROOT}" && cargo build --release -p rushdino-cli )
  success "Rust binary built successfully."

  binary_src="${REPO_ROOT}/target/release/rushdino"
  [[ -f "$binary_src" ]] \
    || error "Expected binary not found at ${binary_src}. The build may have failed."
  cp "$binary_src" "$workdir/rushdino"

else
  # --- 4: Download pre-built binary ---
  step "Step 4: Downloading Binary..."

  artifact="rushdino-${os_name}-${arch_name}"
  url="${BASE_URL}/${artifact}"
  sha_url="${BASE_URL}/${artifact}.sha256"

  echo -e "📦 ${YELLOW}Fetching ${artifact}...${NC}"
  download "$url"     "$workdir/${artifact}"
  download "$sha_url" "$workdir/${artifact}.sha256" "true"

  # --- Verify checksum ---
  # Keep the original artifact filename during verification so sha256sum -c matches
  step "Step 4b: Verifying Checksum..."
  if command -v sha256sum >/dev/null 2>&1; then
    ( cd "$workdir" && sha256sum -c "${artifact}.sha256" > /dev/null 2>&1 ) \
      || error "Checksum mismatch! The downloaded binary may be corrupted."
  elif command -v shasum >/dev/null 2>&1; then
    expected="$(awk '{print $1}' "$workdir/${artifact}.sha256")"
    actual="$(shasum -a 256 "$workdir/${artifact}" | awk '{print $1}')"
    [[ "$expected" == "$actual" ]] \
      || error "Checksum mismatch! The downloaded binary may be corrupted."
  else
    warn "No checksum tool found (sha256sum / shasum). Skipping verification."
  fi
  success "Checksum verified successfully!"

  cp "$workdir/${artifact}" "$workdir/rushdino"
fi

# ---------------------------------------------------------------------------
# Step 5: Install
# ---------------------------------------------------------------------------
step "Step 5: Installing..."

chmod +x "$workdir/rushdino"

install_dir="${RUSHDINO_INSTALL_DIR:-}"
use_sudo=false

if [[ -z "$install_dir" ]]; then
  if [[ -w "/usr/local/bin" ]]; then
    install_dir="/usr/local/bin"
  elif command -v sudo >/dev/null 2>&1 && sudo -n true 2>/dev/null; then
    install_dir="/usr/local/bin"
    use_sudo=true
  else
    install_dir="${HOME}/.local/bin"
  fi
fi

if [[ ! -d "$install_dir" ]]; then
  mkdir -p "$install_dir" 2>/dev/null \
    || { use_sudo=true; sudo mkdir -p "$install_dir"; }
fi

if [[ "$use_sudo" == "true" ]]; then
  sudo cp "$workdir/rushdino" "$install_dir/rushdino"
else
  cp "$workdir/rushdino" "$install_dir/rushdino"
fi

# ---------------------------------------------------------------------------
# Step 6: PATH check
# ---------------------------------------------------------------------------
if [[ ":${PATH}:" != *":${install_dir}:"* ]]; then
  warn "${install_dir} is not in your PATH."

  shell_profile=""
  case "${SHELL:-}" in
    */zsh)  shell_profile="${HOME}/.zshrc" ;;
    */bash) shell_profile="${HOME}/.bashrc" ;;
    */fish) shell_profile="${HOME}/.config/fish/config.fish" ;;
  esac

  if [[ -n "$shell_profile" ]]; then
    export_line="export PATH=\"${install_dir}:\$PATH\""
    if ! grep -qF "$export_line" "$shell_profile" 2>/dev/null; then
      echo ""                                          >> "$shell_profile"
      echo "# Added by RushDino installer"            >> "$shell_profile"
      echo "$export_line"                             >> "$shell_profile"
      warn "Added ${install_dir} to PATH in ${shell_profile}."
      warn "Restart your shell or run: source ${shell_profile}"
    fi
  else
    warn "Add the following line to your shell profile manually:"
    echo "  export PATH=\"${install_dir}:\$PATH\""
  fi
fi

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------
echo -e "\n${DIM}========================================${NC}"
echo -e "🚀 ${GREEN}${BOLD}RushDino successfully installed!${NC}"
echo -e "📂 Location: ${BLUE}${install_dir}/rushdino${NC}"
echo -e "\n${BOLD}Next steps:${NC}"
echo -e "  Run ${YELLOW}rushdino init${NC} to configure your setup."
