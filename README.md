# RushDino

Local AI agent platform written in Rust.

## Product Docs

- [Vision](./VISION.md)
- [Security](./SECURITY.md)
- [Architecture](./ARCHITECTURE.md)
- [Detailed system architecture](./docs/system-architecture.md)
- [Installation & Deployment](./docs/deployment-guide.md)

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/rushdino/rushdino/main/scripts/install.sh | bash
```

Then initialize and start:

```bash
rushdino init    # create ~/.rushdino/ config and database
rushdino start   # start daemon, open http://localhost:28847
```

> See [docs/deployment-guide.md](./docs/deployment-guide.md) for building from source, macOS desktop app, and configuration options.

## Uninstall

```bash
curl -fsSL https://raw.githubusercontent.com/kienhaminh/rush_dino/refs/heads/main/scripts/install.sh | bash
```

This stops the daemon, removes the binary, and (with confirmation) deletes `~/.rushdino/`.

## Quickstart (from source)

1. Install Rust stable + Node.js 22+
2. Build frontend and backend:
   - `./scripts/build-release.sh`
3. Initialize config:
   - `cargo run -p rushdino-cli -- init`
4. Start server in foreground:
   - `cargo run -p rushdino-cli -- start --foreground`
5. Open [http://localhost:28847](http://localhost:28847)

## Native Desktop (macOS-first)

- Build desktop binary:
  - `./scripts/build-desktop-native.sh`
- Run desktop binary:
  - `cargo run -p rushdino-desktop-native`

## CLI

- `rushdino init`
- `rushdino start [--foreground]`
- `rushdino stop`
- `rushdino restart`
- `rushdino status`
- `rushdino upgrade`

## License

MIT
