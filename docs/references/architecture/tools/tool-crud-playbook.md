---
title: "Tool CRUD Playbook"
summary: "How agent tools perform create/read/update/delete in current RushDino runtime, including shell fallbacks and non-first-class paths."
read_when:
  - You need to execute CRUD safely through tool calls
  - You need to know when to use API or shell fallback
  - You need to avoid claiming unsupported direct operations
---

# Tool CRUD Playbook

This playbook is current-state behavior.

## Files and workspace documents

- Create: `file_edit` can create by editing an existing file only; new file creation typically uses `shell_exec` (`shell-fallback`).
- Read: `file_read` is first-class but restricted to `~/.rushdino/documents` (`native`).
- Update: `file_edit` is first-class exact-match replacement (`native`).
- Delete: no first-class file delete tool; use `shell_exec` with approval when dangerous (`shell-fallback`).

## Memory files

- Create: `memory_write` writes to root `MEMORY.md` or a daily file (`native`).
- Read: `memory_read` and `memory_search` (`native`).
- Update: `memory_write` overwrite behavior (`native`).
- Delete: no first-class delete memory tool (`unsupported` direct, `shell-fallback` possible).

## Agent templates

- Create: `spawn_agent` writes `~/.rushdino/agents/<name>.toml` (`native`).
- Read: `agents_list` and server runtime routes (`native`/`api`).
- Update: currently via API file patch (`PATCH /api/agents/:id/files/:filename`) or shell (`api`/`shell-fallback`).
- Delete: no dedicated tool/API delete for agent template files (`unsupported` direct, `shell-fallback` possible).

## Skills

- Create: `create_skill` (`native`).
- Read: `list_skills` (`native`).
- Update: `create_skill` on same name overwrites skill file (`native`).
- Delete: no first-class skill delete tool/API (`unsupported` direct, `shell-fallback` possible).

## Conversations and sessions

- Create: conversation auto-created by chat or `sessions_spawn` (`native`).
- Read: `sessions_list`, `sessions_history`, `session_status` and `/api/conversations*` (`native`/`api`).
- Update: conversation content via `sessions_send`/chat (`native`).
- Delete: `/api/conversations/:id` (`api`, `ui-wrapper` where used).

## Workflows

- Create: `create_workflow` tool or `POST /api/workflows` (`native`/`api`).
- Read: workflow list/detail routes (`api`) and frontend wrappers (`ui-wrapper`).
- Update: `PATCH /api/workflows/:id` (`api`, `ui-wrapper`).
- Delete: `DELETE /api/workflows/:id` (`api`, `ui-wrapper`).

## Provider profiles and credentials

- Create/read/update/delete profiles: `/api/profiles*` (`api`, `ui-wrapper`).
- Config and credentials updates: `/api/config`, `/api/credentials` (`api`, `ui-wrapper`).
- Tool-level direct profile CRUD: not first-class (`unsupported`).

## Knowledge graph inputs

- Create/update:
- `memory_write` can ingest text to graph when graph enabled (`native`)
- `/api/documents/ingest` and `/api/graph/backfill` (`api`)
- Read: `knowledge_graph_query` tool (if registered) and `/api/graph/*` (`native`/`api`).
- Delete: no first-class graph fact delete route (`unsupported` direct).

## Cannot do directly (must not hallucinate)

- There is no `file_delete` tool.
- There is no `skill_delete` tool.
- There is no `agent_template_delete` API route.
- There is no first-class graph fact delete API route.
- Several CLI domains are stubbed and not operational for CRUD (see frontend/CLI surface doc).

Last verified: 2026-03-05
