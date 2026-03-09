---
title: "Tool Catalog"
summary: "Canonical catalog of agent runtime tools registered in RushDino, with practical behavior and scope notes."
read_when:
  - You need to confirm what tools the agent can call
  - You need to map a tool response to source code
  - You need to distinguish native capabilities from fallbacks
---

# Tool Catalog

This list is sourced from tool registration in `crates/agent/src/engine_bootstrap.rs`.

## Registered tools (current)

| Tool | Primary purpose | Capability class |
|---|---|---|
| `web_search` | Search web via Brave API | `native` |
| `web_fetch` | Fetch URL content (HTML/text/JSON) | `native` |
| `file_read` | Read files under `~/.rushdino/documents` | `native` |
| `file_edit` | Exact text replacement edit in a file | `native` |
| `shell_exec` | Execute shell commands through the local system broker | `native` |
| `agents_list` | List available agent templates | `native` |
| `sessions_list` | List gateway sessions | `native` |
| `sessions_history` | Read conversation history by ID | `native` |
| `session_status` | Read conversation metadata by ID | `native` |
| `memory_search` | Search markdown memory corpus | `native` |
| `sessions_send` | Send message into existing conversation | `native` |
| `sessions_spawn` | Spawn async isolated conversation task | `native` |
| `memory_read` | Read memory file by name/path | `native` |
| `memory_write` | Write `MEMORY.md` or daily memory | `native` |
| `create_job` | Create background job record | `native` |
| `create_workflow` | Create persisted workflow definition | `native` |
| `spawn_sub_agent` | Spawn one-level orchestrator sub-agent task | `native` |
| `create_skill` | Create/update local skill TOML | `native` |
| `list_skills` | List local skills | `native` |
| `knowledge_graph_query` | Query local graph facts (only when graph enabled) | `native` |
| `delegate_to_agent` | Delegate task to specialist agent template | `native` |
| `spawn_agent` | Create a new custom agent template TOML | `native` |

## Conditional tool registration

- `knowledge_graph_query` is only registered if graph access is enabled in engine deps.
- All other tools above are always registered in current bootstrap path.

## Source map for tool definitions

- Registry trait and definitions: `crates/agent/src/tool_registry.rs`
- Tool wiring: `crates/agent/src/engine_bootstrap.rs`
- Implementations: `crates/agent/src/tools/*.rs`

## Important practical limits

- `file_read` is restricted to `~/.rushdino/documents` root.
- `file_edit` requires exact `oldText` match and exactly one occurrence.
- There is no first-class `file_delete` tool.
- `shell_exec` runs in a mirrored workspace under `~/.rushdino/workspaces/...`, not directly in the host workspace.
- Most destructive operations route through `shell_exec` and may require approval.

Last verified: 2026-03-06
