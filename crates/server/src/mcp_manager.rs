//! McpManager: connects to external MCP servers via HTTP/SSE, discovers their tools,
//! and registers them into the agent ToolRegistry as callable tools.
//!
//! Protocol flow per server:
//!   1. GET <sse_url>  (Accept: text/event-stream)
//!   2. Wait for SSE event `event: endpoint` -> `data: /messages?sessionId=xxx`
//!   3. Build full message endpoint URL
//!   4. POST JSON-RPC initialize (id=1)
//!   5. Wait for SSE response with id=1
//!   6. POST JSON-RPC tools/list (id=2)
//!   7. Wait for SSE response with id=2, parse tool list

use std::{
    collections::HashMap,
    sync::{Arc, RwLock},
    time::Instant,
};

use async_trait::async_trait;
use futures::StreamExt;
use serde::Serialize;
use serde_json::{json, Value};
use tracing::{debug, error, info};

use rushdino_agent::tool_registry::{Tool, ToolRegistry};
use rushdino_common::{AppError, McpServerConfig, Result};

// ──────────────────────────────────────────────
// Public status types
// ──────────────────────────────────────────────

/// Connection status for a single MCP server.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case", tag = "kind")]
pub enum McpConnectionStatus {
    Connecting,
    Connected,
    Error { message: String },
}

/// Public snapshot of one server's state.
#[derive(Debug, Clone, Serialize)]
pub struct McpServerStatus {
    pub name: String,
    pub status: McpConnectionStatus,
    pub tool_count: usize,
    /// Seconds since the last successful contact with this server, if any.
    pub last_seen_secs: Option<u64>,
}

// ──────────────────────────────────────────────
// Internal state types
// ──────────────────────────────────────────────

/// A single tool discovered from a remote MCP server.
#[derive(Clone)]
struct McpDiscoveredTool {
    name: String,
    description: String,
    /// JSON Schema for the tool parameters.
    parameters: Value,
}

/// Runtime state for one configured MCP server.
struct McpServerState {
    config: McpServerConfig,
    status: McpConnectionStatus,
    tools: Vec<McpDiscoveredTool>,
    last_seen_at: Option<Instant>,
}

// ──────────────────────────────────────────────
// McpManager
// ──────────────────────────────────────────────

/// Manages connections to all configured external MCP servers.
pub struct McpManager {
    state: Arc<RwLock<HashMap<String, McpServerState>>>,
    http: reqwest::Client,
}

impl McpManager {
    /// Create a new manager with an empty server list.
    pub fn new() -> Arc<Self> {
        Arc::new(Self {
            state: Arc::new(RwLock::new(HashMap::new())),
            http: reqwest::Client::new(),
        })
    }

    /// Replace the server list and (re)connect to any changed or new servers.
    /// Servers that were removed are dropped from the map.
    pub async fn reconcile(&self, servers: &[McpServerConfig]) {
        self.reconcile_inner(servers, None).await;
    }

    /// Like `reconcile`, but also registers each server's discovered tools into
    /// `registry` as soon as discovery completes (inside the per-server task).
    pub async fn reconcile_and_register(
        &self,
        servers: &[McpServerConfig],
        registry: Arc<ToolRegistry>,
    ) {
        self.reconcile_inner(servers, Some(registry)).await;
    }

