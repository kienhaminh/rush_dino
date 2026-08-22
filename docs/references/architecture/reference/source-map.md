---
title: "Source Map"
summary: "Exact source-path map for patching each subsystem safely across backend, tools, routes, and the native macOS app."
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

## GPUI desktop app

- App entry: `crates/desktop-app/src/main.rs`
- App view root: `crates/desktop-app/src/ui/mod.rs`
- Sidebar: `crates/desktop-app/src/ui/sidebar_view.rs`
- HTTP and WebSocket clients: `crates/desktop-app/src/api_client.rs`, `crates/desktop-app/src/chat_socket.rs`
- State and operations: `crates/desktop-app/src/store.rs`, `crates/desktop-app/src/models.rs`
- Resource, chat, and settings views: `crates/desktop-app/src/ui/chat_view.rs`, `crates/desktop-app/src/ui/settings_view.rs`
- Backend helper lifecycle: `crates/desktop-app/src/backend_process.rs`

## CLI and service management

- CLI command surface: `crates/cli/src/main.rs`
- CLI command modules: `crates/cli/src/commands/*.rs`
- OS service managers: `crates/cli/src/service/*.rs`

Last verified: 2026-08-22
