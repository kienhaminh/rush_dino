---
title: "RushDino Agent Operating Docs"
summary: "Self-repair operating docs for architecture, tools, CRUD pathways, safety guardrails, and troubleshooting."
read_when:
  - You need the fastest path to diagnose and fix RushDino issues end-to-end
  - You need to verify what an agent can and cannot create/read/update/delete today
  - You are patching backend, frontend, CLI, or desktop behavior
---

# RushDino Agent Operating Docs

This documentation set is the operational contract for how RushDino agents can work on the system today.

It covers:
- Architecture and runtime flows across backend, frontend, and desktop
- Registered tool behavior and safety controls
- Current CRUD capability surface by resource class
- Symptom-first troubleshooting runbooks
- Explicit gaps where first-class CRUD is still missing

## Start here

- Architecture map: [System Overview](./concepts/system-overview.md)
- Runtime message and tool flow: [Runtime Flows](./concepts/runtime-flows.md)
- Tool capabilities: [Tool Catalog](./tools/tool-catalog.md)
- Tool safety and approvals: [Tool Guardrails and Approvals](./tools/tool-guardrails-and-approvals.md)
- CRUD contract (canonical): [CRUD Capability Matrix](./reference/crud-capability-matrix.md)
- API contract: [HTTP API Surface](./reference/http-api-surface.md)
- Symptom triage entrypoint: [Troubleshooting Hub](./help/troubleshooting.md)
- Known missing first-class operations: [First-Class CRUD Gaps](./gaps/first-class-crud-gaps.md)
- Current-system notes: [Notes](../../notes.md)
- Prioritized security/runtime debt: [Tech debt](../../tech_debt.md)

## Capability labels used in this docs set

- `native`: direct first-class behavior in agent runtime/tooling
- `api`: first-class HTTP route exists (`/api/*`)
- `ui-wrapper`: frontend calls an API and wraps it in UI
- `cli`: CLI command supports the operation directly
- `shell-fallback`: operation is possible via `shell_exec` command execution
- `unsupported`: no safe first-class path in current system

## Operating boundaries

- "Anything through this system" means within RushDino runtime boundaries and safety controls.
- Dangerous shell operations are approval-gated.
- Some CRUD operations are intentionally not first-class yet (documented in gaps).
- Documentation is current-state first; target-state ideas are separated into gap proposals.

Last verified: 2026-03-05
