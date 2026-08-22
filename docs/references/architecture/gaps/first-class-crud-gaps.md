---
title: "First-Class CRUD Gaps"
summary: "Current missing first-class CRUD capabilities and prioritized implementation proposals with impacted files."
read_when:
  - You need to plan roadmap work for native CRUD parity
  - You need to justify shell-fallback usage today
  - You are preparing implementation tickets from operational gaps
---

# First-Class CRUD Gaps

This is a current-state gap analysis. It does not change runtime behavior.

## Priority P0

### Gap: no first-class file delete/create tool contract

- Current behavior:
- create/delete often uses `shell_exec` (`shell-fallback`)
- no `file_create` / `file_delete` tool
- Risk:
- higher operational risk and approval friction for common file operations
- Proposal:
- add bounded `file_create`, `file_delete`, `file_move` tools with path allowlist and explicit overwrite policy
- Impacted files:
- `crates/agent/src/tools/` (new files)
- `crates/agent/src/engine_bootstrap.rs`
- `crates/security/src/validation.rs`

### Gap: no first-class skill delete tool or native control

- Current behavior:
- `create_skill` and `list_skills` tools exist
- `DELETE /api/skills/:name` exists, but the GPUI desktop client has no delete control
- Proposal:
- add a `delete_skill` tool with strict name validation and a native
  confirmation action
- Impacted files:
- `crates/agent/src/tools/create_skill.rs` (or new `delete_skill.rs`)
- `crates/agent/src/skill_manager.rs`
- `crates/agent/src/engine_bootstrap.rs`
- `crates/desktop-app/src/ui/chat_view.rs` (resource_list renderer)

## Priority P1

### Gap: no first-class agent template delete tool or native control

- Current behavior:
- create via `spawn_agent`
- update via file patch endpoint
- delete via `DELETE /api/agents/:id`
- no `delete_agent` tool or native delete control
- Proposal:
- add a `delete_agent` tool with safety checks and a native confirmation action
- Impacted files:
- `crates/server/src/routes/agents.rs`
- `crates/agent/src/agent_manager.rs`
- `crates/desktop-app/src/api_client.rs`
- `crates/desktop-app/src/ui/chat_view.rs` (resource_list renderer)

### Gap: no first-class graph fact deletion/edit APIs

- Current behavior:
- ingest/backfill/query available
- no delete or correction route
- Proposal:
- add graph mutation endpoints with evidence-aware delete/update semantics
- Impacted files:
- `crates/server/src/routes/graph.rs`
- `crates/knowledge-graph/src/*`
- `crates/desktop-app/src/api_client.rs`
- `crates/desktop-app/src/ui/chat_view.rs` (resource_list renderer)

## Priority P2

### Gap: CLI domain commands are mostly stubs for CRUD workflows

- Current behavior:
- many commands print "not yet implemented"
- Proposal:
- implement CLI wrappers for conversation/session/profile/config CRUD routes
- Impacted files:
- `crates/cli/src/commands/*.rs`
- `crates/cli/src/main.rs`

### Gap: sandbox primitives are not integrated into `shell_exec`

- Current behavior:
- dynamic sandboxing is now integrated through a local system broker for `shell_exec`
- mirrored workspaces are created under `~/.rushdino/workspaces`
- one-way copy-in means sandbox edits are not first-class host workspace mutations
- Proposal:
- add explicit export/apply workflows if sandbox outputs need to be promoted back to host paths
- Impacted files:
- `crates/agent/src/tools/shell_exec.rs`
- `crates/server/src/system_broker.rs`
- `crates/security/src/sandbox.rs`
- `crates/common/src/config.rs` (feature toggle/policy)

## Guardrail requirement for all gap closures

Any new first-class CRUD operation should include:
- strict input validation
- bounded path or scope controls
- explicit dry-run or preview mode where destructive
- unit tests for success and failure branches
- docs update in `docs/references/architecture/reference/crud-capability-matrix.md`

Last verified: 2026-08-22
