# MCP Server Connections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to connect external MCP servers via HTTP/SSE in the Config page; tools are discovered automatically and injected into all agent sessions.

**Architecture:** `McpServerConfig` is added to `AppConfig`. A `McpManager` in the server crate connects to each configured server via SSE on startup and on config reload, discovers tools via JSON-RPC, and registers them into the agent's `ToolRegistry`. A `GET /api/mcp/status` endpoint lets the frontend poll live status. The frontend gets a new "MCP Servers" section in the Config page.

**Tech Stack:** Rust/Tokio (reqwest with `stream` feature, futures `StreamExt`), Axum, React/TypeScript

---

## File Map

**Create:**
- `crates/server/src/mcp_manager.rs` — `McpManager`, `SseReader`, `McpTool`, MCP protocol helpers
- `crates/server/src/routes/mcp.rs` — `GET /api/mcp/status` handler
- `frontend/src/pages/config/config-section-mcp-servers.tsx` — UI section

**Modify:**
- `crates/common/src/config.rs` — add `McpServerConfig` struct + `mcp_servers` field to `AppConfig`
- `crates/common/src/lib.rs` — re-export `McpServerConfig`
- `crates/server/src/routes/mod.rs` — add `pub mod mcp`
- `crates/server/src/state.rs` — add `mcp_manager: Arc<McpManager>` to `AppState`
- `crates/server/src/lib.rs` — initialize `McpManager`, wire into `AppState`, add route
- `crates/server/src/provider_runtime.rs` — accept optional `McpManager`, register tools after engine build
- `crates/server/src/routes/config.rs` — call `mcp_manager.reconcile()` when `mcp_servers` changes
- `frontend/src/lib/types.ts` — add `McpServerConfig` type, extend `AppConfigView`
- `frontend/src/lib/api.ts` — add `fetchMcpStatus()` helper
- `frontend/src/pages/config/ConfigPage.tsx` — add MCP Servers section

---

### Task 1: Add McpServerConfig to AppConfig

**Files:**
- Modify: `crates/common/src/config.rs`
- Modify: `crates/common/src/lib.rs`

- [ ] **Step 1: Add the McpServerConfig struct and mcp_servers field**

In `crates/common/src/config.rs`, add after the `AgentSection` struct (around line 219):

```rust
/// Configuration for a single external MCP server (HTTP/SSE transport).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct McpServerConfig {
    /// Display name for this server (e.g. "filesystem").
    pub name: String,
    /// SSE endpoint URL (e.g. "http://localhost:3100/sse").
    pub url: String,
    /// Optional Authorization header value (e.g. "Bearer sk-...").
    pub auth_header: Option<String>,
}
```

Then in `AppConfig` struct (around line 303), add after `agent: AgentSection`:

```rust
    /// External MCP servers connected via HTTP/SSE.
    /// Tools discovered from these servers are available to all agents automatically.
    #[serde(default)]
    pub mcp_servers: Vec<McpServerConfig>,
```

And in `AppConfig::default()` (around line 336), add:

```rust
            mcp_servers: Vec::new(),
```

- [ ] **Step 2: Re-export McpServerConfig from common lib**

In `crates/common/src/lib.rs`, find the existing `pub use config::` line and add `McpServerConfig`:

```rust
pub use config::{AppConfig, CredentialsConfig, McpServerConfig};
```

(Match the existing re-export pattern in that file.)

- [ ] **Step 3: Verify the config still deserializes with the new field**

```bash
cd /Users/kien.ha/Code/RushDino
cargo test -p rushdino-common 2>&1 | tail -20
```

Expected: all tests pass (new field has `#[serde(default)]` so old configs still parse).

- [ ] **Step 4: Commit**

```bash
git add crates/common/src/config.rs crates/common/src/lib.rs
git commit -m "feat(config): add McpServerConfig and mcp_servers to AppConfig"
```

---

### Task 2: Implement McpManager with SSE client and MCP protocol

**Files:**
- Create: `crates/server/src/mcp_manager.rs`

This file contains:
- `SseReader` — parses SSE events from a reqwest byte stream
- `McpDiscoveredTool` — tool metadata returned from `tools/list`
- `McpTool` — implements the agent `Tool` trait, calls `tools/call` over a fresh SSE connection
- `McpManager` — manages all configured server connections and status

- [ ] **Step 1: Create the full mcp_manager.rs file**

Create `crates/server/src/mcp_manager.rs`:

