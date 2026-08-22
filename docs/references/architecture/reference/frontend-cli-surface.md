---
title: "GPUI Desktop Client and CLI Surface"
summary: "How the GPUI desktop client and CLI expose current operations, including API boundaries, gaps, and stubbed commands."
read_when:
  - You need to know whether to patch the desktop UI, CLI, API, or tools
  - You need to avoid relying on stubbed CLI commands
  - You are designing new operational entrypoints
---

# GPUI Desktop Client and CLI Surface

## Desktop client operational surface

Primary HTTP transport:
`crates/desktop-app/src/api_client.rs`

### Current desktop surfaces

- Conversations: list/detail plus streaming chat in `store`
- Chat transport: `/api/ws/chat` through `chat_socket`
- Agents, sessions, workflows, graph, approvals, and logs: read-only
  resource lists
- Automations: list, pause/resume, and run-now actions
- Kanban: board view
- Models, channels, and privacy settings: read-only settings panes

### Client behavior note

- `api_client` signs each HTTP request with the per-launch HMAC secret, rejects
  non-2xx status codes, and decodes snake_case JSON into Rust models.
- `backend_process` owns the bundled helper process and selects an
  available loopback port per launch.

Sources:
- `crates/desktop-app/src/`

## CLI operational surface

CLI command entry: `crates/cli/src/main.rs`

### Functional today (`cli`)

- `rushdino start [--foreground]`
- `rushdino stop`
- `rushdino restart`
- `rushdino status`
- `rushdino health`
- `rushdino doctor` (minimal checks)
- `rushdino init`, `rushdino configure`, `rushdino dashboard`, `rushdino reset`, `rushdino uninstall`, `rushdino upgrade`

### Stubbed / not first-class today

These currently print "Command not yet implemented":
- `rushdino config`
- `rushdino message`
- `rushdino sessions`
- `rushdino memory`
- `rushdino agent`
- `rushdino agents`
- `rushdino browser`

Sources:
- `crates/cli/src/main.rs`
- `crates/cli/src/commands/*.rs`

## Practical routing decision

- If the GPUI desktop client already exposes an operation, prefer that path first.
- If CLI command is stubbed, use API directly or tool path.
- For missing first-class endpoints, use `shell_exec` fallback with approval where required.

Last verified: 2026-08-22
