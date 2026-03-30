# Agent CLI System — Design Spec

**Date:** 2026-03-31
**Status:** Approved

---

## Context

RushDino agents currently have no programmatic way to interact with system-level operations (sessions, workflows, kanban, approvals). The existing `rushdino sessions`, `rushdino agents`, `rushdino message` commands are all stubs that print "use the web UI." Agents that need to create sessions, trigger workflows, post tasks, or approve pending requests must either do it through the Tool trait (Rust-only) or call the REST API via `web_fetch` — neither is ergonomic or discoverable.

This spec defines:
1. A fully implemented CLI layer on the existing `rushdino` binary covering five system areas
2. A bundled RushDino skill (`rushdino-cli`) that agents activate to discover and use these commands

---

## Architecture

**Pattern:** All new commands follow the existing `health.rs` pattern — load `AppConfig`, create a `reqwest::Client`, call `http://localhost:{port}/api/...`, format the response.

**Shared client:** A new `crates/cli/src/api_client.rs` module wraps `reqwest::Client` with the base URL from `AppConfig`. It exposes typed `get`, `post`, `patch`, `delete` helpers and a uniform error handler that maps HTTP error bodies to `AppError`.

**Output modes:** Every system management command accepts a `--json` flag. Without it, output is human-readable colored text. With `--json`, raw JSON is printed to stdout and the command exits 0 on success, non-zero on failure. Agents always use `--json`.

**Configure (non-interactive mode):** When any credential flag is passed to `rushdino configure`, the command skips interactive prompts, writes directly to `~/.rushdino/credentials.toml`, and prints a one-line confirmation.

---

## Commands

### Sessions
File: `crates/cli/src/commands/sessions.rs` (rewrite existing stub)

```
rushdino sessions list [--json]
rushdino sessions create --title <title> [--json]
rushdino sessions get <id> [--json]
rushdino sessions message <id> <message> [--json]
rushdino sessions archive <id>
rushdino sessions delete <id>
```

API mapping:
- `list`    → `GET  /api/sessions`
- `create`  → `POST /api/sessions`  `{ "title": "..." }`
- `get`     → `GET  /api/sessions/:id`
- `message` → `POST /api/sessions/:id/message`  `{ "message": "..." }`
- `archive` → `POST /api/sessions/:id/archive`
- `delete`  → `DELETE /api/sessions/:id`

### Agents
File: `crates/cli/src/commands/agents.rs` (rewrite existing stub)

```
rushdino agents list [--json]
rushdino agents get <id> [--json]
```

API mapping:
- `list` → `GET /api/agents`
- `get`  → `GET /api/agents/:id`

### Workflow
File: `crates/cli/src/commands/workflow.rs` (new)

```
rushdino workflow list [--json]
rushdino workflow get <id> [--json]
rushdino workflow run <id> [--input <text>] [--json]
```

API mapping:
- `list` → `GET  /api/workflows`
- `get`  → `GET  /api/workflows/:id`
- `run`  → `POST /api/workflows/:id/runs`  `{ "input": "...", "triggered_by": "cli" }`

### Kanban
File: `crates/cli/src/commands/kanban.rs` (new)

```
rushdino kanban board [--json]
rushdino kanban list [--status <status>] [--agent <name>] [--json]
rushdino kanban get <id> [--json]
```

API mapping:
- `board` → `GET /api/kanban/board`
- `list`  → `GET /api/kanban/tasks?status=...&agent=...`
- `get`   → `GET /api/kanban/tasks/:id`

### Approvals
File: `crates/cli/src/commands/approval.rs` (new)

```
rushdino approvals list [--json]
rushdino approvals approve <request-id> --session <session-id>
rushdino approvals deny <request-id> --session <session-id>
```

API mapping:
- `list`    → `GET  /api/approvals`
- `approve` → `POST /api/approval/:id`  `{ "approved": true,  "session_id": "..." }`
- `deny`    → `POST /api/approval/:id`  `{ "approved": false, "session_id": "..." }`

### Configure (extended)
File: `crates/cli/src/commands/configure.rs` (extend existing)

New non-interactive flags (can be combined, sets credentials directly without prompts):
```
rushdino configure --openai-key <key>
rushdino configure --anthropic-key <key>
rushdino configure --brave-api-key <key>
rushdino configure --gemini-key <key>
rushdino configure --telegram-token <token>
rushdino configure --discord-token <token>
```

When any of these flags are present, skip interactive mode, write to `~/.rushdino/credentials.toml`, print `✔ Credentials saved.` No restart message needed — credentials are read per-request.

---

## Skill File

**Source:** `crates/common/src/skills/rushdino-cli/SKILL.md`
**Distributed:** downloaded to `~/.rushdino/skills/rushdino-cli/SKILL.md` via `asset_sync`
**Registration:** add `"rushdino-cli/SKILL.md"` to `SKILL_PATHS` in `crates/common/src/skills.rs`

The skill is a reference card. Agents invoke it when they need to manage sessions, trigger workflows, check tasks, or handle approvals. The description field is crafted for accurate triggering by the skill graph.

Skill frontmatter:
```yaml
name: rushdino-cli
description: Use the rushdino CLI to manage RushDino system operations. Covers session management, sending messages to agents, triggering workflows, viewing the kanban board, posting or updating tasks, and approving pending requests. Use when you need to interact with the RushDino system programmatically rather than through tool calls.
```

Content structure:
- **How to invoke:** use the `bash` tool; add `--json` for machine-readable output
- **Sessions** — table: command → purpose → example
- **Agents** — table
- **Workflows** — table
- **Kanban** — table
- **Approvals** — table
- **Configure** — table of credential flags
- **Error handling:** non-zero exit = failure; error message on stderr

---

## Files to Create / Modify

| File | Action |
|------|--------|
| `crates/cli/src/api_client.rs` | Create — shared HTTP client helper |
| `crates/cli/src/commands/sessions.rs` | Rewrite stub → full subcommand group |
| `crates/cli/src/commands/agents.rs` | Rewrite stub → full subcommand group |
| `crates/cli/src/commands/workflow.rs` | Create — new command |
| `crates/cli/src/commands/kanban.rs` | Create — new command |
| `crates/cli/src/commands/approval.rs` | Create — new command |
| `crates/cli/src/commands/configure.rs` | Extend — add non-interactive flags |
| `crates/cli/src/commands/mod.rs` | Add new command modules |
| `crates/cli/src/main.rs` | Add `Workflow`, `Kanban`, `Approvals` variants + routing |
| `crates/common/src/skills/rushdino-cli/SKILL.md` | Create — bundled skill |
| `crates/common/src/skills.rs` | Add `"rushdino-cli/SKILL.md"` to `SKILL_PATHS` |

---

## Verification

1. `cargo build -p rushdino-cli` compiles cleanly
2. With the server running: `rushdino sessions list --json` returns valid JSON
3. `rushdino sessions create --title "Test" --json` creates a session and returns its ID
4. `rushdino workflow list --json` returns the workflows array
5. `rushdino kanban board` prints a human-readable board view
6. `rushdino approvals list --json` returns `{ "pending": [...], "recent": [...] }`
7. `rushdino configure --brave-api-key test123` writes to `~/.rushdino/credentials.toml` without interactive prompts
8. Skill is loadable: after `rushdino init`, `~/.rushdino/skills/rushdino-cli/SKILL.md` exists and parses correctly
9. With server stopped: commands print a clear "server not running" error and exit non-zero