    async fn reconcile_inner(
        &self,
        servers: &[McpServerConfig],
        registry: Option<Arc<ToolRegistry>>,
    ) {
        let new_names: std::collections::HashSet<String> =
            servers.iter().map(|s| s.name.clone()).collect();

        // Remove servers no longer in config
        {
            let mut map = self.state.write().expect("mcp state lock poisoned");
            map.retain(|k, _| new_names.contains(k));
        }

        // Connect to each server
        for cfg in servers {
            // Mark as connecting for new servers; reset to connecting if config changed.
            {
                let mut map = self.state.write().expect("mcp state lock poisoned");
                let entry = map.entry(cfg.name.clone()).or_insert_with(|| McpServerState {
                    config: cfg.clone(),
                    status: McpConnectionStatus::Connecting,
                    tools: vec![],
                    last_seen_at: None,
                });
                // Reset status when url or auth_header has changed so stale status is not shown.
                if entry.config != *cfg {
                    entry.status = McpConnectionStatus::Connecting;
                    entry.config = cfg.clone();
                }
            }

            let name = cfg.name.clone();
            let cfg_clone = cfg.clone();
            let http = self.http.clone();
            let state = self.state.clone();
            let registry = registry.clone();

            tokio::spawn(async move {
                info!(server = %name, "mcp: discovering tools");
                match discover_tools(&http, &cfg_clone).await {
                    Ok(tools) => {
                        let count = tools.len();
                        {
                            let mut map = state.write().expect("mcp state lock poisoned");
                            if let Some(entry) = map.get_mut(&name) {
                                entry.status = McpConnectionStatus::Connected;
                                entry.tools = tools.clone();
                                entry.last_seen_at = Some(Instant::now());
                                entry.config = cfg_clone.clone();
                            }
                        }
                        // Register discovered tools into the provided registry, if any.
                        if let Some(reg) = registry {
                            for tool in &tools {
                                let full_name = format!("{}__{}", name, tool.name);
                                let mcp_tool = McpTool {
                                    full_name: full_name.clone(),
                                    tool_name: tool.name.clone(),
                                    description: tool.description.clone(),
                                    parameters: tool.parameters.clone(),
                                    sse_url: cfg_clone.url.clone(),
                                    auth_header: cfg_clone.auth_header.clone(),
                                    http: http.clone(),
                                };
                                debug!(tool = %full_name, "mcp: registering tool after discovery");
                                reg.register(mcp_tool);
                            }
                        }
                        info!(server = %name, tools = count, "mcp: tools discovered");
                    }
                    Err(err) => {
                        error!(server = %name, error = %err, "mcp: discovery failed");
                        let mut map = state.write().expect("mcp state lock poisoned");
                        if let Some(entry) = map.get_mut(&name) {
                            entry.status = McpConnectionStatus::Error {
                                message: err.to_string(),
                            };
                        }
                    }
                }
            });
        }
    }

    /// Register all currently discovered tools into the given ToolRegistry.
    /// Each tool is named `{server_name}__{tool_name}`.
    pub fn register_into(&self, registry: &ToolRegistry) {
        let map = self.state.read().expect("mcp state lock poisoned");
        for (server_name, server) in map.iter() {
            for tool in &server.tools {
                let full_name = format!("{}__{}", server_name, tool.name);
                let mcp_tool = McpTool {
                    full_name: full_name.clone(),
                    tool_name: tool.name.clone(),
                    description: tool.description.clone(),
                    parameters: tool.parameters.clone(),
                    sse_url: server.config.url.clone(),
                    auth_header: server.config.auth_header.clone(),
                    http: self.http.clone(),
                };
                debug!(tool = %full_name, "mcp: registering tool");
                registry.register(mcp_tool);
            }
        }
    }

    /// Return a snapshot of all server statuses, sorted by name for stable UI ordering.
    pub fn status_snapshot(&self) -> Vec<McpServerStatus> {
        let map = self.state.read().expect("mcp state lock poisoned");
        let mut result: Vec<McpServerStatus> = map.values()
            .map(|s| McpServerStatus {
                name: s.config.name.clone(),
                status: s.status.clone(),
                tool_count: s.tools.len(),
                last_seen_secs: s.last_seen_at.map(|t| t.elapsed().as_secs()),
            })
            .collect();
        result.sort_by(|a, b| a.name.cmp(&b.name));
        result
    }
}

// ──────────────────────────────────────────────
// SSE reader
// ──────────────────────────────────────────────

/// Wraps a streaming reqwest response and parses Server-Sent Events.
struct SseReader {
    stream: Box<dyn futures::Stream<Item = std::result::Result<bytes::Bytes, reqwest::Error>> + Unpin + Send>,
    buffer: String,
}

// Bring Bytes into scope explicitly so pattern matches resolve correctly.
use bytes::Bytes;

impl SseReader {
    fn new(
        stream: impl futures::Stream<Item = std::result::Result<bytes::Bytes, reqwest::Error>>
            + Unpin
            + Send
            + 'static,
    ) -> Self {
        Self {
            stream: Box::new(stream),
            buffer: String::new(),
        }
    }