```rust
//! MCP (Model Context Protocol) server manager.
//!
//! Connects to external MCP servers via HTTP/SSE, discovers tools, and
//! registers them into the agent ToolRegistry as "discovered" tools.

use std::{
    collections::HashMap,
    sync::{Arc, RwLock},
    time::Instant,
};

use async_trait::async_trait;
use futures::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tracing::{info, warn};

use rushdino_agent::tool_registry::{Tool, ToolRegistry};
use rushdino_common::{McpServerConfig, Result as AppResult};

// ---------------------------------------------------------------------------
// Status types (returned by GET /api/mcp/status)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case", tag = "kind")]
pub enum McpConnectionStatus {
    Connecting,
    Connected,
    Error { message: String },
}

#[derive(Debug, Clone, Serialize)]
pub struct McpServerStatus {
    pub name: String,
    pub status: McpConnectionStatus,
    pub tool_count: usize,
    pub last_seen_secs: Option<u64>,
}

// ---------------------------------------------------------------------------
// Internal state per server
// ---------------------------------------------------------------------------

struct McpServerState {
    config: McpServerConfig,
    status: McpConnectionStatus,
    tools: Vec<McpDiscoveredTool>,
    last_seen_at: Option<Instant>,
}

#[derive(Debug, Clone)]
struct McpDiscoveredTool {
    name: String,
    description: String,
    parameters: Value,
}

// ---------------------------------------------------------------------------
// McpManager
// ---------------------------------------------------------------------------

pub struct McpManager {
    state: Arc<RwLock<HashMap<String, McpServerState>>>,
    http: reqwest::Client,
}

impl McpManager {
    pub fn new() -> Arc<Self> {
        Arc::new(Self {
            state: Arc::new(RwLock::new(HashMap::new())),
            http: reqwest::Client::new(),
        })
    }

    /// Replace the full server list and reconnect to changed/new servers.
    pub async fn reconcile(&self, servers: &[McpServerConfig]) {
        // Remove servers that are no longer configured.
        {
            let mut state = self.state.write().expect("mcp state lock");
            state.retain(|name, _| servers.iter().any(|s| &s.name == name));
        }

        // Connect (or reconnect) each configured server.
        for server in servers {
            self.connect_server(server).await;
        }
    }

    /// Register all currently discovered tools into the given ToolRegistry.
    pub fn register_into(&self, registry: &ToolRegistry) {
        let state = self.state.read().expect("mcp state lock");
        for server_state in state.values() {
            for tool in &server_state.tools {
                let full_name = format!("{}__{}", server_state.config.name, tool.name);
                registry.register(McpTool {
                    full_name,
                    tool_name: tool.name.clone(),
                    description: tool.description.clone(),
                    parameters: tool.parameters.clone(),
                    base_url: server_state.config.url.clone(),
                    auth_header: server_state.config.auth_header.clone(),
                    http: self.http.clone(),
                });
            }
        }
    }

    /// Return current status for all configured servers.
    pub fn status_snapshot(&self) -> Vec<McpServerStatus> {
        let state = self.state.read().expect("mcp state lock");
        state
            .values()
            .map(|s| McpServerStatus {
                name: s.config.name.clone(),
                status: s.status.clone(),
                tool_count: s.tools.len(),
                last_seen_secs: s.last_seen_at.map(|t| t.elapsed().as_secs()),
            })
            .collect()
    }

    async fn connect_server(&self, config: &McpServerConfig) {
        // Mark as connecting
        {
            let mut state = self.state.write().expect("mcp state lock");
            state.insert(
                config.name.clone(),
                McpServerState {
                    config: config.clone(),
                    status: McpConnectionStatus::Connecting,
                    tools: vec![],
                    last_seen_at: None,
                },
            );
        }

        match discover_tools(&self.http, config).await {
            Ok(tools) => {
                info!(
                    server = %config.name,
                    count = tools.len(),
                    "MCP: discovered tools"
                );
                let mut state = self.state.write().expect("mcp state lock");
                if let Some(entry) = state.get_mut(&config.name) {
                    entry.status = McpConnectionStatus::Connected;
                    entry.tools = tools;
                    entry.last_seen_at = Some(Instant::now());
                }
            }
            Err(err) => {
                warn!(server = %config.name, error = %err, "MCP: connection failed");
                let mut state = self.state.write().expect("mcp state lock");
                if let Some(entry) = state.get_mut(&config.name) {
                    entry.status = McpConnectionStatus::Error {
                        message: err.to_string(),
                    };
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// SSE reader
// ---------------------------------------------------------------------------

struct SseReader {
    stream: Box<dyn futures::Stream<Item = Result<bytes::Bytes, reqwest::Error>> + Unpin + Send>,
    buffer: String,
}

impl SseReader {
    fn new(
        stream: impl futures::Stream<Item = Result<bytes::Bytes, reqwest::Error>>
            + Unpin
            + Send
            + 'static,
    ) -> Self {
        Self {
            stream: Box::new(stream),
            buffer: String::new(),
        }
    }

    /// Read the next complete SSE event. Returns `(event_type, data)` or `None` on EOF.
    async fn next_event(&mut self) -> anyhow::Result<Option<(String, String)>> {
        loop {
            // Try to parse a complete event from the buffer (terminated by blank line).
            if let Some(pos) = self.buffer.find("\n\n") {
                let raw = self.buffer[..pos].to_owned();
                self.buffer = self.buffer[pos + 2..].to_owned();

                let mut event_type = "message".to_owned();
                let mut data = String::new();

                for line in raw.lines() {
                    if let Some(v) = line.strip_prefix("event: ") {
                        event_type = v.to_owned();
                    } else if let Some(v) = line.strip_prefix("data: ") {
                        data = v.to_owned();
                    }
                }

                if !data.is_empty() {
                    return Ok(Some((event_type, data)));
                }
                continue;
            }

            match self.stream.next().await {
                Some(Ok(bytes)) => {
                    self.buffer.push_str(&String::from_utf8_lossy(&bytes));
                }
                Some(Err(e)) => return Err(anyhow::anyhow!("SSE stream error: {e}")),
                None => return Ok(None),
            }
        }
    }

    /// Wait for the next event with the given JSON-RPC `id` field.
    async fn wait_for_id(&mut self, id: u64) -> anyhow::Result<Value> {
        loop {
            match self.next_event().await? {
                Some((_type, data)) => {
                    if let Ok(v) = serde_json::from_str::<Value>(&data) {
                        if v.get("id").and_then(Value::as_u64) == Some(id) {
                            return Ok(v);
                        }
                    }
                }
                None => return Err(anyhow::anyhow!("SSE stream closed before id={id}")),
            }
        }
    }
}

// ---------------------------------------------------------------------------
// MCP protocol helpers
// ---------------------------------------------------------------------------

/// Build the message endpoint URL from the SSE base URL and the path returned
/// in the `endpoint` SSE event (e.g., `/message?sessionId=abc`).
fn resolve_message_endpoint(sse_url: &str, path: &str) -> String {
    if path.starts_with("http") {
        return path.to_owned();
    }
    // Extract scheme://host[:port] from the SSE URL.
    let base = if let Some(idx) = sse_url.find("://") {
        let after = &sse_url[idx + 3..];
        let host_end = after.find('/').unwrap_or(after.len());
        &sse_url[..idx + 3 + host_end]
    } else {
        sse_url
    };
    format!("{base}{path}")
}

/// POST a JSON-RPC request to the MCP message endpoint.
async fn post_jsonrpc(
    client: &reqwest::Client,
    endpoint: &str,
    auth_header: Option<&str>,
    id: u64,
    method: &str,
    params: Value,
) -> anyhow::Result<()> {
    let body = json!({
        "jsonrpc": "2.0",
        "id": id,
        "method": method,
        "params": params,
    });
    let mut req = client.post(endpoint).json(&body);
    if let Some(auth) = auth_header {
        req = req.header("Authorization", auth);
    }
    let resp = req.send().await?;
    if !resp.status().is_success() {
        return Err(anyhow::anyhow!(
            "MCP POST {method} failed: HTTP {}",
            resp.status()
        ));
    }
    Ok(())
}

/// Connect to an MCP server, discover its tool list, and return the tools.
async fn discover_tools(
    client: &reqwest::Client,
    config: &McpServerConfig,
) -> anyhow::Result<Vec<McpDiscoveredTool>> {
    // 1. Open SSE stream.
    let mut req = client
        .get(&config.url)
        .header("Accept", "text/event-stream")
        .header("Cache-Control", "no-cache");
    if let Some(auth) = &config.auth_header {
        req = req.header("Authorization", auth);
    }
    let response = req.send().await.map_err(|e| anyhow::anyhow!("SSE connect: {e}"))?;
    if !response.status().is_success() {
        return Err(anyhow::anyhow!(
            "SSE connect failed: HTTP {}",
            response.status()
        ));
    }
    let mut reader = SseReader::new(response.bytes_stream());

    // 2. Wait for the `endpoint` event to get the message POST URL.
    let endpoint_url = loop {
        match reader.next_event().await? {
            Some((event_type, data)) if event_type == "endpoint" => {
                break resolve_message_endpoint(&config.url, &data);
            }
            Some(_) => continue,
            None => return Err(anyhow::anyhow!("SSE closed before endpoint event")),
        }
    };

    let auth = config.auth_header.as_deref();

    // 3. Send `initialize`.
    post_jsonrpc(
        client,
        &endpoint_url,
        auth,
        1,
        "initialize",
        json!({
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": { "name": "rushdino", "version": "0.1" }
        }),
    )
    .await?;
    reader.wait_for_id(1).await?;

    // 4. Send `tools/list`.
    post_jsonrpc(client, &endpoint_url, auth, 2, "tools/list", json!({})).await?;
    let tools_resp = reader.wait_for_id(2).await?;

    // 5. Parse tools from response.
    parse_tools_response(tools_resp)
}

#[derive(Deserialize)]
struct ToolsListResult {
    tools: Vec<McpToolDef>,
}

#[derive(Deserialize)]
struct McpToolDef {
    name: String,
    #[serde(default)]
    description: String,
    #[serde(rename = "inputSchema", default)]
    input_schema: Value,
}

fn parse_tools_response(resp: Value) -> anyhow::Result<Vec<McpDiscoveredTool>> {
    let result: ToolsListResult = serde_json::from_value(
        resp.get("result")
            .cloned()
            .ok_or_else(|| anyhow::anyhow!("tools/list response missing 'result'"))?,
    )
    .map_err(|e| anyhow::anyhow!("tools/list parse error: {e}"))?;

    Ok(result
        .tools
        .into_iter()
        .map(|t| McpDiscoveredTool {
            name: t.name,
            description: t.description,
            parameters: t.input_schema,
        })
        .collect())
}

/// Call a single MCP tool over a fresh SSE session. Returns the tool output as a string.
async fn call_mcp_tool(
    client: &reqwest::Client,
    base_url: &str,
    auth_header: Option<&str>,
    tool_name: &str,
    arguments: Value,
) -> anyhow::Result<String> {
    // Open a fresh SSE connection for this tool call.
    let mut req = client
        .get(base_url)
        .header("Accept", "text/event-stream")
        .header("Cache-Control", "no-cache");
    if let Some(auth) = auth_header {
        req = req.header("Authorization", auth);
    }
    let response = req.send().await.map_err(|e| anyhow::anyhow!("SSE connect: {e}"))?;
    let mut reader = SseReader::new(response.bytes_stream());

    let endpoint_url = loop {
        match reader.next_event().await? {
            Some((event_type, data)) if event_type == "endpoint" => {
                break resolve_message_endpoint(base_url, &data);
            }
            Some(_) => continue,
            None => return Err(anyhow::anyhow!("SSE closed before endpoint event")),
        }
    };

    // Initialize.
    post_jsonrpc(
        client,
        &endpoint_url,
        auth_header,
        1,
        "initialize",
        json!({
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": { "name": "rushdino", "version": "0.1" }
        }),
    )
    .await?;
    reader.wait_for_id(1).await?;

    // Call tool.
    post_jsonrpc(
        client,
        &endpoint_url,
        auth_header,
        2,
        "tools/call",
        json!({ "name": tool_name, "arguments": arguments }),
    )
    .await?;
    let resp = reader.wait_for_id(2).await?;

    extract_tool_output(resp)
}

fn extract_tool_output(resp: Value) -> anyhow::Result<String> {
    // MCP tools/call result: { "result": { "content": [{ "type": "text", "text": "..." }] } }
    let content = resp
        .get("result")
        .and_then(|r| r.get("content"))
        .and_then(Value::as_array)
        .ok_or_else(|| anyhow::anyhow!("tools/call response missing content array"))?;

    let output: String = content
        .iter()
        .filter_map(|item| {
            if item.get("type").and_then(Value::as_str) == Some("text") {
                item.get("text").and_then(Value::as_str).map(str::to_owned)
            } else {
                None
            }
        })
        .collect::<Vec<_>>()
        .join("\n");

    Ok(output)
}

// ---------------------------------------------------------------------------
// McpTool — implements the agent Tool trait
// ---------------------------------------------------------------------------

struct McpTool {
    /// Prefixed name used in ToolRegistry: "{server_name}__{tool_name}".
    full_name: String,
    /// Raw tool name as the MCP server knows it.
    tool_name: String,
    description: String,
    parameters: Value,
    /// Base SSE URL of the MCP server.
    base_url: String,
    auth_header: Option<String>,
    http: reqwest::Client,
}

#[async_trait]
impl Tool for McpTool {
    fn name(&self) -> &str {
        &self.full_name
    }

    fn description(&self) -> &str {
        &self.description
    }

    fn parameters(&self) -> Value {
        self.parameters.clone()
    }

    async fn execute(&self, args: Value) -> AppResult<String> {
        call_mcp_tool(
            &self.http,
            &self.base_url,
            self.auth_header.as_deref(),
            &self.tool_name,
            args,
        )
        .await
        .map_err(|e| rushdino_common::AppError::Tool(e.to_string()))
    }
}
```

