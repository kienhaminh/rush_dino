# Deployment Guide

Installation, setup, and uninstallation of RushDino.

---

## Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| OS | macOS 12+, Linux (x86_64, any distro) | Windows not yet supported; Linux binary is statically linked (musl) — no glibc requirement |
| Disk space | ~50 MB | Binary + data directory |
| Network | Internet access | Required for LLM API calls |

For building from source, you additionally need:

| Requirement | Version |
|---|---|
| Rust toolchain | stable (1.70+) |
| Node.js | 22+ |
| npm | 10+ |

---

## Installation

### Option A — Pre-built Binary (Recommended)

The quickest way to install is via the one-liner installer:

```bash
curl -fsSL https://raw.githubusercontent.com/rushdino/rushdino/main/scripts/install.sh | bash
```

The installer will:
1. Detect your OS and architecture (macOS/Linux, x86_64/aarch64)
2. Download the matching binary from the latest GitHub Release
3. Verify the SHA-256 checksum
4. Install to `/usr/local/bin/rushdino` (falls back to `~/.local/bin/rushdino` if `/usr/local/bin` is not writable)

After installation, verify it worked:

```bash
rushdino --version
```

If `rushdino` is not found, add `~/.local/bin` to your `PATH`:

```bash
# Add to ~/.zshrc or ~/.bashrc
export PATH="$HOME/.local/bin:$PATH"
```

---

### Option A1 — Manual Linux Install from GitHub Release

If you prefer not to pipe a script into bash, you can download and install the binary manually.

> **Note:** Currently only `x86_64` (amd64) Linux binaries are published. ARM (`aarch64`) support is planned for a future release.

**1. Pick a release tag**

```bash
# Latest release — tries stable first, falls back to most recent prerelease:
TAG=$(curl -fsSL https://api.github.com/repos/kienhaminh/rush_dino/releases/latest 2>/dev/null \
  | grep '"tag_name"' | head -1 | cut -d'"' -f4)
if [[ -z "$TAG" ]]; then
  TAG=$(curl -fsSL https://api.github.com/repos/kienhaminh/rush_dino/releases \
    | grep '"tag_name"' | head -1 | cut -d'"' -f4)
fi

# Or pin to a specific version, e.g.:
# TAG="v0.1.0-beta.1"

echo "Installing: $TAG"
```

**2. Download the binary**

```bash
curl -fsSL \
  "https://github.com/kienhaminh/rush_dino/releases/download/${TAG}/rushdino-linux-x86_64" \
  -o rushdino
```

**3. Verify the SHA-256 checksum**

```bash
curl -fsSL \
  "https://github.com/kienhaminh/rush_dino/releases/download/${TAG}/rushdino-linux-x86_64.sha256" \
  -o rushdino.sha256

sha256sum --check rushdino.sha256
```

**4. Install the binary**

```bash
chmod +x rushdino

# System-wide (requires sudo):
sudo mv rushdino /usr/local/bin/rushdino

# Or user-local (no sudo required):
mkdir -p ~/.local/bin
mv rushdino ~/.local/bin/rushdino
export PATH="$HOME/.local/bin:$PATH"   # add to ~/.bashrc or ~/.zshrc to persist
```

**5. Verify the installation**

```bash
rushdino --version
```

---

### Option B — Build from Source

**1. Clone the repository**

```bash
git clone https://github.com/rushdino/rushdino.git
cd rushdino
```

**2. Build the frontend and CLI binary**

```bash
./scripts/build-release.sh
```

This runs `npm install && npm run build` in `frontend/`, then `cargo build --release -p rushdino-cli`. The output binary is at `target/release/rushdino`.

**3. Install the binary**

```bash
cp target/release/rushdino /usr/local/bin/rushdino
# or to a user-local path:
cp target/release/rushdino ~/.local/bin/rushdino
```

---

### Option C — macOS Desktop App

**Build the native desktop binary:**

```bash
./scripts/build-desktop-native.sh
```

Output: `target/release/rushdino-desktop-native`

You can run it directly or copy it to `/Applications`:

```bash
# Run directly
./target/release/rushdino-desktop-native

# Or install as a macOS app
cp target/release/rushdino-desktop-native /Applications/RushDino
```

---

## First-Time Setup

After installing the binary, run `init` to create the configuration directory and set up credentials:

```bash
rushdino init
```

This creates `~/.rushdino/` with the following layout:

```
~/.rushdino/
├── config.toml        # Main configuration (LLM provider, ports, channels)
├── db.sqlite          # Conversations, jobs, knowledge graph
├── memory/            # Agent memory files (*.md)
└── logs/              # Server logs
```

