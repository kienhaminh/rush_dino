---
name: rushdino-cli
description: Use the rushdino CLI to manage RushDino system operations. Covers session management, sending messages to agents, triggering workflows, viewing the kanban board, posting or updating tasks, and approving pending requests. Use when you need to interact with the RushDino system programmatically rather than through tool calls.
category: system
tags: rushdino, cli, sessions, workflows, kanban, approvals
---

# rushdino CLI Reference

Use the `bash` tool to invoke these commands. Add `--json` for machine-readable output — always use `--json` in automated or agentic contexts.

If the server is not running, commands exit non-zero with a clear error on stderr.

---

## Sessions

| Command | Purpose | Example |
|---------|---------|---------|
| `rushdino sessions list [--json]` | List all sessions | `rushdino sessions list --json` |
| `rushdino sessions create --title <title> [--json]` | Create a new session | `rushdino sessions create --title "Research task" --json` |
| `rushdino sessions get <id> [--json]` | Get session details | `rushdino sessions get abc123 --json` |
| `rushdino sessions message <id> <message> [--json]` | Send a message to a session | `rushdino sessions message abc123 "Start analysis" --json` |
| `rushdino sessions archive <id>` | Archive a session | `rushdino sessions archive abc123` |
| `rushdino sessions delete <id>` | Delete a session | `rushdino sessions delete abc123` |

---

## Agents

| Command | Purpose | Example |
|---------|---------|---------|
| `rushdino agents list [--json]` | List all available agents | `rushdino agents list --json` |
| `rushdino agents get <id> [--json]` | Get details for a specific agent | `rushdino agents get agent-id --json` |

---

## Workflows

| Command | Purpose | Example |
|---------|---------|---------|
| `rushdino workflow list [--json]` | List all workflows | `rushdino workflow list --json` |
| `rushdino workflow get <id> [--json]` | Get workflow details | `rushdino workflow get wf-id --json` |
| `rushdino workflow run <id> [--input <text>] [--json]` | Trigger a workflow run | `rushdino workflow run wf-id --input "process this" --json` |

---

## Kanban

| Command | Purpose | Example |
|---------|---------|---------|
| `rushdino kanban board [--json]` | View the full kanban board | `rushdino kanban board --json` |
| `rushdino kanban list [--status <status>] [--agent <name>] [--json]` | List tasks with optional filters | `rushdino kanban list --status todo --json` |
| `rushdino kanban get <id> [--json]` | Get details for a specific task | `rushdino kanban get task-id --json` |

---

## Approvals

| Command | Purpose | Example |
|---------|---------|---------|
| `rushdino approvals list [--json]` | List pending approval requests | `rushdino approvals list --json` |
| `rushdino approvals approve <request-id> --session <session-id>` | Approve a request | `rushdino approvals approve req-id --session sess-id` |
| `rushdino approvals deny <request-id> --session <session-id>` | Deny a request | `rushdino approvals deny req-id --session sess-id` |

---

## Configure (credential flags)

Set API keys and tokens non-interactively. Multiple flags can be combined in one command.

| Flag | Credential set |
|------|----------------|
| `--openai-key <key>` | OpenAI API key |
| `--anthropic-key <key>` | Anthropic API key |
| `--brave-api-key <key>` | Brave Search API key |
| `--gemini-key <key>` | Google Gemini API key |
| `--telegram-token <token>` | Telegram bot token |
| `--discord-token <token>` | Discord bot token |

Example:
```bash
rushdino configure --openai-key sk-... --anthropic-key ant-...
```
Output: `✔ Credentials saved.`

---

## Error handling

- Non-zero exit code = failure
- Error message is printed to **stderr**
- Use `--json` for structured output; check exit code to detect failures in scripts