- [ ] **Step 2: Add `mcp_manager` module to server lib.rs**

In `crates/server/src/lib.rs`, add at the top with the other module declarations:

```rust
mod mcp_manager;
```

- [ ] **Step 3: Compile to check for errors**

```bash
cd /Users/kien.ha/Code/RushDino
cargo build -p rushdino-server 2>&1 | head -40
```

Fix any compilation errors before proceeding. Common issues:
- `anyhow` not in scope — add `anyhow.workspace = true` to `crates/server/Cargo.toml` if missing (check: `grep anyhow crates/server/Cargo.toml`)
- `bytes` not available — reqwest re-exports it; use `reqwest::Response::bytes_stream()` which returns `impl Stream<Item = Result<Bytes, Error>>`

If `anyhow` is not in server's Cargo.toml:
```toml
anyhow.workspace = true
```

- [ ] **Step 4: Commit**

```bash
git add crates/server/src/mcp_manager.rs crates/server/src/lib.rs crates/server/Cargo.toml
git commit -m "feat(mcp): add McpManager with SSE client and MCP protocol implementation"
```

---

### Task 3: Add GET /api/mcp/status route

**Files:**
- Create: `crates/server/src/routes/mcp.rs`
- Modify: `crates/server/src/routes/mod.rs`

- [ ] **Step 1: Create the route handler**

