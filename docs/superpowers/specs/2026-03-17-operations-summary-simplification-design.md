# Operations Summary Simplification Design

## Goal

Simplify the overview and operations summary surfaces so operators see high-signal status first, while detailed connectivity and runtime breakdowns stay available through progressive disclosure.

## Scope

- Simplify the summary presentation on the overview dashboard.
- Simplify the summary strip on the operations shell.
- Preserve the current `SystemSummaryResponse` data; do not remove backend fields or API calls.

## Design

### Information hierarchy

Use three tiers on overview:

1. Health header: overall health, provider, uptime, profiles, refresh.
2. Primary operator counts: approvals, channels needing attention, active runs, incidents.
3. Secondary detail: compact connectivity and runtime summaries that expand only when the operator needs detail.

### Progressive disclosure

Replace the large connectivity/runtime card cluster with a single "Operational status" surface:

- `Channels`: summarize as a short sentence such as `1 needs attention, 2 healthy, 1 disabled`.
- `Runtime`: summarize as a short sentence such as `3 active, 5 queued, 1 blocked`.
- Expand each section only when detail is needed.
- Auto-open sections when there is a problem signal such as channel attention or blocked runs.

### Operations shell

Replace the all-caps metric strip with a calmer compact summary row that mirrors the same operator language used on overview. Keep navigation and refresh action unchanged.

## Non-goals

- No backend contract changes.
- No new infrastructure metrics like CPU, RAM, or disk usage.
- No route restructuring.