Edit `~/.rushdino/config.toml` to configure your LLM provider and API keys. Example:

```toml
[provider]
default = "openai"

[provider.openai]
api_key = "sk-..."
model = "gpt-4o"

[provider.anthropic]
api_key = "sk-ant-..."
model = "claude-opus-4-5"

[server]
port = 3000
```

---

## Running RushDino

**Start as a background daemon:**

```bash
rushdino start
```

**Start in the foreground (useful for debugging):**

```bash
rushdino start --foreground
```

**Open the web UI** at [http://localhost:3000](http://localhost:3000).

**Check status:**

```bash
rushdino status
```

**Stop the daemon:**

```bash
rushdino stop
```

**Restart:**

```bash
rushdino restart
```

---

## Upgrading

RushDino supports self-updating from GitHub Releases:

```bash
rushdino upgrade
```

This downloads the latest binary, verifies its checksum, and replaces the current binary in place. Your data directory (`~/.rushdino/`) is never touched during an upgrade.

Release channels and pinned versions are also supported:

```bash
rushdino upgrade --beta
rushdino upgrade --version 1.2.3
rushdino upgrade --version v1.2.3-beta.1
```

To roll back to a specific older release:

```bash
rushdino downgrade --version 1.2.3
rushdino downgrade --version v1.2.3-beta.1
```

Notes:

- `rushdino upgrade` installs the newest stable release by default
- `rushdino upgrade --beta` installs the newest beta prerelease
- `rushdino upgrade --version ...` installs the exact requested release, including prereleases
- `rushdino downgrade --version ...` requires an explicit target and rejects same-version or newer targets

---

## Creating a Release

Use the release helper to bump the workspace version, verify the release build, create the release commit, tag it, and push both to GitHub:

```bash
./scripts/release.sh <major|minor|patch> [--latest|--beta]
```

Examples:

```bash
./scripts/release.sh patch --latest
./scripts/release.sh minor --beta
```

### Stable vs beta

- `--latest` creates a stable tag in the form `vX.Y.Z`
- `--beta` creates a prerelease tag in the form `vX.Y.Z-beta.1`
- If you omit the flag, the script defaults to a stable release

### What the script does

1. Verifies the git working tree is clean
2. Verifies `HEAD` is on a branch with an upstream
3. Reads `[workspace.package].version` from `Cargo.toml`
4. Computes the next semver from `major`, `minor`, or `patch`
5. Updates the workspace version in `Cargo.toml`
6. Runs `./scripts/build-release.sh`
7. Creates commit `chore: release <tag>`
8. Creates the git tag
9. Pushes the branch and tag to `origin`

If any step fails before the commit is created, the script restores `Cargo.toml` to its previous version.

### Requirements

- Clean working tree
- Branch checked out locally, not detached `HEAD`
- Upstream configured for the current branch
- `git`, `cargo`, `node`, `npm`, and `perl` installed
- The target tag must not already exist locally or on `origin`

### GitHub release behavior

Pushing the tag triggers [`.github/workflows/release.yml`](../.github/workflows/release.yml):

- stable tags publish a normal GitHub Release and mark it as latest
- beta tags publish a GitHub prerelease and do not mark it as latest

### Recommended operator flow

```bash
git pull --ff-only
bash scripts/test-release.sh
./scripts/release.sh patch --latest
```

Run `bash scripts/test-release.sh` first if you want a quick validation of the release script logic before creating a real release.

---

## Uninstallation

Use the uninstall script to remove RushDino completely:

```bash
curl -fsSL https://raw.githubusercontent.com/rushdino/rushdino/main/scripts/uninstall.sh | bash
```

Or run it manually if you have the repository cloned:

```bash
./scripts/uninstall.sh
```

### What gets removed

| Path | Description |
|---|---|
| `/usr/local/bin/rushdino` | CLI binary (primary install path) |
| `~/.local/bin/rushdino` | CLI binary (user-local fallback path) |
| `/Applications/RushDino` | macOS desktop app (if installed) |
| `~/.rushdino/` | **All data**: config, database, memory, logs |

> **Warning:** Removing `~/.rushdino/` is irreversible. Back it up first if you want to preserve your conversations and memory files:
> ```bash
> cp -r ~/.rushdino ~/.rushdino.bak
> ```

### Manual uninstallation

If you prefer to remove things manually:

```bash
# Stop the daemon first
rushdino stop

# Remove the binary (use whichever path applies)
rm -f /usr/local/bin/rushdino
rm -f ~/.local/bin/rushdino

# Remove the macOS desktop app (if installed)
rm -f /Applications/RushDino

# Remove all data (conversations, config, memory)
rm -rf ~/.rushdino
```