    /// Read bytes until a complete SSE event (terminated by `\n\n`) is found.
    /// Returns `(event_type, data)` or `None` on stream end.
    async fn next_event(&mut self) -> anyhow::Result<Option<(String, String)>> {
        loop {
            // Try to extract a complete event from the buffer first
            if let Some(pos) = self.buffer.find("\n\n") {
                let raw = self.buffer[..pos].to_owned();
                self.buffer.drain(..pos + 2);

                let mut event_type = String::from("message");
                let mut data = String::new();

                for line in raw.lines() {
                    if let Some(val) = line.strip_prefix("event:") {
                        event_type = val.trim().to_owned();
                    } else if let Some(val) = line.strip_prefix("data: ").or_else(|| line.strip_prefix("data:")) {
                        if !data.is_empty() {
                            data.push('\n');
                        }
                        data.push_str(val.trim_end());
                    }
                }

                if !data.is_empty() {
                    return Ok(Some((event_type, data)));
                }
                // empty data — keep reading
                continue;
            }

            // Need more bytes
            match self.stream.next().await {
                None => return Ok(None),
                Some(Err(e)) => return Err(anyhow::anyhow!("SSE stream error: {e}")),
                Some(Ok(chunk)) => {
                    let chunk: Bytes = chunk;
                    let text = std::str::from_utf8(&chunk)
                        .map_err(|e| anyhow::anyhow!("SSE non-UTF8 chunk: {e}"))?;
                    self.buffer.push_str(text);
                }
            }
        }
    }

    /// Block until an SSE event whose JSON payload contains `"id": <id>` arrives.
    /// Returns the full parsed JSON value of the event data.
    async fn wait_for_id(&mut self, id: u64) -> anyhow::Result<Value> {
        loop {
            match self.next_event().await? {
                None => return Err(anyhow::anyhow!("SSE stream closed before receiving id={id}")),
                Some((_evt, data)) => {
                    let v = match serde_json::from_str::<Value>(&data) {
                        Ok(v) => v,
                        Err(_) => continue,
                    };
                    if v.get("id").and_then(|x| x.as_u64()) == Some(id) {
                        return Ok(v);
                    }
                    // Otherwise keep reading — might be an out-of-order or notification event
                }
            }
        }
    }
}

// ──────────────────────────────────────────────
// MCP protocol helpers
// ──────────────────────────────────────────────

/// Given the SSE URL and the path returned in the `endpoint` event,
/// build the full message endpoint URL.
///
/// Examples:
///   sse_url = "http://localhost:3100/sse"
///   path    = "/messages?sessionId=abc"
///   result  = "http://localhost:3100/messages?sessionId=abc"
fn resolve_message_endpoint(sse_url: &str, path: &str) -> String {
    // Extract scheme + host from the SSE URL
    if let Ok(parsed) = url::Url::parse(sse_url) {
        let base = format!(
            "{}://{}",
            parsed.scheme(),
            parsed.host_str().unwrap_or("localhost")
        );
        let port_part = parsed
            .port()
            .map(|p| format!(":{p}"))
            .unwrap_or_default();
        return format!("{}{}{}", base, port_part, path);
    }
    // Fallback: just concatenate
    format!("{}{}", sse_url.trim_end_matches("/sse"), path)
}

/// POST a JSON-RPC request to `endpoint`.
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
        req = req.header(reqwest::header::AUTHORIZATION, auth);
    }

    let resp = req.send().await?;
    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(anyhow::anyhow!(
            "JSON-RPC POST failed: HTTP {status}: {text}"
        ));
    }
    Ok(())
}

/// Connect to an MCP server and discover its tools.
async fn discover_tools(
    client: &reqwest::Client,
    config: &McpServerConfig,
) -> anyhow::Result<Vec<McpDiscoveredTool>> {
    // 1. Open the SSE stream
    let mut req = client
        .get(&config.url)
        .header(reqwest::header::ACCEPT, "text/event-stream");
    if let Some(auth) = &config.auth_header {
        req = req.header(reqwest::header::AUTHORIZATION, auth.as_str());
    }
    let resp = req.send().await?;
    if !resp.status().is_success() {
        return Err(anyhow::anyhow!(
            "SSE connect failed: HTTP {}",
            resp.status()
        ));
    }

    let mut sse = SseReader::new(resp.bytes_stream());

    // 2. Wait for the `endpoint` event which gives us the message channel path
    let message_path = loop {
        match sse.next_event().await? {
            None => return Err(anyhow::anyhow!("SSE stream ended before endpoint event")),
            Some((evt, data)) if evt == "endpoint" => break data,
            Some((evt, _)) => {
                debug!(event = %evt, "mcp: ignoring SSE event during handshake");
            }
        }
    };

    let message_endpoint = resolve_message_endpoint(&config.url, &message_path);
    debug!(endpoint = %message_endpoint, "mcp: message endpoint resolved");

    // 3. Send initialize
    post_jsonrpc(
        client,
        &message_endpoint,
        config.auth_header.as_deref(),
        1,
        "initialize",
        json!({
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": { "name": "rushdino", "version": "0.1" }
        }),
    )
    .await?;

    // 4. Wait for initialize response (id=1)
    sse.wait_for_id(1).await?;

    // 5. Send tools/list
    post_jsonrpc(
        client,
        &message_endpoint,
        config.auth_header.as_deref(),
        2,
        "tools/list",
        json!({}),
    )
    .await?;

    // 6. Wait for tools/list response (id=2)
    let tools_resp = sse.wait_for_id(2).await?;

    // Parse: {"result": {"tools": [{"name": "...", "description": "...", "inputSchema": {...}}]}}
    let tools_arr = tools_resp
        .get("result")
        .and_then(|r| r.get("tools"))
        .and_then(|t| t.as_array())
        .ok_or_else(|| anyhow::anyhow!("Unexpected tools/list response shape: {tools_resp}"))?;

    let tools = tools_arr
        .iter()
        .filter_map(|tool| {
            let name = tool.get("name")?.as_str()?.to_owned();
            let description = tool
                .get("description")
                .and_then(|d| d.as_str())
                .unwrap_or("")
                .to_owned();
            // MCP uses `inputSchema` for the JSON Schema
            let parameters = tool
                .get("inputSchema")
                .cloned()
                .unwrap_or_else(|| json!({"type": "object", "properties": {}}));
            Some(McpDiscoveredTool {
                name,
                description,
                parameters,
            })
        })
        .collect();

    Ok(tools)
}

