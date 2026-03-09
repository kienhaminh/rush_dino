---
title: "Tool Guardrails and Approvals"
summary: "Safety model for tool execution: taint scanning, path/url validation, dangerous command approvals, and runtime boundaries."
read_when:
  - You need to understand why a tool call was blocked
  - You are debugging pending approval behavior
  - You are auditing safety boundaries for CRUD operations
---

# Tool Guardrails and Approvals

## 1. Prompt injection and taint model

- HTTP chat input is pre-scanned in `routes/chat.rs`.
- Tool arguments are scanned again inside `react_loop.rs` before execution.
- Taint outcomes:
- suspicious: logs warning and continues
- malicious: blocks tool execution

Sources:
- `crates/server/src/routes/chat.rs`
- `crates/agent/src/react_loop.rs`
- `crates/security/src/validation.rs`

## 2. Dangerous command approval model (`shell_exec`)

- `shell_exec` forwards execution to the local system broker.
- The broker checks command text for dangerous patterns (`rm -rf`, `sudo`, `curl | sh`, etc.).
- If dangerous, the broker:
- requires approval provider
- requires session + conversation context
- requests approval through `ApprovalGate`

Sources:
- `crates/agent/src/tools/shell_exec.rs`
- `crates/server/src/system_broker.rs`
- `crates/server/src/approval_gate.rs`
- `crates/server/src/routes/approval.rs`

## 3. WebSocket vs HTTP approval behavior

- WebSocket:
- receives `approval_request` event
- client sends `approval_response`
- server emits `approval_result`
- HTTP:
- may return `status="pending_approval"` with `request_id` + `session_id`
- client resolves through `POST /api/approval/{request_id}`

Sources:
- `crates/server/src/ws.rs`
- `crates/server/src/routes/chat.rs`
- `crates/server/src/routes/approval.rs`

## 4. Path and URL validation

- `file_read` validates canonical path under allowed root (`~/.rushdino/documents`).
- `web_search` and `web_fetch` validate URLs and reject blocked/private IP patterns.
- Document ingest route validates requested root path.

Sources:
- `crates/agent/src/tools/file_read.rs`
- `crates/agent/src/tools/web_search.rs`
- `crates/agent/src/tools/web_fetch.rs`
- `crates/server/src/routes/documents.rs`
- `crates/security/src/validation.rs`

## 5. Delegation depth guardrails

- `delegate_to_agent`, `sessions_send`, and `sessions_spawn` enforce max depth of 3.
- Prevents recursive task loops.

Sources:
- `crates/agent/src/tools/delegate_to_agent.rs`
- `crates/agent/src/tools/sessions_send.rs`
- `crates/agent/src/tools/sessions_spawn.rs`

## 6. Important boundary to remember

- `file_edit` currently has no explicit root allowlist check and writes to provided path if accessible.
- `shell_exec` no longer executes host commands directly from the tool layer.
- The system broker mirrors the requested host workspace under `~/.rushdino/workspaces/...`, then runs the command there.
- Sandbox write access is bounded to the mirrored workspace, temp dirs, and configured extra write roots.

This is intentional to document as current behavior, not desired future state.

Last verified: 2026-03-06
