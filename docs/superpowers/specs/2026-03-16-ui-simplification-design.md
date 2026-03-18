# RushDino UI Simplification Design

## Goal

Reduce RushDino's operator-facing complexity by collapsing overlapping top-level surfaces into a smaller daily-ops-first information architecture without removing existing capabilities.

## Decisions

- Primary navigation is reduced to `Workspace`, `Operations`, `Channels`, `Sessions`, `Runs`, `Config`, and `Advanced`.
- `Runs` remains a primary destination because it is the only global run-inspection surface with queue filtering, timeline inspection, and abort actions across sessions and workflows.
- `Operations` becomes the grouped home for summary, approvals, diagnostics, and analytics.
- `Channels` becomes the grouped home for gateway operations and infrastructure/instances.
- `Config` absorbs the shared soul/memory surface under `Identity`.
- Builder and low-frequency system tools move under `Advanced`.
- Existing legacy routes remain valid through redirects for one release window.
- Major operator state is URL-addressable:
  - `operations/:view`
  - `config/:section`
  - `sessions/:sessionId?tab=...`
  - `runs?run=...&kind=...&state=...`
  - `channels/:channel?panel=...`
  - `advanced/:area/:view`

## Route Model

- `/` stays the workspace/chat surface.
- `/operations/:view` hosts:
  - `summary`
  - `approvals`
  - `diagnostics`
  - `analytics`
- `/channels` and `/channels/:channel` host channel runtime, infrastructure, and channel detail/settings.
- `/config/:section` hosts:
  - `profiles`
  - `credentials`
  - `server`
  - `identity`
- `/advanced/:area/:view` hosts:
  - `builder/*`
  - `system/*`

## UX Rules

- The main sidebar only shows primary operator destinations.
- Each grouped surface owns its own secondary navigation instead of pushing every destination into the global sidebar.
- Route transitions show a visible loading state instead of a blank suspense fallback.
- Child pages keep their existing capabilities, but the shell provides clearer hierarchy and grouping.
- Run-surface ownership stays explicit:
  - `Sessions` owns session-local run context.
  - `Workflows` owns workflow-local run history.
  - `Runs` owns global cross-session triage.
  - `Debug` and `Operations` may summarize or deep-link into runs, but should not grow into a second full run-inspection surface.
- Revisit the top-level `Runs` nav item only if operators rarely open `/runs` or if duplicate-navigation confusion shows up in feedback, bug reports, or review notes. Do not remove it for simplification alone without a replacement global execution surface.

## Non-Goals

- No server API changes.
- No feature removal in phase 1.
- No visual redesign of all pages from scratch.
