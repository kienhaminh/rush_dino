# MCP Server Connections — Design Spec

**Date:** 2026-03-28
**Status:** Approved

---

## Summary

Add a global MCP Servers configuration section to the Config page. Users can connect external MCP servers via HTTP/SSE. The Rust backend manages connections, discovers tools automatically, and injects them into every agent session as "discovered" tools — no per-agent setup required.

---

## Scope

- Global configuration (not per-agent)
- HTTP/SSE transport only
- Optional auth header per server
- Full-stack: config UI + Rust `McpManager` + tool registration

---

## Data Model

New struct added to `AppConfigView`:

```rust
pub struct McpServerConfig {
    pub name: String,           // display name, e.g. "filesystem"
    pub url: String,            // SSE endpoint, e.g. "http://localhost:3100/sse"
    pub auth_header: Option<String>, // e.g. "Bearer sk-..."
}
```

`AppConfigView` gains:

```rust
pub mcp_servers: Vec<McpServerConfig>,
```

Persisted in the existing config file alongside other settings.

---

## Backend — McpManager

A new `McpManager` component in the Rust backend:

**Responsibilities:**
- On startup: connect to each configured MCP server via SSE
- On config reload: diff the server list, disconnect removed, connect added/changed
- For each connected server: call the MCP `tools/list` method and register results as discovered tools
- Track per-server status: `Connecting | Connected | Error(String)`
- Expose status via `GET /api/mcp/status` → `{ servers: [{ name, status, tool_count, last_seen }] }`

**Tool registration:**
- Discovered tools are injected into the existing tool system with `source = "mcp"` and `is_discovered = true`
- Agents receive them automatically — no agent-side changes needed
- Tools are prefixed with the server name to avoid collisions: `filesystem__read_file`

**Error handling:**
- Connection failures are logged and status set to `Error`; other servers are unaffected
- Automatic reconnect with backoff on SSE disconnect

---

## Frontend — Config Section

New file: `frontend/src/pages/config/config-section-mcp-servers.tsx`

Added as a new entry in `ConfigPage` `SECTIONS`:

```ts
{ key: 'mcp-servers', label: 'MCP Servers', description: 'External MCP servers connected via SSE. Tools are available to all agents automatically.' }
```

**UI behavior:**
- Expandable rows: collapsed shows status dot + name + tool count; expanded shows URL, auth header fields, save/delete, last-seen
- Status dots: green (Connected), yellow (Connecting), red (Error / unreachable)
- Inline add form at the bottom, shown when "+ Add Server" is clicked
- Fields: Name, SSE URL, Auth Header (optional)
- Save writes to config; backend reconnects automatically on reload
- Frontend polls `GET /api/mcp/status` every 5s to refresh status dots and tool counts

---

## API Surface

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/mcp/status` | List all configured servers with live status |

Config read/write uses the existing `GET /api/config` + `PATCH /api/config` endpoints — no new CRUD needed.

---

## Files to Create / Modify

**Create:**
- `crates/mcp/src/lib.rs` — `McpManager` implementation
- `crates/mcp/src/sse_client.rs` — SSE connection + tool discovery
- `frontend/src/pages/config/config-section-mcp-servers.tsx` — UI section

**Modify:**
- `crates/core/src/config.rs` — add `McpServerConfig` + `mcp_servers` field
- `crates/api/src/routes/` — add `GET /api/mcp/status` handler
- `src/main.rs` — initialize `McpManager` at startup
- `frontend/src/lib/types.ts` — add `McpServerConfig` type + extend `AppConfigView`
- `frontend/src/lib/api.ts` — add `fetchMcpStatus()` helper
- `frontend/src/pages/config/ConfigPage.tsx` — add MCP Servers section entry

---

## Non-Goals

- stdio transport (out of scope)
- Per-agent MCP server selection
- MCP server marketplace / discovery
- Tool approval / filtering per server (all discovered tools are enabled by default)
