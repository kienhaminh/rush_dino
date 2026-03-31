---
name: agent-cli
description: Use the rushdino CLI via shell_exec to manage sessions, cron jobs, and workflows. Use this skill whenever you need to spawn sessions, schedule work, or inspect workflow runs.
---

You manage your operational lifecycle through the `rushdino` CLI via the `shell_exec` tool. Always pass `--json` for machine-readable output. Use the CLI for sessions, cron scheduling, and workflows. Use tools for memory, files, and web access.

## CLI vs Tool

| Need | How |
|---|---|
| Spawn a session with an agent | `rushdino sessions spawn --agent <id> --prompt <text> --json` |
| Check session run history | `rushdino sessions history <id> --json` |
| Schedule recurring work | `rushdino cron create --schedule <expr> --prompt <text> --json` |
| Pause / resume a cron job | `rushdino cron pause <id>` / `rushdino cron resume <id>` |
| Trigger a cron job now | `rushdino cron trigger <id> --json` |
| List cron jobs | `rushdino cron list --json` |
| Define a workflow | `rushdino workflow create --name <n> --steps <json> --json` |
| Run a workflow | `rushdino workflow run <id> --json` |
| Check a workflow run | `rushdino workflow run-status <run-id> --json` |
| List workflow runs | `rushdino workflow runs <id> --json` |
| List agents | `rushdino agents list --json` |
| Read / write / search memory | use `memory_read`, `memory_write`, `memory_search` tools |
| Read / edit files | use `file_read`, `file_edit` tools |
| Web search / fetch | use `web_search`, `web_fetch` tools |

## Command Reference

### Sessions

```
rushdino sessions list [--json]
rushdino sessions create --title <title> [--json]
rushdino sessions get <id> [--json]
rushdino sessions message <id> <text> [--json]
rushdino sessions spawn --agent <id> --prompt <text> [--json]
rushdino sessions history <id> [--limit N] [--json]
rushdino sessions archive <id>
rushdino sessions delete <id>
```

### Cron

```
rushdino cron list [--json]
rushdino cron get <id> [--json]
rushdino cron create --schedule <cron-expr> --prompt <text> [--agent <id>] [--json]
rushdino cron delete <id>
rushdino cron pause <id>
rushdino cron resume <id>
rushdino cron trigger <id> [--json]
rushdino cron runs <id> [--limit N] [--json]
```

Cron expression examples: `0 9 * * 1-5` (weekdays 9am), `*/30 * * * *` (every 30 min), `0 0 * * *` (midnight daily).

### Workflow

```
rushdino workflow list [--json]
rushdino workflow get <id> [--json]
rushdino workflow create --name <name> --steps <json-array> [--json]
rushdino workflow run <id> [--input <text>] [--json]
rushdino workflow runs <id> [--limit N] [--json]
rushdino workflow run-status <run-id> [--json]
rushdino workflow delete <id>
```

### Agents (read-only this phase)

```
rushdino agents list [--json]
rushdino agents get <id> [--json]
```
