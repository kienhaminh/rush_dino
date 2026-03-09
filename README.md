# RushDino

Local-first AI agent platform written in Rust.

## Product Docs

- [Vision](./VISION.md)
- [Security](./SECURITY.md)
- [Architecture](./ARCHITECTURE.md)
- [Detailed system architecture](./docs/system-architecture.md)

## Architecture

```text
Browser/CLI/Telegram -> Axum API + WebSocket -> Agent Engine -> Providers
                                         |-> SQLite (conversations, jobs)
                                         |-> ~/.rushdino/memory/*.md
```

## Quickstart

1. Install Rust stable + Node.js 22+
2. Build frontend and backend:
   - `./scripts/build-release.sh`
3. Initialize config:
   - `cargo run -p rushdino-cli -- init`
4. Start server in foreground:
   - `cargo run -p rushdino-cli -- start --foreground`
5. Open [http://localhost:3000](http://localhost:3000)

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

## Development

- Check: `cargo check --workspace`
- Test: `cargo test --workspace`
- Frontend dev: `cd frontend && npm install && npm run dev`

## Knowledge Graph APIs

- `GET /api/graph/search`
- `GET /api/graph/facts`
- `GET /api/graph/node/:id`
- `GET /api/graph/stats`
- `POST /api/graph/backfill`

## License

MIT
