# Sandbox Page Redesign

**Date:** 2026-03-29
**Status:** Approved

## Problem

The current sandbox page has two structural issues:

1. **Information duplication** — Four stat cards (Shell Sandbox, Workspace Root, Extra Write Roots, Agents with Policy) repeat data already shown in the "Shell sandbox posture" card below them.
2. **Dual agent selectors** — The top agent dropdown and the "Agent policies" list inside the Overview tab are two independent agent pickers that serve overlapping purposes and don't stay in sync.
3. **Agent sub-session audit logs hidden** — `kind='agent'` sessions (spawned during delegation) are never surfaced in the sandbox, so per-team-agent request tracking is impossible.

## Goal

A focused sandbox page with two concerns only:
- **Request tracking** — live in/out audit feed per agent
- **Policy control** — MCP, Network, and Bash policy per agent

## Architecture Context

- **Main session** — fixed id `"main"`, `kind='user'`, always exists from startup. Its audit log represents the main (orchestrator) agent's requests.
- **Agent templates** — `~/.rushdino/agents/*.md` files (Researcher, Code Reviewer, etc.). Each has an optional `sandbox.yaml` policy.
- **Agent sub-sessions** — `kind='agent'`, created on delegation. Each sub-session belongs to a specific agent template and holds that agent's audit log. Currently excluded from the sandbox UI.

## Design

### Overall layout

Remove the `Overview` tab — it no longer serves a purpose. The page becomes two persistent stacked sections with no tab switching at the top level.

Remove entirely:
- The 4 stat cards
- The "Shell sandbox posture" card
- The "Live sessions" card
- The "Agent policies" selector list
- The top-level `Overview` tab

### Section 1: Main agent (always visible)

A pinned section at the top of the page. Never hidden or collapsed.

- **Header:** "★ Main agent" label + session status badge (active / idle / awaiting_approval)
- **Split layout** (same pattern as existing MCP/Network/Bash tabs):
  - **Left panel:** Live request feed from the `main` session audit log. Filterable by category (MCP · Network · Bash). Auto-refreshes every 5 seconds.
  - **Right panel:** Policy tabs — MCP · Network · Bash — editing the main agent's sandbox policy. Apply button hot-reloads the policy.

### Section 2: Team agents

A section below Main with its own agent selector.

- **Header:** "Team agents" label + dropdown listing all agent templates (Researcher, Code Reviewer, Writer, etc.)
- **Split layout** (identical structure to Section 1):
  - **Left panel:** Live request feed pulled from `kind='agent'` sub-sessions for the selected agent template. Aggregates requests across all sub-sessions for that agent. Filterable by category. Auto-refreshes every 5 seconds.
  - **Right panel:** Policy tabs — MCP · Network · Bash — editing the selected agent template's sandbox policy.

### Split layout (shared pattern)

Both sections reuse the same split component:

```
┌────────────────────────────┬──────────────────┐
│ LIVE REQUESTS              │ Policy tabs       │
│ [All] [Network] [MCP] [Bash│ MCP · Net · Bash  │
│                            │                   │
│ → GET api.openai.com  allow│ ↑ Outbound        │
│ ← POST internal.svc   deny │ Default: deny     │
│ → bash: git log    pending │ On block: prompt  │
│                            │ ─────────────────  │
│                            │ ↓ Inbound         │
│                            │ Max size: 256KB   │
│                            │                   │
│                            │ [Apply]           │
└────────────────────────────┴──────────────────┘
```

## Data Flow

| Data | Source | Already exists? |
|------|--------|----------------|
| Main session audit log | `getSessionAuditLog("main")` | Yes |
| Main agent policy | `fetchAgents()` → find main agent, `putAgentSandbox()` | Yes |
| Agent template list | `fetchAgents()` | Yes |
| Team agent audit log | `fetchAgentSessions()` → filter by agent id → `getSessionAuditLog(sessionId)` | `fetchAgentSessions()` exists, wiring into sandbox is new |
| Team agent policy | `putAgentSandbox(agentId, policy)` | Yes |

## Files to Change

| File | Change |
|------|--------|
| `frontend/src/pages/sandbox/SandboxMonitorPage.tsx` | Remove 4 stat cards, Overview tab, Shell posture card, Live sessions card, Agent policies list. Add two-section layout. Wire `fetchAgentSessions()` for team audit feed. |
| `frontend/src/pages/sandbox/tabs/sandbox-mcp-tab.tsx` | No change — reused as-is in both sections |
| `frontend/src/pages/sandbox/tabs/sandbox-network-tab.tsx` | No change — reused as-is in both sections |
| `frontend/src/pages/sandbox/tabs/sandbox-bash-tab.tsx` | No change — reused as-is in both sections |

## Out of Scope

- Pending approval / approve-deny workflow — keep as-is, not addressed in this redesign
- Agent session drill-down (viewing individual sub-session history) — future work
- Global policy that inherits to all agents — future work
