---
title: "Runbook: Approval and Dangerous Ops"
summary: "Symptom-first runbook for pending approvals, denied dangerous commands, and shell fallback safety handling."
read_when:
  - Dangerous shell operations are blocked or stuck
  - Approval requests do not appear in client flows
  - You need to debug safety gate behavior end-to-end
---

# Runbook: Approval and Dangerous Ops

## Scenario 1: HTTP chat returns `pending_approval` and never completes

### Symptom

`POST /api/chat` returns status `pending_approval`, but result never advances.

### Scope

HTTP approval lifecycle (`chat` route + `ApprovalGate` + approval routes).

### Verification command

```bash
rg -n "pending_approval|register_session|resolve_approval|has_pending" crates/server/src/routes/chat.rs crates/server/src/routes/approval.rs crates/server/src/approval_gate.rs
curl -s http://127.0.0.1:28847/api/approval/<request_id>
```

### Expected output

- Chat route exposes pending approval payload with `request_id` and `session_id`.
- Approval status route returns `pending` before resolution.

### Likely root cause

Client did not call `POST /api/approval/{request_id}` with correct `session_id`, or request timed out.

### Patch target files

- `crates/server/src/routes/chat.rs`
- `crates/server/src/routes/approval.rs`
- `crates/server/src/approval_gate.rs`

### Post-fix checks

1. Resolve approval explicitly and verify status transitions.
2. Confirm chat completes after approval.

---

## Scenario 2: WebSocket approval events do not appear

### Symptom

Dangerous command on WS session does not emit `approval_request` event.

### Scope

WS socket event pipeline and approval receiver wiring.

### Verification command

```bash
rg -n "approval_request|approval_response|register_session|unregister_session" crates/server/src/ws.rs crates/server/src/approval_gate.rs
```

### Expected output

- WS handler registers session and listens for approval channel messages.
- `approval_request` payload emission code is present.

### Likely root cause

Session registration/ownership mismatch, socket disconnected, or command was not classified as dangerous.

### Patch target files

- `crates/server/src/ws.rs`
- `crates/agent/src/tools/shell_exec.rs`
- `crates/server/src/approval_gate.rs`

### Post-fix checks

1. Trigger dangerous command in WS chat.
2. Observe `approval_request` and `approval_result` events.

---

## Scenario 3: Command denied as dangerous unexpectedly

### Symptom

`shell_exec` asks for approval or is blocked for command thought to be safe.

### Scope

Danger pattern detection logic in shell tool.

### Verification command

```bash
rg -n "is_dangerous_command|patterns =" crates/agent/src/tools/shell_exec.rs
```

### Expected output

- Pattern list includes the matched fragment (for example `sudo`, `rm -rf`, `curl |`).

### Likely root cause

Substring-based danger matching categorized command as dangerous.

### Patch target files

- `crates/agent/src/tools/shell_exec.rs`

### Post-fix checks

1. Re-test command classification in unit tests.
2. Verify dangerous commands still require approval.

Last verified: 2026-03-05
