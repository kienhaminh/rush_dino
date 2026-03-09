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

### Gap: no first-class skill delete

- Current behavior:
- `create_skill` and `list_skills` exist; delete is shell fallback
- Proposal:
- add `delete_skill` tool with strict name validation
- Impacted files:
- `crates/agent/src/tools/create_skill.rs` (or new `delete_skill.rs`)
- `crates/agent/src/skill_manager.rs`
- `crates/agent/src/engine_bootstrap.rs`

## Priority P1

### Gap: no first-class agent template delete API/tool

- Current behavior:
- create via `spawn_agent`
- update via file patch endpoint
- delete via shell fallback only
- Proposal:
- add `DELETE /api/agents/:id` and optional `delete_agent` tool with safety checks
- Impacted files:
- `crates/server/src/routes/agents.rs`
- `crates/server/src/lib.rs`
- `crates/agent/src/agent_manager.rs`
- `frontend/src/lib/api.ts`

### Gap: no first-class graph fact deletion/edit APIs

- Current behavior:
- ingest/backfill/query available
- no delete or correction route
- Proposal:
- add graph mutation endpoints with evidence-aware delete/update semantics
- Impacted files:
- `crates/server/src/routes/graph.rs`
- `crates/knowledge-graph/src/*`
- `frontend/src/lib/api.ts`

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

Last verified: 2026-03-06
