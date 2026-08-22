---
title: "Runbook: Conversation, Workflow, Profile CRUD"
summary: "Symptom-first runbook for CRUD failures across conversations, workflows, and provider profiles."
read_when:
  - API/UI CRUD operations fail for conversations, workflows, or profiles
  - Workflows fail validation around agent assignments
  - Provider profile updates or OAuth connect paths break runtime behavior
---

# Runbook: Conversation, Workflow, Profile CRUD

## Scenario 1: Conversation delete/read mismatch

### Symptom

Conversation list/detail/delete behavior is inconsistent or delete appears to do nothing.

### Scope

`/api/conversations` CRUD path and conversation manager behavior.

### Verification command

```bash
curl -s http://127.0.0.1:28847/api/conversations
rg -n "list_conversations|get_conversation|delete_conversation" crates/server/src/routes/conversations.rs
```

### Expected output

- Route handlers exist for list/detail/delete.
- Delete route returns `{ "deleted": true }`.

### Likely root cause

Wrong conversation ID, stale UI state, or route invocation mismatch.

### Patch target files

- `crates/server/src/routes/conversations.rs`
- `crates/agent/src/conversation.rs`
- `crates/desktop-app/src/api_client.rs`
- `crates/desktop-app/src/store.rs`

### Post-fix checks

1. Delete one known conversation ID.
2. Re-list conversations and verify absence.
3. Confirm UI refresh path reflects deletion.

---

## Scenario 2: Workflow create/update fails with unknown agent

### Symptom

Workflow creation/update fails with validation similar to unknown agent reference.

### Scope

Workflow validation against available agent templates.

### Verification command

```bash
rg -n "references unknown agent|validate_workflow_agents" crates/agent/src/engine.rs crates/agent/src/tools/create_workflow.rs
curl -s http://127.0.0.1:28847/api/agents
```

### Expected output

- Validation checks for agent existence are present.
- `/api/agents` returns template IDs available for workflow steps.

### Likely root cause

Workflow step `agent_id` does not match a configured template name.

### Patch target files

- `crates/agent/src/engine.rs`
- `crates/agent/src/tools/create_workflow.rs`
- `crates/desktop-app/src/ui/chat_view.rs` (resource_list renderer)

### Post-fix checks

1. Recreate/update workflow with valid `agent_id` values.
2. Start workflow run and confirm run steps persist.

---

## Scenario 3: Profile CRUD succeeds but runtime still uses wrong provider

### Symptom

Profile create/update/connect call succeeds, but chat still routes through old provider profile.

### Scope

Profile persistence + runtime refresh + default profile behavior.

### Verification command

```bash
curl -s http://127.0.0.1:28847/api/profiles
rg -n "refresh_engine_provider|default_profile_id|connect_codex" crates/server/src/routes/providers.rs crates/server/src/lib.rs
```

### Expected output

- Profile routes call runtime refresh helper.
- OAuth connect flow updates provider kind/auth method/default profile when needed.

### Likely root cause

Default profile not set as expected, or refresh path did not apply due to profile/credentials state mismatch.

### Patch target files

- `crates/server/src/routes/providers.rs`
- `crates/server/src/lib.rs`
- `crates/desktop-app/src/api_client.rs`
- `crates/desktop-app/src/ui/settings_view.rs`

### Post-fix checks

1. Confirm `default_profile_id` in config state.
2. Send chat request and verify provider behavior in runtime logs.

Last verified: 2026-08-22
