# System Sandbox Overview Design

**Date:** 2026-03-18
**Status:** Approved

## Summary

Expand `/system/sandbox` from a session audit log view into a read-only sandbox control plane for RushDino. The page should show the full sandbox posture across three levels: global shell sandbox configuration, per-agent sandbox policy coverage, and live session enforcement activity, while preserving the existing per-session audit drill-down.

## Goals

- Make `/system/sandbox` the single operator-facing page for understanding RushDino sandbox posture.
- Surface the global shell sandbox state from server config.
- Surface per-agent sandbox policy posture without requiring operators to open each agent individually.
- Keep the first version read-only except for the already-existing live session approval and network hot-reload actions.

## Non-Goals

- Editing global shell sandbox settings from `/system/sandbox`
- Editing per-agent sandbox policies from `/system/sandbox`
- Replacing the dedicated agent sandbox policy editor in config views

## Data Model

### Global shell sandbox posture

Reuse `fetchSystemSummary()` and show:

- `security.sandboxEnabled`
- `security.sandboxAllowNetwork`
- `security.sandboxWorkspaceRoot`
- `execution.shell_exec_sandbox.extra_write_roots` from `fetchConfig()`

### Per-agent sandbox posture

Extend the agent list API so each agent row can optionally include the parsed `sandbox_policy` already attached in `AgentManager::list()`.

The UI should derive a compact summary from that policy:

- policy present / absent
- filesystem default
- filesystem allow / deny counts
- network default
- network on-block mode
- network allow rule count
- privileged process allowance
- denied command count
- credential provider count

### Live session posture

Reuse existing audit log data. The page should derive:

- discovered session ids
- per-session pending count
- per-session recent decision mix
- selected session audit detail

## UI Structure

`/system/sandbox` becomes a single scrollable page with four sections:

1. Global shell sandbox
2. Agent policies
3. Live sessions
4. Audit log and session actions

### Global shell sandbox

Show a top summary card with:

- enabled/disabled badge
- network allowed/blocked badge
- workspace root
- extra write roots list

### Agent policies

Show a read-only table or list of all agents with compact posture badges and counts. Agents without `sandbox.yaml` should be explicit, not omitted.

### Live sessions

Keep the existing session list concept, but augment it with light metadata:

- pending approvals
- last event time
- whether the session appears agent-scoped

### Audit log

Keep the existing audit log table and pending approval actions. This remains the drill-down area for a selected session.

## Backend Changes

Update `GET /api/agents` to include optional `sandboxPolicy` data for each agent entry.

No new endpoint is required for the first pass.

## Frontend Changes

- Extend `AgentRecord` and API typing to include optional sandbox policy.
- Refactor `SandboxMonitorPage` into a broader sandbox overview page with sectioned layout.
- Add small formatter helpers for policy summaries and recent session metrics.

## Testing

- Backend route test for agent list serialization including `sandboxPolicy`
- Frontend page test for rendering global shell sandbox posture and agent policy summary
- Preserve coverage for existing sandbox page behavior where possible