/// Execute a single MCP tool call on a fresh SSE connection.
async fn call_mcp_tool(
    client: &reqwest::Client,
    sse_url: &str,
    auth_header: Option<&str>,
    tool_name: &str,
    arguments: Value,
) -> anyhow::Result<String> {
    // Open a new SSE stream for this call
    let mut req = client
        .get(sse_url)
        .header(reqwest::header::ACCEPT, "text/event-stream");
    if let Some(auth) = auth_header {
        req = req.header(reqwest::header::AUTHORIZATION, auth);
    }
    let resp = req.send().await?;
    if !resp.status().is_success() {
        return Err(anyhow::anyhow!(
            "SSE connect for tool call failed: HTTP {}",
            resp.status()
        ));
    }

    let mut sse = SseReader::new(resp.bytes_stream());

    // Wait for endpoint
    let message_path = loop {
        match sse.next_event().await? {
            None => return Err(anyhow::anyhow!("SSE stream ended before endpoint event")),
            Some((evt, data)) if evt == "endpoint" => break data,
            Some(_) => {}
        }
    };

    let message_endpoint = resolve_message_endpoint(sse_url, &message_path);

    // initialize
    post_jsonrpc(
        client,
        &message_endpoint,
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
    sse.wait_for_id(1).await?;

    // tools/call
    post_jsonrpc(
        client,
        &message_endpoint,
        auth_header,
        2,
        "tools/call",
        json!({ "name": tool_name, "arguments": arguments }),
    )
    .await?;

    let call_resp = sse.wait_for_id(2).await?;

    // Parse result: {"result": {"content": [{"type": "text", "text": "..."}]}}
    let content = call_resp
        .get("result")
        .and_then(|r| r.get("content"))
        .and_then(|c| c.as_array())
        .ok_or_else(|| anyhow::anyhow!("Unexpected tools/call response: {call_resp}"))?;

    let text = content
        .iter()
        .filter(|item| item.get("type").and_then(|t| t.as_str()) == Some("text"))
        .filter_map(|item| item.get("text").and_then(|t| t.as_str()))
        .collect::<Vec<_>>()
        .join("\n");

    Ok(text)
}

// ──────────────────────────────────────────────
// McpTool — implements the agent Tool trait
// ──────────────────────────────────────────────

/// An MCP-discovered tool wrapped to implement the agent `Tool` trait.
struct McpTool {
    /// Registered name in the ToolRegistry: `{server_name}__{tool_name}`.
    full_name: String,
    /// Raw tool name as reported by the MCP server.
    tool_name: String,
    description: String,
    parameters: Value,
    /// Full SSE URL of the originating server.
    sse_url: String,
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

    async fn execute(&self, args: Value) -> Result<String> {
        call_mcp_tool(
            &self.http,
            &self.sse_url,
            self.auth_header.as_deref(),
            &self.tool_name,
            args,
        )
        .await
        .map_err(|e| AppError::Agent(format!("mcp tool '{}' error: {e}", self.full_name)))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_message_endpoint_strips_sse_suffix() {
        let result =
            resolve_message_endpoint("http://localhost:3100/sse", "/messages?sessionId=abc");
        assert_eq!(result, "http://localhost:3100/messages?sessionId=abc");
    }

}
