---
title: "CRUD Capability Matrix"
summary: "Canonical current-state C/R/U/D contract by resource class across tools, APIs, UI wrappers, CLI, and shell fallbacks."
read_when:
  - You need a definitive answer on whether an operation is supported
  - You need to choose between tool, API, UI, CLI, or shell path
  - You are writing automation that must avoid unsupported assumptions
---

# CRUD Capability Matrix

Labels: `native`, `api`, `ui-wrapper`, `cli`, `shell-fallback`, `unsupported`

| Resource class | Create | Read | Update | Delete | Notes |
|---|---|---|---|---|---|
| Files (general workspace) | `shell-fallback` | `shell-fallback` | `native` (`file_edit`) | `shell-fallback` | `file_read` is limited to `~/.rushdino/documents`; broad file CRUD often requires shell. |
| Files (`~/.rushdino/documents`) | `shell-fallback` | `native` (`file_read`) | `native` (`file_edit`) | `shell-fallback` | `file_read` path validation enforced. |
| Memory files | `native` (`memory_write`) | `native` (`memory_read`,`memory_search`) | `native` (`memory_write`) | `unsupported` direct, `shell-fallback` | No dedicated memory delete tool. |
| Agent templates | `native` (`spawn_agent`) | `native` (`agents_list`), `api` | `api` (`PATCH /api/agents/:id/files/:filename`), `shell-fallback` | `api` (`DELETE /api/agents/:id`) | Delete is first-class in the server/UI, but file-level template CRUD is still patch-only. |
| Skills | `native` (`create_skill`) | `native` (`list_skills`), `api` | `native` (`create_skill` overwrite), `api` (`POST /api/skills`) | `api` (`DELETE /api/skills/:name`) | UI now wraps list/create/edit/delete against the skill routes. |
| Managed files (`agents/*`, `skills/*`) | `api` (`POST /api/files` with `create`) | `api` (indirect via skills/agents routes) | `api` (`POST /api/files` with `move`) | `api` (`POST /api/files` with `delete`) | Path scope is bounded to managed roots; dry-run supported. |
| Conversations | `native` (chat auto-create, `sessions_spawn`) | `native` (`sessions_history`,`session_status`), `api` | `native` (chat/`sessions_send`) | `api` (`DELETE /api/conversations/:id`) | Frontend consumes conversation routes. |
| Sessions (`gateway_sessions`) | `native` (auto in router) | `native` (`sessions_list`) | `native` (`/new` reset in router path) | `unsupported` direct | No explicit delete route for session row. |
| Runs (`runtime_runs`) | `api` (`POST /api/runs`, runtime-backed `POST /api/chat`, workflow run start) | `api` (`GET /api/runs`, `GET /api/runs/:id`, `GET /api/sessions/:id/runs`) | `api` (`GET /api/runs/:id/wait`) | `api` (`POST /api/runs/:id/abort`) | Assistant and workflow activity now persist first-class run snapshots and timeline events. |
| Workflows | `native` (`create_workflow`) and `api` | `api` | `api` | `api` | Frontend wraps all workflow CRUD routes. |
| Config | `api` (`PATCH /api/config`) | `api` (`GET /api/config`) | `api` | `unsupported` direct (no delete route) | CLI `config` command is stubbed. |
| Credentials | `api` (`PATCH /api/credentials`) | `api` (`GET /api/credentials`) | `api` | `unsupported` direct (no delete route) | Redaction sentinel `***` supported in patch flow. |
| Provider profiles | `api` (`POST /api/profiles`) | `api` (`GET /api/profiles`) | `api` (`PUT /api/profiles/:id`) | `api` (`DELETE /api/profiles/:id`) | UI wrappers exist in the desktop API client. |
| Knowledge graph inputs/facts | `api` (`/api/documents/ingest`, `/api/graph/backfill`), `native` (`memory_write` ingest hook) | `api` (`/api/graph/*`), `native` (`knowledge_graph_query` when enabled) | `api` (re-ingest/backfill), `native` (new memory writes) | `unsupported` direct | No first-class fact deletion route/tool. |

## CLI status for CRUD work

- Operational for service health/lifecycle: `start`, `stop`, `status`, `health`, `doctor`.
- Stubbed (not first-class CRUD): `config`, `message`, `memory`, `sessions`, `agent`, `agents`, `browser`.

Sources:
- `crates/agent/src/tools/*`
- `crates/server/src/lib.rs`
- `crates/server/src/routes/*`
- `crates/cli/src/main.rs`, `crates/cli/src/commands/*`
- `crates/desktop-app/ui/src/api/`

Last verified: 2026-03-07
