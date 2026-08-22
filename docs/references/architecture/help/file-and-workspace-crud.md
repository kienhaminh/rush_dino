---
title: "Runbook: File and Workspace CRUD"
summary: "Symptom-first runbook for file_read/file_edit/shell_exec workflows and agent workspace file API patch behavior."
read_when:
  - File CRUD operations fail or behave unexpectedly
  - You need to understand document root restrictions and fallbacks
  - Agent workspace files are not updating through API/UI
---

# Runbook: File and Workspace CRUD

## Scenario 1: `file_read` cannot read expected path

### Symptom

`file_read` returns path validation error or cannot access a file outside expected area.

### Scope

Tool-level read access boundaries.

### Verification command

```bash
rg -n "Read file from ~/.rushdino/documents|validate_path" crates/agent/src/tools/file_read.rs crates/security/src/validation.rs
```

### Expected output

- `file_read` description references `~/.rushdino/documents`.
- `validate_path` call is present.

### Likely root cause

`file_read` is intentionally restricted to a specific root, so general workspace paths are out-of-scope.

### Patch target files

- `crates/agent/src/tools/file_read.rs`
- `crates/security/src/validation.rs`

### Post-fix checks

1. Call `file_read` on a file inside `~/.rushdino/documents` (should succeed).
2. Call `file_read` outside allowed root (should remain blocked unless policy intentionally changed).

---

## Scenario 2: `file_edit` fails with `oldText not found` or duplicate occurrence error

### Symptom

`file_edit` returns exact-match error or duplicate-match error.

### Scope

Tool-level update semantics for text replacement.

### Verification command

```bash
rg -n "oldText not found|appears .* times|replace\(" crates/agent/src/tools/file_edit.rs
```

### Expected output

- Validation branch for missing exact text.
- Validation branch for multiple occurrences.

### Likely root cause

`file_edit` is designed for exact, single-occurrence replacement, not fuzzy edits.

### Patch target files

- `crates/agent/src/tools/file_edit.rs`

### Post-fix checks

1. Retry with exact block that appears once.
2. Confirm file changed once and no unintended replacements occurred.

---

## Scenario 3: Need file create/delete but no first-class tool exists

### Symptom

Agent needs to create/delete file but cannot do so directly via dedicated tool.

### Scope

CRUD gap between first-class tooling and operational need.

### Verification command

```bash
ls crates/agent/src/tools | rg -n "file_"
rg -n "fn name\(\) -> &str \{\s*\"shell_exec\"|is_dangerous_command" crates/agent/src/tools/shell_exec.rs
```

### Expected output

- Only `file_read` and `file_edit` exist (no `file_delete` tool).
- `shell_exec` tool exists with dangerous command approval flow.

### Likely root cause

Delete/create file operations still rely on `shell_exec` fallback, but `shell_exec` now runs inside a mirrored workspace under `~/.rushdino/workspaces/...` rather than mutating the host workspace directly.

### Patch target files

- `crates/agent/src/tools/shell_exec.rs`
- (future feature) new tool file under `crates/agent/src/tools/`

### Post-fix checks

1. If using fallback, verify approval path resolves correctly.
2. Validate resulting filesystem state inside the mirrored sandbox workspace.
3. Document the operation label as `shell-fallback` in run output.

---

## Scenario 4: Agent workspace file update via API fails

### Symptom

`PATCH /api/agents/:id/files/:filename` fails or writes unexpected path.

### Scope

API path resolution and workspace file write behavior.

### Verification command

```bash
rg -n "update_agent_file|workspace_dir|agents_dir" crates/server/src/routes/agents.rs
```

### Expected output

- Core template file path: `agents/<agent>.toml`
- Workspace files path: `agents/<agent>/<filename>`

### Likely root cause

Invalid `agent_id`/`filename`, or misunderstanding of template file vs workspace file path rules.

### Patch target files

- `crates/server/src/routes/agents.rs`
- `crates/desktop-app/src/api_client.rs`
- `crates/desktop-app/src/ui/chat_view.rs` (resource_list renderer)

### Post-fix checks

1. Read updated runtime payload from `GET /api/agents/:id/runtime`.
2. Confirm file content and `missing=false` in response.

Last verified: 2026-08-22
