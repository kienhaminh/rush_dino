---
title: "System Overview"
summary: "Architecture map for RushDino: native macOS client, backend, gateway, tools, persistence, and providers."
read_when:
  - You need a single mental model before debugging
  - You need to know where each request is handled
  - You need to map behavior to exact crates and files
---

# System Overview

```mermaid
flowchart LR
  D["RushDino desktop (GPUI)"] -->|"HMAC-signed HTTP + WebSocket"| S["rushdino-server (axum)"]
  U["User: Telegram / Discord / Slack / CLI"] --> S
  S --> G["Gateway (channel adapters + router)"]
  G --> E["AgentEngine (ReAct loop + tools)"]
  E --> P["Provider layer (OpenAI / Anthropic / Ollama / Codex / Plugin)"]
  E --> DB[(SQLite data.db)]
  E --> HOME["~/.rushdino workspace files"]
  S --> KG["Knowledge Graph service"]
  KG --> DB
```

## Backend architecture

- Server bootstrap and routes: `crates/server/src/lib.rs`
- HTTP + WS entrypoints: `crates/server/src/routes/*`, `crates/server/src/ws.rs`
- Channel abstraction + routing: `crates/gateway/src/*`
- Core agent runtime: `crates/agent/src/engine.rs`, `crates/agent/src/react_loop.rs`
- Tool registration/wiring: `crates/agent/src/engine_bootstrap.rs`
- Shared config/credentials/init: `crates/common/src/*`

## GPUI desktop client

- App entry: `crates/desktop-app/src/main.rs`
- UI views: `crates/desktop-app/src/ui/`
- HTTP client and HMAC signing: `crates/desktop-app/src/api_client.rs`, `crates/desktop-app/src/signer.rs`
- Streaming chat: `crates/desktop-app/src/chat_socket.rs`

## Desktop architecture

- Backend helper lifecycle: `crates/desktop-app/src/backend_process.rs`
- The app bundles `rushdino-server`, starts it on an available loopback port,
  and uses the same `~/.rushdino` data as the CLI.

## Persistence and workspace

- SQLite (primary runtime state): conversations, sessions, workflows, logs, usage, graph
- `~/.rushdino` filesystem state:
- Identity/bootstrap docs (`SOUL.md`, `AGENTS.md`, etc.)
- `memory/` for persistent memory files
- `agents/*.toml` and `skills/*.toml`
- `config.toml` and `credentials.toml`

## Provider and auth layer

- Provider resolution and runtime refresh: `crates/server/src/lib.rs`, `crates/server/src/routes/providers.rs`
- Auth methods include API key, OAuth, and none (via profile config in common/auth crates).

Last verified: 2026-08-22
