---
title: "System Overview"
summary: "Full-stack architecture map for RushDino: backend, gateway, tools, frontend, desktop, persistence, and providers."
read_when:
  - You need a single mental model before debugging
  - You need to know where each request is handled
  - You need to map behavior to exact crates and files
---

# System Overview

```mermaid
flowchart LR
  U["User: Web / Telegram / Discord / Slack / CLI / Desktop"] --> S["rushdino-server (axum)"]
  S --> G["Gateway (channel adapters + router)"]
  G --> E["AgentEngine (ReAct loop + tools)"]
  E --> P["Provider layer (OpenAI / Anthropic / Ollama / Codex / Plugin)"]
  E --> DB[(SQLite data.db)]
  E --> HOME["~/.rushdino workspace files"]
  S --> FE["Frontend (React routes + API client)"]
  D["Desktop Native (egui)"] --> S
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

## Frontend architecture

- App shell and routes: `frontend/src/App.tsx`, `frontend/src/layouts/AppLayout.tsx`
- API client surface: `frontend/src/lib/api.ts`
- Runtime pages (agents, workflows, logs, metrics): `frontend/src/pages/*`

## Desktop architecture

- Native app shell and backend lifecycle: `crates/desktop-native/src/main.rs`
- Desktop uses backend HTTP endpoints (for example `/healthz`, `/api/graph/*`).

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

Last verified: 2026-03-05
