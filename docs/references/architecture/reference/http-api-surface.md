---
title: "HTTP API Surface"
summary: "Exact current server route surface grouped by domain, with handler ownership and CRUD relevance."
read_when:
  - You need to confirm endpoint availability before implementing UI or tools
  - You need to patch API behavior and locate owning module
  - You need current-state route truth for CRUD analysis
---

# HTTP API Surface

Route registration source: `crates/server/src/lib.rs`

## Core chat and transport

| Method | Route | Handler owner |
|---|---|---|
| `GET` | `/healthz` | `routes/health.rs` |
| `POST` | `/api/chat` | `routes/chat.rs` |
| `GET` | `/api/ws/chat` | `ws.rs` |

## Runtime, sessions, and logs

| Method | Route | Handler owner |
|---|---|---|
| `GET` | `/api/conversations` | `routes/conversations.rs` |
| `GET` | `/api/conversations/:id` | `routes/conversations.rs` |
| `DELETE` | `/api/conversations/:id` | `routes/conversations.rs` |
| `GET` | `/api/sessions` | `routes/sessions.rs` |
| `GET` | `/api/sessions/:id/runs` | `routes/runs.rs` |
| `GET` | `/api/runs` | `routes/runs.rs` |
| `POST` | `/api/runs` | `routes/runs.rs` |
| `GET` | `/api/runs/:id` | `routes/runs.rs` |
| `POST` | `/api/runs/:id/abort` | `routes/runs.rs` |
| `GET` | `/api/runs/:id/wait` | `routes/runs.rs` |
| `GET` | `/api/logs` | `routes/logs.rs` |
| `GET` | `/api/usage/metrics` | `routes/usage_metrics.rs` |

## Gateway admin and channel operations

| Method | Route | Handler owner |
|---|---|---|
| `GET` | `/api/gateway/summary` | `routes/gateway.rs` |
| `GET` | `/api/gateway/adapters` | `routes/gateway.rs` |
| `GET` | `/api/gateway/sessions` | `routes/gateway.rs` |
| `POST` | `/api/gateway/adapters/:channel/restart` | `routes/gateway.rs` |
| `POST` | `/api/gateway/sessions/:id/reset` | `routes/gateway.rs` |

## Agents and agent progress

| Method | Route | Handler owner |
|---|---|---|
| `GET` | `/api/agents` | `routes/agents.rs` |
| `DELETE` | `/api/agents/:id` | `routes/agents.rs` |
| `GET` | `/api/agents/progress` | `routes/agent_progress.rs` |
| `GET` | `/api/agents/:id/runtime` | `routes/agents.rs` |
| `PATCH` | `/api/agents/:id/files/:filename` | `routes/agents.rs` |

## Workflows

| Method | Route | Handler owner |
|---|---|---|
| `GET` | `/api/workflows` | `routes/workflows.rs` |
| `POST` | `/api/workflows` | `routes/workflows.rs` |
| `GET` | `/api/workflows/:id` | `routes/workflows.rs` |
| `PATCH` | `/api/workflows/:id` | `routes/workflows.rs` |
| `DELETE` | `/api/workflows/:id` | `routes/workflows.rs` |
| `GET` | `/api/workflows/:id/runs` | `routes/workflows.rs` |
| `POST` | `/api/workflows/:id/runs` | `routes/workflows.rs` |
| `GET` | `/api/workflow-runs/:run_id` | `routes/workflows.rs` |

## Knowledge graph and document ingest

| Method | Route | Handler owner |
|---|---|---|
| `POST` | `/api/documents/ingest` | `routes/documents.rs` |
| `GET` | `/api/graph/search` | `routes/graph.rs` |
| `GET` | `/api/graph/facts` | `routes/graph.rs` |
| `GET` | `/api/graph/node/:id` | `routes/graph.rs` |
| `GET` | `/api/graph/stats` | `routes/graph.rs` |
| `POST` | `/api/graph/backfill` | `routes/graph.rs` |

## Operations, diagnostics, and approvals

| Method | Route | Handler owner |
|---|---|---|
| `GET` | `/api/system/summary` | `routes/system.rs` |
| `GET` | `/api/system/doctor` | `routes/system.rs` |
| `GET` | `/api/approvals` | `routes/approval.rs` |
| `GET` | `/api/approval/:request_id` | `routes/approval.rs` |
| `POST` | `/api/approval/:request_id` | `routes/approval.rs` |

## Files, skills, config, and providers

| Method | Route | Handler owner |
|---|---|---|
| `POST` | `/api/files` | `routes/files.rs` |
| `GET` | `/api/skills` | `routes/skills.rs` |
| `POST` | `/api/skills` | `routes/skills.rs` |
| `DELETE` | `/api/skills/:name` | `routes/skills.rs` |
| `GET` | `/api/config` | `routes/config.rs` |
| `PATCH` | `/api/config` | `routes/config.rs` |
| `GET` | `/api/credentials` | `routes/config.rs` |
| `PATCH` | `/api/credentials` | `routes/config.rs` |
| `GET` | `/api/profiles` | `routes/providers.rs` |
| `POST` | `/api/profiles` | `routes/providers.rs` |
| `PUT` | `/api/profiles/:id` | `routes/providers.rs` |
| `DELETE` | `/api/profiles/:id` | `routes/providers.rs` |
| `GET` | `/api/providers/:profile_id/models` | `routes/providers.rs` |
| `POST` | `/api/providers/:profile_id/connect-oauth` | `routes/providers.rs` |

## CRUD relevance notes

- First-class delete endpoints now exist for conversations, workflows, profiles, skills, and agents.
- First-class run lifecycle routes now exist for create/list/detail/abort/wait.
- Bounded admin file mutations now exist for managed `agents/*` and `skills/*` roots via `POST /api/files`.
- Agent file update endpoint remains patch-only and supports both template and workspace files.
- Gateway now has first-class operator endpoints for adapter status, adapter restart, channel session inspection, and per-session reset from the UI.

Last verified: 2026-03-07