Create `crates/server/src/routes/mcp.rs`:

```rust
//! MCP server status routes.
//!
//! GET /api/mcp/status — return live connection status for all configured MCP servers.

use axum::{extract::State, Json};
use serde_json::Value;

use rushdino_common::AppError;

use crate::state::AppState;

/// GET /api/mcp/status
pub async fn get_mcp_status(State(state): State<AppState>) -> Result<Json<Value>, AppError> {
    let statuses = state.mcp_manager.status_snapshot();
    Ok(Json(serde_json::to_value(statuses).unwrap_or_default()))
}
```

- [ ] **Step 2: Register the module**

In `crates/server/src/routes/mod.rs`, add:

```rust
pub mod mcp;
```

- [ ] **Step 3: Compile check**

```bash
cargo build -p rushdino-server 2>&1 | head -20
```

Expected: no new errors (the `mcp_manager` field on `AppState` doesn't exist yet — that's fine, the route file just won't compile until Task 5 wires AppState).

- [ ] **Step 4: Commit**

```bash
git add crates/server/src/routes/mcp.rs crates/server/src/routes/mod.rs
git commit -m "feat(mcp): add GET /api/mcp/status route"
```

---

### Task 4: Wire McpManager into AppState

**Files:**
- Modify: `crates/server/src/state.rs`

- [ ] **Step 1: Add mcp_manager field to AppState**

In `crates/server/src/state.rs`, add the import at the top:

```rust
use crate::mcp_manager::McpManager;
```

In the `AppState` struct (around line 130), add after `skill_graph`:

```rust
    /// MCP server manager — manages connections and discovered tools.
    pub mcp_manager: Arc<McpManager>,
```

In `AppState::new()`, add `mcp_manager: Arc<McpManager>` as the last parameter:

```rust
    pub fn new(
        // ... existing params ...
        skill_graph: Arc<rushdino_skill_graph::SkillGraphService>,
        mcp_manager: Arc<McpManager>,
    ) -> Self {
        Self {
            // ... existing fields ...
            skill_graph,
            mcp_manager,
        }
    }
```

- [ ] **Step 2: Compile check**

```bash
cargo build -p rushdino-server 2>&1 | grep "error" | head -20
```

Expected: errors in `lib.rs` where `AppState::new` is called (missing argument). Fix in Task 5.

- [ ] **Step 3: Commit**

```bash
git add crates/server/src/state.rs
git commit -m "feat(mcp): add mcp_manager field to AppState"
```

---

### Task 5: Initialize McpManager in server startup

**Files:**
- Modify: `crates/server/src/lib.rs`

- [ ] **Step 1: Add McpManager initialization and route**

In `crates/server/src/lib.rs`, after the `use crate::...` block, add:

```rust
use crate::mcp_manager::McpManager;
```

In `build_app()`, after the skill_graph initialization block (around line 318-322), add:

```rust
    // MCP: initialize manager and connect to configured servers.
    let mcp_manager = McpManager::new();
    {
        let mcp = mcp_manager.clone();
        let servers = config.mcp_servers.clone();
        tokio::spawn(async move {
            mcp.reconcile(&servers).await;
        });
    }
```

In the `AppState::new()` call, add `mcp_manager.clone()` as the last argument.

Add the route in the `Router::new()` chain, after the `/api/graph/...` routes:

```rust
        .route("/api/mcp/status", get(routes::mcp::get_mcp_status))
```

- [ ] **Step 2: Compile and test**

```bash
cargo build -p rushdino-server 2>&1 | tail -20
```

Expected: clean build.

- [ ] **Step 3: Commit**

```bash
git add crates/server/src/lib.rs
git commit -m "feat(mcp): initialize McpManager at startup, add /api/mcp/status route"
```

---

### Task 6: Register MCP tools into engine after rebuild

**Files:**
- Modify: `crates/server/src/provider_runtime.rs`

When the AgentEngine is rebuilt (provider change), MCP tools need to be re-registered into the new ToolRegistry.

- [ ] **Step 1: Pass McpManager into refresh_runtime_from_disk**

In `crates/server/src/provider_runtime.rs`, add import:

```rust
use crate::mcp_manager::McpManager;
```

Change the signature of `refresh_runtime_from_disk`:

```rust
pub async fn refresh_runtime_from_disk(
    runtime: &RuntimeState,
    mcp_manager: Option<Arc<McpManager>>,
) -> Result<()> {
```

Inside the function, after `engine_inner` is built and before `runtime.store_engine(engine)` (find the line that stores the engine, around line 139+), add:

```rust
            // Register MCP-discovered tools into the new engine's ToolRegistry.
            if let Some(mcp) = &mcp_manager {
                mcp.register_into(&engine_inner.tool_registry);
            }
```

- [ ] **Step 2: Fix all call sites of refresh_runtime_from_disk**

The function is called in two places:
1. `crates/server/src/lib.rs` — the initial tokio::spawn call:
   ```rust
   if let Err(err) = refresh_runtime_from_disk(runtime_state_bg.as_ref(), Some(mcp_manager_bg)).await {
   ```
   Add `let mcp_manager_bg = mcp_manager.clone();` before the spawn.

2. `crates/server/src/routes/config.rs` — in `refresh_engine_provider`:
   ```rust
   // Find pub async fn refresh_engine_provider and update it to pass mcp_manager
   ```

   In `crates/server/src/routes/config.rs`, `refresh_engine_provider` uses `state` which has `state.mcp_manager`. Update the call:
   ```rust
   refresh_runtime_from_disk(state.runtime.as_ref(), Some(state.mcp_manager.clone())).await
   ```

- [ ] **Step 3: Compile check**

```bash
cargo build -p rushdino-server 2>&1 | tail -20
```

Expected: clean build.

- [ ] **Step 4: Commit**

```bash
git add crates/server/src/provider_runtime.rs crates/server/src/lib.rs crates/server/src/routes/config.rs
git commit -m "feat(mcp): re-register MCP tools into engine after provider reload"
```

---

### Task 7: Trigger McpManager reconcile on config save

**Files:**
- Modify: `crates/server/src/routes/config.rs`

When the user saves config with changed `mcp_servers`, the McpManager should reconnect.

- [ ] **Step 1: Add mcp_servers change detection and reconcile call**

In `crates/server/src/routes/config.rs`, add a helper function after the existing `gateway_runtime_reload_required_from_config`:

```rust
fn mcp_reload_required(current: &AppConfig, updated: &AppConfig) -> bool {
    current.mcp_servers != updated.mcp_servers
}
```

In `patch_config`, after the existing `if gateway_runtime_reload_required_from_config` block:

```rust
    if mcp_reload_required(&current, &updated) {
        let mcp = state.mcp_manager.clone();
        let servers = updated.mcp_servers.clone();
        tokio::spawn(async move {
            mcp.reconcile(&servers).await;
        });
        // Re-register tools into current engine if available.
        if let Ok(engine) = state.engine() {
            state.mcp_manager.register_into(&engine.tool_registry);
        }
    }
```

Add the import at the top if not present:

```rust
use rushdino_common::AppConfig;
```

- [ ] **Step 2: Compile check**

```bash
cargo build -p rushdino-server 2>&1 | tail -20
```

- [ ] **Step 3: Commit**

```bash
git add crates/server/src/routes/config.rs
git commit -m "feat(mcp): reconcile McpManager when mcp_servers config changes"
```

---

### Task 8: Frontend types and API helper

**Files:**
- Modify: `frontend/src/lib/types.ts`
- Modify: `frontend/src/lib/api.ts`

- [ ] **Step 1: Add McpServerConfig type and extend AppConfigView**

In `frontend/src/lib/types.ts`, add after `KnowledgeGraphConfig` (around line 178):

```typescript
export interface McpServerConfig {
  name: string;
  url: string;
  auth_header?: string;
}

export type McpConnectionStatusKind = 'connecting' | 'connected' | 'error';

export interface McpServerStatus {
  name: string;
  status: { kind: McpConnectionStatusKind; message?: string };
  tool_count: number;
  last_seen_secs?: number;
}
```

In `AppConfigView` (around line 208), add before `[key: string]: unknown`:

```typescript
  mcp_servers?: McpServerConfig[];
```

- [ ] **Step 2: Add fetchMcpStatus API helper**

In `frontend/src/lib/api.ts`, add the import at the top with the other type imports:

```typescript
import type { McpServerStatus } from './types';
```

Add the function at the end of the file (or near other config API functions):

```typescript
export async function fetchMcpStatus(): Promise<McpServerStatus[]> {
  const response = await fetch('/api/mcp/status');
  return parseJsonOrThrow(response, '/api/mcp/status');
}
```

- [ ] **Step 3: TypeScript compile check**

```bash
cd /Users/kien.ha/Code/RushDino/frontend
npx tsc --noEmit 2>&1 | head -20
```

Expected: no new type errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/types.ts frontend/src/lib/api.ts
git commit -m "feat(mcp): add McpServerConfig type and fetchMcpStatus API helper"
```

---

### Task 9: Build config-section-mcp-servers.tsx

**Files:**
- Create: `frontend/src/pages/config/config-section-mcp-servers.tsx`

- [ ] **Step 1: Create the component**

Create `frontend/src/pages/config/config-section-mcp-servers.tsx`:

```typescript
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { fetchMcpStatus } from '@/lib/api';
import type { AppConfigView, McpServerConfig, McpServerStatus } from '@/lib/types';

interface Props {
  config: AppConfigView;
  onChange: (patch: Partial<AppConfigView>) => void;
}

interface NewServerDraft {
  name: string;
  url: string;
  auth_header: string;
}

const EMPTY_DRAFT: NewServerDraft = { name: '', url: '', auth_header: '' };

export function ConfigSectionMcpServers({ config, onChange }: Props) {
  const servers = config.mcp_servers ?? [];
  const [expandedName, setExpandedName] = useState<string | null>(null);
  const [editDrafts, setEditDrafts] = useState<Record<string, McpServerConfig>>({});
  const [addingNew, setAddingNew] = useState(false);
  const [newDraft, setNewDraft] = useState<NewServerDraft>(EMPTY_DRAFT);
  const [statuses, setStatuses] = useState<Record<string, McpServerStatus>>({});

  // Poll status every 5s
  const refreshStatus = useCallback(async () => {
    try {
      const list = await fetchMcpStatus();
      const map: Record<string, McpServerStatus> = {};
      for (const s of list) map[s.name] = s;
      setStatuses(map);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    refreshStatus();
    const id = setInterval(refreshStatus, 5000);
    return () => clearInterval(id);
  }, [refreshStatus]);

  function statusDot(name: string) {
    const s = statuses[name];
    if (!s) return <span className="w-2 h-2 rounded-full bg-muted flex-shrink-0" />;
    const kind = s.status.kind;
    const color =
      kind === 'connected'
        ? 'bg-green-500'
        : kind === 'connecting'
          ? 'bg-yellow-400'
          : 'bg-red-500';
    return <span className={`w-2 h-2 rounded-full ${color} flex-shrink-0`} />;
  }

  function toolCount(name: string) {
    return statuses[name]?.tool_count ?? 0;
  }

  function statusLabel(name: string) {
    const s = statuses[name];
    if (!s) return null;
    const kind = typeof s.status === 'string' ? s.status : s.status.kind;
    if (kind === 'error') {
      const msg = s.status.message ?? '';
      return (
        <span className="text-[10px] text-destructive truncate max-w-[120px]">{msg || 'unreachable'}</span>
      );
    }
    return null;
  }

  function toggleExpand(name: string) {
    if (expandedName === name) {
      setExpandedName(null);
    } else {
      setExpandedName(name);
      // Seed edit draft from current config
      const server = servers.find((s) => s.name === name);
      if (server) {
        setEditDrafts((prev) => ({ ...prev, [name]: { ...server } }));
      }
    }
  }

  function patchDraft(name: string, patch: Partial<McpServerConfig>) {
    setEditDrafts((prev) => ({
      ...prev,
      [name]: { ...prev[name], ...patch },
    }));
  }

  function saveEdit(name: string) {
    const draft = editDrafts[name];
    if (!draft) return;
    const updated = servers.map((s) => (s.name === name ? draft : s));
    onChange({ mcp_servers: updated });
  }

  function deleteServer(name: string) {
    onChange({ mcp_servers: servers.filter((s) => s.name !== name) });
    if (expandedName === name) setExpandedName(null);
  }

  function addServer() {
    if (!newDraft.name.trim() || !newDraft.url.trim()) return;
    const entry: McpServerConfig = {
      name: newDraft.name.trim(),
      url: newDraft.url.trim(),
      auth_header: newDraft.auth_header.trim() || undefined,
    };
    onChange({ mcp_servers: [...servers, entry] });
    setNewDraft(EMPTY_DRAFT);
    setAddingNew(false);
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {servers.length === 0
            ? 'No MCP servers configured.'
            : `${servers.length} server${servers.length === 1 ? '' : 's'} configured.`}
        </p>
        <Button size="sm" variant="outline" onClick={() => setAddingNew((v) => !v)}>
          {addingNew ? 'Cancel' : '+ Add Server'}
        </Button>
      </div>

      {/* Server list */}
      <div className="space-y-2">
        {servers.map((server) => {
          const isExpanded = expandedName === server.name;
          const draft = editDrafts[server.name] ?? server;
          const s = statuses[server.name];
          const kind = s?.status.kind ?? null;

          return (
            <div
              key={server.name}
              className={`border rounded-lg overflow-hidden transition-colors ${
                isExpanded
                  ? 'border-primary/50 bg-primary/[0.03]'
                  : kind === 'error'
                    ? 'border-destructive/30'
                    : 'border-border/50'
              }`}
            >
              {/* Row header */}
              <button
                type="button"
                className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/20 transition-colors"
                onClick={() => toggleExpand(server.name)}
              >
                {statusDot(server.name)}
                <span className="text-sm font-semibold flex-1">{server.name}</span>
                {statusLabel(server.name)}
                {kind !== 'error' && (
                  <span className="text-[10px] text-muted-foreground mr-1">
                    {toolCount(server.name)} tools
                  </span>
                )}
                <span className="text-[10px] text-muted-foreground opacity-50">
                  {isExpanded ? '▾' : '▸'}
                </span>
              </button>

              {/* Expanded detail */}
              {isExpanded && (
                <div className="px-3 pb-3 pt-2 border-t border-border/30 bg-muted/10 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                        SSE URL
                      </p>
                      <Input
                        value={draft.url}
                        onChange={(e) => patchDraft(server.name, { url: e.target.value })}
                        placeholder="http://localhost:3100/sse"
                        className="h-7 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                        Auth Header{' '}
                        <span className="normal-case opacity-60">(optional)</span>
                      </p>
                      <Input
                        value={draft.auth_header ?? ''}
                        onChange={(e) =>
                          patchDraft(server.name, {
                            auth_header: e.target.value || undefined,
                          })
                        }
                        placeholder="Bearer ..."
                        className="h-7 text-xs"
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground">
                      {s?.last_seen_secs !== undefined
                        ? `Connected · last seen ${s.last_seen_secs}s ago`
                        : ''}
                    </span>
                    <div className="flex gap-2">
                      <Button size="sm" className="h-7 text-xs" onClick={() => saveEdit(server.name)}>
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs opacity-60 border-border/50"
                        onClick={() => deleteServer(server.name)}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Add new server form */}
        {addingNew && (
          <div className="border border-dashed border-border/40 rounded-lg p-3 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground">New Server</p>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <p className="text-[10px] text-muted-foreground">Name</p>
                <Input
                  value={newDraft.name}
                  onChange={(e) => setNewDraft((d) => ({ ...d, name: e.target.value }))}
                  placeholder="e.g. filesystem"
                  className="h-7 text-xs"
                />
              </div>
              <div className="space-y-1">
                <p className="text-[10px] text-muted-foreground">SSE URL</p>
                <Input
                  value={newDraft.url}
                  onChange={(e) => setNewDraft((d) => ({ ...d, url: e.target.value }))}
                  placeholder="http://localhost:3100/sse"
                  className="h-7 text-xs"
                />
              </div>
              <div className="space-y-1">
                <p className="text-[10px] text-muted-foreground">
                  Auth Header <span className="opacity-60">(optional)</span>
                </p>
                <Input
                  value={newDraft.auth_header}
                  onChange={(e) => setNewDraft((d) => ({ ...d, auth_header: e.target.value }))}
                  placeholder="Bearer ..."
                  className="h-7 text-xs"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                className="h-7 text-xs"
                disabled={!newDraft.name.trim() || !newDraft.url.trim()}
                onClick={addServer}
              >
                Connect
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs border-border/50"
                onClick={() => {
                  setAddingNew(false);
                  setNewDraft(EMPTY_DRAFT);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: TypeScript compile check**

```bash
cd /Users/kien.ha/Code/RushDino/frontend
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors in the new file.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/config/config-section-mcp-servers.tsx
git commit -m "feat(mcp): add ConfigSectionMcpServers UI component"
```

---

### Task 10: Wire MCP Servers section into ConfigPage

**Files:**
- Modify: `frontend/src/pages/config/ConfigPage.tsx`

- [ ] **Step 1: Add the section**

In `frontend/src/pages/config/ConfigPage.tsx`, add the import:

```typescript
import { ConfigSectionMcpServers } from './config-section-mcp-servers';
```

In the `SECTIONS` array, add after the `knowledge-graph` entry:

```typescript
  {
    key: 'mcp-servers',
    label: 'MCP Servers',
    description: 'External MCP servers connected via SSE. Tools are available to all agents automatically.',
  },
```

Update the `Section` type:

```typescript
type Section = 'profiles' | 'credentials' | 'server' | 'core-files' | 'knowledge-graph' | 'mcp-servers';
```

In the `<CardContent>` section, add inside the active section conditionals (after the knowledge-graph block and before the footer):

```typescript
            {activeSection === 'mcp-servers' && (
              <ConfigSectionMcpServers
                config={config}
                onChange={handleConfigChange}
              />
            )}
```

Update the footer condition to include `mcp-servers` in the sections that show the Save button. Find:

```typescript
            {activeSection !== 'profiles' && activeSection !== 'core-files' && (
```

Change to:

```typescript
            {activeSection !== 'profiles' && activeSection !== 'core-files' && activeSection !== 'mcp-servers' && (
```

(The MCP section manages its own inline Save per row — no global Save needed.)

- [ ] **Step 2: TypeScript compile check**

```bash
cd /Users/kien.ha/Code/RushDino/frontend
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Run frontend dev server and verify the Config page shows the new section**

```bash
cd /Users/kien.ha/Code/RushDino/frontend
npm run dev 2>&1 | head -10
```

Open http://localhost:3000 → Config → MCP Servers. Verify:
- Section appears in sidebar
- Empty state shows "No MCP servers configured"
- "+ Add Server" button opens the inline form
- Form has Name, SSE URL, Auth Header fields with Connect/Cancel buttons

- [ ] **Step 4: Full build check**

```bash
cd /Users/kien.ha/Code/RushDino
cargo build -p rushdino-server 2>&1 | tail -10
cd frontend && npm run build 2>&1 | tail -10
```

Expected: both build cleanly.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/config/ConfigPage.tsx
git commit -m "feat(mcp): wire MCP Servers section into Config page"
```

---

## Known Limitations (v1)

- **Engine swap gap**: If the provider is changed while MCP servers are connected, MCP tools are re-registered after the engine rebuild (handled in Task 6). There's a brief window between rebuild and re-registration where MCP tools are unavailable.
- **Tool persistence across restart**: On server restart, McpManager reconnects at startup — tools are available after the initial SSE connection completes (~seconds).
- **Fresh SSE per tool call**: Each tool execution opens a new SSE connection (initialize + call + close). This is correct but not optimal. A persistent-stream implementation is a future improvement.
- **No reconnect backoff**: If an MCP server goes down, status stays "error" until the next `reconcile()` call (triggered by config save). Automatic reconnect polling is a future improvement.
