---
title: "Source Map"
summary: "Exact source-path map for patching each subsystem safely across backend, tools, routes, frontend, and desktop."
read_when:
  - You need to identify the exact file to patch for a bug/fix
  - You are tracing behavior from symptom to owner module
  - You need fast subsystem ownership lookup
---

# Source Map

## Server bootstrap and app wiring

- `crates/server/src/lib.rs`: route registration, gateway registration, provider resolution, runtime startup
- `crates/server/src/state.rs`: shared app state dependencies
- `crates/server/src/middleware.rs`: auth/rate-limit middleware

## Server route owners

- Chat: `crates/server/src/routes/chat.rs`
- WebSocket stream: `crates/server/src/ws.rs`
- Approvals: `crates/server/src/routes/approval.rs`, `crates/server/src/approval_gate.rs`
- Agents/runtime files: `crates/server/src/routes/agents.rs`
- Workflows: `crates/server/src/routes/workflows.rs`
- Conversations: `crates/server/src/routes/conversations.rs`
- Config/credentials: `crates/server/src/routes/config.rs`
- Providers/profiles/oauth: `crates/server/src/routes/providers.rs`
- Graph and ingest: `crates/server/src/routes/graph.rs`, `crates/server/src/routes/documents.rs`
- Logs/health/usage: `crates/server/src/routes/logs.rs`, `crates/server/src/routes/health.rs`, `crates/server/src/routes/usage_metrics.rs`

## Gateway and channel routing

- Adapter contract: `crates/gateway/src/adapter.rs`
- Gateway orchestrator: `crates/gateway/src/gateway.rs`
- Router: `crates/gateway/src/router.rs`
- Session store: `crates/gateway/src/session.rs`
- Message model: `crates/gateway/src/message.rs`
- Webchat adapter implementation: `crates/server/src/webchat.rs`

## Agent runtime core

- Engine: `crates/agent/src/engine.rs`
- Engine dependency/tool wiring: `crates/agent/src/engine_bootstrap.rs`
- ReAct loop and tool execution: `crates/agent/src/react_loop.rs`
- Conversation persistence: `crates/agent/src/conversation.rs`
- Agent templates: `crates/agent/src/agent_manager.rs`
- Workflows runtime: `crates/agent/src/workflow_manager.rs`, `crates/agent/src/workflow_runner.rs`
- Progress board aggregation: `crates/agent/src/agent_progress.rs`
- Memory management: `crates/agent/src/memory.rs`

## Tool implementations

- Registry trait: `crates/agent/src/tool_registry.rs`
- Individual tools: `crates/agent/src/tools/*.rs`
- Shell exec approvals: `crates/agent/src/tools/shell_exec.rs`

## Security/validation boundaries

- Input/path/url/taint checks: `crates/security/src/validation.rs`
- Optional process sandbox primitives: `crates/security/src/sandbox.rs`

## Common config and workspace bootstrapping

- App config + profiles + credentials: `crates/common/src/config.rs`
- Home/workspace setup and templates: `crates/common/src/init.rs`
- Bundled agent templates: `crates/common/src/agents.rs`

## Frontend

- Route shell: `frontend/src/App.tsx`, `frontend/src/layouts/AppLayout.tsx`
- API wrappers: `frontend/src/lib/api.ts`
- Agents UI: `frontend/src/pages/agents/*`
- Workflows UI: `frontend/src/pages/workflows/*`
- Agent board UI: `frontend/src/pages/agent-board/*`

## CLI and service management

- CLI command surface: `crates/cli/src/main.rs`
- CLI command modules: `crates/cli/src/commands/*.rs`
- OS service managers: `crates/cli/src/service/*.rs`

## Desktop native

- Native desktop app and backend lifecycle: `crates/desktop-native/src/main.rs`

Last verified: 2026-03-05
