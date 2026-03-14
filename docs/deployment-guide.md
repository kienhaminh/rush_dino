# Deployment Guide

Installation, setup, and uninstallation of RushDino.

---

## Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| OS | macOS 12+, Linux (glibc 2.31+) | Windows not yet supported |
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
