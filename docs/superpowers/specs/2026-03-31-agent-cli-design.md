# Agent CLI Design

**Date:** 2026-03-31
**Status:** Approved

## Problem

Agents currently manage sessions, cron jobs, and workflows through individual registered tools (`sessions_spawn`, `create_job`, `create_workflow`, etc.). This creates tool sprawl — every new capability requires a new tool. The `rushdino` CLI already provides a human-facing management surface over the same HTTP API. Agents can reach it via `shell_exec`, making the CLI a natural unified interface for both humans and agents.

## Goal

Expand the `rushdino` CLI so agents can fully manage their operational lifecycle — sessions, cron jobs, and workflows — through `shell_exec` calls. Provide a SKILL.md that teaches agents the CLI vocabulary and when to use it.

## Out of scope (this phase)

- Agent create/update/delete (agent management requires governance rules, deferred)
- Memory commands (stays tool-side: `memory_read`, `memory_write`, `memory_search`)
- Skills commands (handled via system prompt injection, not CLI)

## Approach

Extend the existing `rushdino` binary following its established pattern:

- New subcommands wired into `main.rs`
- New command files in `crates/cli/src/commands/`
- Each command calls the existing HTTP API via `ApiClient`
- `--json` flag on all commands for machine-readable output
- Human-readable output by default (colored, emoji-prefixed) — consistent with existing commands

## Command Inventory

### Sessions (extend `crates/cli/src/commands/sessions.rs`)

| Command | API endpoint | Notes |
|---|---|---|
| `sessions spawn --agent <id> --prompt <text> [--json]` | `POST /api/runs` | Spawns an async run; returns run ID and session ID |
| `sessions history <id> [--limit N] [--json]` | `GET /api/sessions/:id/runs` | Lists runs for a session |

### Cron (new `crates/cli/src/commands/cron.rs`)

| Command | API endpoint | Notes |
|---|---|---|
| `cron list [--json]` | `GET /api/cron` | Lists all cron jobs |
| `cron get <id> [--json]` | `GET /api/cron/:id` | Job detail + recent runs |
| `cron create --schedule <expr> --prompt <text> [--agent <id>] [--json]` | `POST /api/cron` | Creates a scheduled job |
| `cron delete <id>` | `DELETE /api/cron/:id` | Deletes a job |
| `cron pause <id>` | `POST /api/cron/:id/pause` | Pauses a job |
| `cron resume <id>` | `POST /api/cron/:id/resume` | Resumes a paused job |
| `cron trigger <id> [--json]` | `POST /api/cron/:id/run` | Manually fires a job now |
| `cron runs <id> [--limit N] [--json]` | `GET /api/cron/:id/runs` | Lists run history for a job |

### Workflow (extend `crates/cli/src/commands/workflow.rs`)

| Command | API endpoint | Notes |
|---|---|---|
| `workflow create --name <n> --steps <json> [--json]` | `POST /api/workflows` | Creates a workflow definition |
| `workflow delete <id>` | `DELETE /api/workflows/:id` | Deletes a workflow |
| `workflow runs <id> [--limit N] [--json]` | `GET /api/workflows/:id/runs` | Lists runs for a workflow |
| `workflow run-status <run-id> [--json]` | `GET /api/workflow-runs/:run_id` | Gets status of a specific run |

### Agents (no change)

`rushdino agents list` and `rushdino agents get <id>` already exist and are sufficient for this phase.

## SKILL.md Design

Structure: hybrid — brief mental model paragraph, CLI-vs-tool decision table, compact command reference.

**Mental model paragraph:**
> You manage your operational lifecycle through the `rushdino` CLI via `shell_exec`. Always pass `--json` for machine-readable output. Use the CLI for sessions, cron scheduling, and workflows. Use tools for memory, files, and web access.

**CLI vs tool decision table:**

| Need | Use |
|---|---|
| Spawn a session with an agent | `rushdino sessions spawn` (CLI) |
| Check session run history | `rushdino sessions history` (CLI) |
| Schedule recurring work | `rushdino cron create` (CLI) |
| Trigger / pause / resume a job | `rushdino cron trigger/pause/resume` (CLI) |
| Define or run a workflow | `rushdino workflow create / run` (CLI) |
| Read or write memory | `memory_read` / `memory_write` tool |
| Search memory | `memory_search` tool |
| Read or edit files | `file_read` / `file_edit` tool |
| Web search or fetch | `web_search` / `web_fetch` tool |

**Command reference:** all commands above with required args and return shape.

## File Changes

| File | Change |
|---|---|
| `crates/cli/src/commands/sessions.rs` | Add `Spawn` and `History` variants to `SessionsAction` |
| `crates/cli/src/commands/cron.rs` | New file — full cron command implementation |
| `crates/cli/src/commands/workflow.rs` | Add `Create`, `Delete`, `Runs`, `RunStatus` variants |
| `crates/cli/src/commands/mod.rs` | Add `pub mod cron` |
| `crates/cli/src/main.rs` | Wire `Cron` variant into `Command` enum and match arm |
| `~/.rushdino/skills/agent-cli/SKILL.md` | New skill file (frontmatter + body) teaching CLI usage to agents; installed on first run or via `rushdino` setup |
