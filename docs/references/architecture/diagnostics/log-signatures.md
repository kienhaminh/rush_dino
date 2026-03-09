---
title: "Log Signatures"
summary: "Common runtime errors and signatures mapped to likely root cause and patch target files."
read_when:
  - You already have an error message and need the fastest patch path
  - You are building incident runbooks from observed logs
  - You want deterministic symptom-to-owner mapping
---

# Log Signatures

| Signature (message fragment) | Likely root cause | Patch target files |
|---|---|---|
| `tool approval blocked: no active session` | Dangerous `shell_exec` outside active registered session | `crates/server/src/approval_gate.rs`, `crates/server/src/routes/chat.rs`, `crates/server/src/ws.rs` |
| `tool approval timed out` | Approval request not resolved in time | `crates/server/src/approval_gate.rs`, client approval flow |
| `message rejected: prompt injection detected` | HTTP request blocked by taint scanner | `crates/server/src/routes/chat.rs`, `crates/security/src/validation.rs` |
| `oldText not found in file` | `file_edit` exact-match replacement failed | `crates/agent/src/tools/file_edit.rs` |
| `oldText appears ... times` | `file_edit` requires unique match, ambiguous selection | `crates/agent/src/tools/file_edit.rs` |
| `invalid path` from `file_read` | Path outside allowed root (`~/.rushdino/documents`) | `crates/agent/src/tools/file_read.rs`, `crates/security/src/validation.rs` |
| `web_fetch URL blocked` / `web_search endpoint blocked` | URL validation blocked host/IP | `crates/agent/src/tools/web_fetch.rs`, `crates/agent/src/tools/web_search.rs`, `crates/security/src/validation.rs` |
| `unknown agent` | Delegation/workflow references missing template | `crates/agent/src/agent_manager.rs`, `crates/agent/src/tools/delegate_to_agent.rs`, `crates/agent/src/engine.rs` |
| `step ... references unknown agent` | Workflow step points to nonexistent agent template | `crates/agent/src/engine.rs`, `crates/agent/src/workflow_manager.rs` |
| `agent error for conversation` | Agent execution failed after routing | `crates/gateway/src/router.rs`, `crates/agent/src/engine.rs` |
| `send error on` | Channel adapter send failure to recipient | `crates/gateway/src/router.rs`, adapter crate (`crates/extensions/*`) |
| `API ... returned HTML instead of JSON` | Frontend called API while backend route unavailable or fallback served | `frontend/src/lib/api.ts`, `crates/server/src/lib.rs` |
| `failed to create missing markdown file` | First-turn markdown bootstrap write failed | `crates/agent/src/engine_bootstrap.rs` |

## Usage pattern

1. Match the closest signature fragment.
2. Confirm route/tool path with [Source Map](../reference/source-map.md).
3. Apply minimal fix in owning file first.
4. Re-run checks from [First 60 Seconds](./first-60-seconds.md).

Last verified: 2026-03-05
