# Safety + Streaming Implementation Plan

> Superseded by `docs/plans/2026-02-28-safety-streaming-v2-remediation.md`.

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Three quality improvements inspired by OpenClaw — (1) Codex OAuth token auto-refresh so the server never starts with a stale token, (2) real token-by-token WebSocket streaming so users see the assistant typing, and (3) a tool approval gate that asks the user before `shell_exec` runs a dangerous command.

**Architecture:**
- Token refresh lives in `crates/providers/src/codex_refresh.rs` (server can't depend on cli, so we duplicate the thin HTTP call there rather than sharing code with the CLI).
- Streaming bypasses the gateway for WebSocket connections: `ws.rs` calls `engine.stream_chat_via_ws()` directly. The gateway path (Telegram/Discord/Slack) keeps using non-streaming `engine.chat()`.
- Approval gate is a shared `Arc<ApprovalGate>` stored in `AppState`. The `ShellExecTool` holds a weak reference to it; `ws.rs` bridges approvals between the tool and the WebSocket client.

**Tech Stack:** Rust (tokio, axum, reqwest), TypeScript/React (Vite)

---

## Task 1: Codex Token Auto-Refresh

**Files:**
- Create: `crates/providers/src/codex_refresh.rs`
- Modify: `crates/providers/src/lib.rs` (re-export)
- Modify: `crates/server/src/lib.rs` (call refresh before building provider)

### Step 1: Write the failing test

In `crates/providers/src/codex_refresh.rs`, write a compile-only doc test verifying the struct exists:

```rust
//! Codex OAuth token refresh.
//!
//! Called at server startup when the stored access token is near expiry.

use std::time::{SystemTime, UNIX_EPOCH};
use reqwest::Client;
use serde::Deserialize;
use rushdino_common::{AppError, Result};

const TOKEN_URL: &str = "https://auth.openai.com/oauth/token";
const CLIENT_ID: &str = "app_EMoamEEZ73f0CkXaXp7hrann";

#[derive(Deserialize)]
struct RefreshResponse {
    access_token: String,
    refresh_token: String,
    expires_in: u64,
}

/// Refresh the Codex access token using the stored refresh_token.
/// Returns (new_access_token, new_refresh_token, expires_at_unix).
pub async fn refresh_codex_token(refresh_token: &str) -> Result<(String, String, i64)> {
    let client = Client::new();
    let params = [
        ("grant_type", "refresh_token"),
        ("client_id", CLIENT_ID),
        ("refresh_token", refresh_token),
    ];
    let res = client
        .post(TOKEN_URL)
        .form(&params)
        .send()
        .await
        .map_err(|e| AppError::Provider(format!("codex refresh request failed: {e}")))?;

    if !res.status().is_success() {
        let status = res.status();
        let body = res.text().await.unwrap_or_else(|e| format!("<failed to read body: {e}>"));
        return Err(AppError::Provider(format!("codex refresh failed ({status}): {body}")));
    }

    let token: RefreshResponse = res
        .json()
        .await
        .map_err(|e| AppError::Provider(format!("codex refresh parse error: {e}")))?;

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;

    Ok((token.access_token, token.refresh_token, now + token.expires_in as i64))
}

/// Returns true if the access token expires within the next 5 minutes.
pub fn token_needs_refresh(expires_at: Option<i64>) -> bool {
    let Some(expires_at) = expires_at else { return false };
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;
    expires_at - now < 300 // 5 minutes
}
```

### Step 2: Run `cargo check` to verify it compiles

```bash
cd /Users/kien.ha/Code/RushDino
cargo check -p rushdino-providers
```
Expected: PASS (no errors)

### Step 3: Re-export from `crates/providers/src/lib.rs`

Add at the bottom of `crates/providers/src/lib.rs`:

```rust
pub mod codex_refresh;
```

### Step 4: Wire refresh into server startup

In `crates/server/src/lib.rs`, at the top of `run_server()`, after `let credentials = ...`, add the Codex refresh block **before** building the provider:

```rust
// Auto-refresh Codex token if near expiry.
let credentials = if config.active_provider == ProviderKind::Codex
    && rushdino_providers::codex_refresh::token_needs_refresh(
        credentials.codex_token_expires_at,
    )
{
    tracing::info!("codex: access token near expiry, refreshing…");
    let refresh_token = credentials.codex_refresh_token.as_deref().unwrap_or_default();
    match rushdino_providers::codex_refresh::refresh_codex_token(refresh_token).await {
        Ok((new_access, new_refresh, new_expires)) => {
            // Persist the new tokens to credentials.toml.
            let creds_path = init::default_home_dir().join("credentials.toml");
            if let Ok(mut doc) = std::fs::read_to_string(&creds_path) {
                doc = rewrite_creds_value(doc, "codex_access_token", &new_access);
                doc = rewrite_creds_value(doc, "codex_refresh_token", &new_refresh);
                doc = rewrite_creds_int(doc, "codex_token_expires_at", new_expires);
                let _ = std::fs::write(&creds_path, doc);
            }
            // Return updated credentials.
            let mut updated = (*credentials).clone();
            updated.codex_access_token = Some(new_access);
            updated.codex_refresh_token = Some(new_refresh);
            updated.codex_token_expires_at = Some(new_expires);
            Arc::new(updated)
        }
        Err(e) => {
            tracing::warn!("codex token refresh failed: {e} — using stored token");
            credentials
        }
    }
} else {
    credentials
};
```

Add the two helper functions at the bottom of `crates/server/src/lib.rs`:

```rust
fn rewrite_creds_value(mut doc: String, key: &str, value: &str) -> String {
    let quoted = format!("{key} = \"{value}\"");
    for line in doc.clone().lines() {
        if line.trim_start().starts_with(&format!("{key} =")) {
            doc = doc.replace(line, &quoted);
            return doc;
        }
    }
    doc
}

fn rewrite_creds_int(mut doc: String, key: &str, value: i64) -> String {
    let unquoted = format!("{key} = {value}");
    for line in doc.clone().lines() {
        if line.trim_start().starts_with(&format!("{key} =")) {
            doc = doc.replace(line, &unquoted);
            return doc;
        }
    }
    doc
}
```

### Step 5: Run `cargo check --workspace`

```bash
cargo check --workspace
```
Expected: PASS

### Step 6: Commit

```bash
git add crates/providers/src/codex_refresh.rs crates/providers/src/lib.rs crates/server/src/lib.rs
git commit -m "feat: auto-refresh Codex OAuth token on server startup when near expiry"
```

---

## Task 2: Real Token-by-Token WebSocket Streaming

**Context:** The WebSocket handler currently routes messages through the gateway (`WebChatAdapter → Router → engine.chat()`) which buffers the full response then sends one message. The providers already have `stream_chat()` that emits `ChatChunk` deltas. The frontend `use-websocket.ts` already accumulates deltas with `last.content += chunk.delta`. We bypass the gateway for WebSocket connections and call the engine directly.

**Files:**
- Modify: `crates/agent/src/react_loop.rs` — add streaming variant
- Modify: `crates/agent/src/engine.rs` — add `stream_chat_via_ws()` method
- Modify: `crates/agent/src/lib.rs` — re-export `ChatChunk`
- Modify: `crates/server/src/ws.rs` — call engine directly instead of via gateway

### Step 1: Add streaming ReAct loop to `crates/agent/src/react_loop.rs`

Add after the existing `run_react_loop` function:

```rust
use rushdino_providers::types::ChatChunk;

/// Streaming variant: tool-call iterations use `provider.chat()` (non-streaming),
/// the final answer uses `provider.stream_chat()` and forwards chunks to `chunk_tx`.
pub async fn run_react_loop_streaming(
    provider: Arc<Provider>,
    registry: Arc<ToolRegistry>,
    mut messages: Vec<Message>,
    config: &AgentConfig,
    chunk_tx: mpsc::Sender<ChatChunk>,
) -> Result<(ChatResponse, Vec<Message>)> {
    let mut last = None;

    for _ in 0..config.max_iterations {
        let input = truncate_messages(&messages, config.max_context_tokens);

        // Peek: are there pending tool calls? Use non-streaming for intermediate steps.
        let probe = provider
            .chat(ChatRequest {
                messages: input.clone(),
                tools: Some(registry.definitions()),
                temperature: Some(0.2),
                max_tokens: Some(1200),
                model: None,
            })
            .await?;

        let assistant_message = Message {
            id: Uuid::new_v4().to_string(),
            role: Role::Assistant,
            content: probe.content.clone(),
            tool_calls: Some(probe.tool_calls.clone()).filter(|x| !x.is_empty()),
            created_at: Utc::now(),
        };
        messages.push(assistant_message);

        if probe.tool_calls.is_empty() {
            // Final answer: re-run with streaming to emit tokens progressively.
            // Pop the non-streamed assistant message we just added.
            messages.pop();

            let mut stream_rx = provider
                .stream_chat(ChatRequest {
                    messages: input,
                    tools: Some(registry.definitions()),
                    temperature: Some(0.2),
                    max_tokens: Some(1200),
                    model: None,
                })
                .await?;

            let mut full_content = String::new();
            while let Some(chunk) = stream_rx.recv().await {
                if !chunk.delta.is_empty() {
                    full_content.push_str(&chunk.delta);
                }
                let _ = chunk_tx.send(chunk).await;
            }

            let final_response = ChatResponse {
                content: full_content,
                finish_reason: "stop".to_owned(),
                tool_calls: Vec::new(),
            };

            messages.push(Message {
                id: Uuid::new_v4().to_string(),
                role: Role::Assistant,
                content: final_response.content.clone(),
                tool_calls: None,
                created_at: Utc::now(),
            });

            return Ok((final_response, messages));
        }

        // Execute tool calls (parallel).
        let calls = probe.tool_calls.clone();
        let futures = calls.into_iter().map(|call| {
            let registry = registry.clone();
            async move {
                if let Some(tool) = registry.get(&call.name) {
                    match tool.execute(call.arguments.clone()).await {
                        Ok(value) => (call, value, false),
                        Err(err) => (call, err.to_string(), true),
                    }
                } else {
                    (call, "tool not found".to_owned(), true)
                }
            }
        });

        for (call, output, is_error) in join_all(futures).await {
            let payload = if is_error {
                format!("[tool_error:{}] {output}", call.name)
            } else {
                output
            };
            messages.push(Message {
                id: Uuid::new_v4().to_string(),
                role: Role::Tool,
                content: payload,
                tool_calls: None,
                created_at: Utc::now(),
            });
        }

        last = Some(probe);
    }

    let fallback = last.ok_or_else(|| AppError::Agent("empty ReAct execution".to_owned()))?;
    Ok((fallback, messages))
}
```

Note: `ChatResponse` needs to be imported. Add to imports in react_loop.rs:
```rust
use rushdino_providers::types::{ChatChunk, ChatRequest, ChatResponse};
```
(replace the existing `ChatRequest, ChatResponse` import)

### Step 2: Add `stream_chat_via_ws` to `crates/agent/src/engine.rs`

Add after `stream_chat()`:

```rust
/// Streaming entry point for WebSocket connections.
/// Runs the full ReAct loop and streams the final answer as ChatChunk deltas.
/// Returns the conversation_id used.
pub async fn stream_chat_via_ws(
    &self,
    conversation_id: Option<String>,
    user_input: &str,
    chunk_tx: mpsc::Sender<rushdino_providers::types::ChatChunk>,
) -> Result<String> {
    let conversation_id = if let Some(id) = conversation_id {
        id
    } else {
        self.conversation
            .create_conversation(title_from(user_input))
            .await?
            .id
    };

    let mut messages = self
        .conversation
        .get_messages(&conversation_id)
        .await
        .unwrap_or_default();

    if messages.is_empty() {
        let _ = self
            .conversation
            .create_conversation_with_id(&conversation_id, title_from(user_input))
            .await?;
        messages.push(system_message(&self.config, self.memory.as_ref()));
    }

    let old_len = messages.len();
    let user_msg = user_message(user_input);
    self.conversation.save_message(&conversation_id, &user_msg).await?;
    messages.push(user_msg);

    let (_, all_messages) = crate::react_loop::run_react_loop_streaming(
        self.provider.clone(),
        self.tool_registry.clone(),
        messages,
        &self.config,
        chunk_tx,
    )
    .await?;

    for message in all_messages.iter().skip(old_len + 1) {
        self.conversation.save_message(&conversation_id, message).await?;
    }

    Ok(conversation_id)
}
```

Add the missing imports at the top of `engine.rs` if not present:
```rust
use crate::react_loop::run_react_loop_streaming;
```
(actually we call it via `crate::react_loop::run_react_loop_streaming` inline, so no extra import needed)

### Step 3: Run `cargo check -p rushdino-agent`

```bash
cargo check -p rushdino-agent
```
Expected: PASS

### Step 4: Rewrite `crates/server/src/ws.rs` to use streaming engine directly

Replace the entire contents of `ws.rs`:

```rust
use axum::{
    extract::{ws::Message, State, WebSocketUpgrade},
    response::IntoResponse,
};
use futures::{SinkExt, StreamExt};
use serde::Deserialize;
use tokio::sync::mpsc;
use uuid::Uuid;

use crate::state::AppState;

#[derive(Debug, Deserialize)]
struct WsChatRequest {
    conversation_id: Option<String>,
    message: String,
}

pub async fn ws_chat(ws: WebSocketUpgrade, State(state): State<AppState>) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

async fn handle_socket(socket: axum::extract::ws::WebSocket, state: AppState) {
    let client_id = Uuid::new_v4().to_string();
    let (mut ws_sink, mut ws_recv) = socket.split();

    // Channel for streaming chunks from engine → WebSocket
    let (chunk_tx, mut chunk_rx) = mpsc::channel::<serde_json::Value>(128);

    // Task: forward engine chunk payloads to the WebSocket client.
    let mut send_task = tokio::spawn(async move {
        while let Some(payload) = chunk_rx.recv().await {
            if ws_sink
                .send(Message::Text(payload.to_string()))
                .await
                .is_err()
            {
                break;
            }
        }
    });

    // Task: receive messages from the WebSocket client and run the engine.
    let engine = state.engine.clone();
    let mut recv_task = tokio::spawn(async move {
        let mut active_conversation: Option<String> = None;

        while let Some(Ok(message)) = ws_recv.next().await {
            let Message::Text(text) = message else {
                continue;
            };

            let (conversation_id, user_text) =
                if let Ok(req) = serde_json::from_str::<WsChatRequest>(&text) {
                    (req.conversation_id.or_else(|| active_conversation.clone()), req.message)
                } else {
                    (active_conversation.clone(), text.to_string())
                };

            // Channel for this request's streaming chunks.
            let (engine_tx, mut engine_rx) = mpsc::channel::<rushdino_providers::types::ChatChunk>(128);
            let chunk_fwd = chunk_tx.clone();

            // Forward engine ChatChunks to the WS-payload channel.
            tokio::spawn(async move {
                while let Some(ck) = engine_rx.recv().await {
                    let payload = serde_json::json!({
                        "delta": ck.delta,
                        "done": ck.done,
                    });
                    let _ = chunk_fwd.send(payload).await;
                }
            });

            match engine
                .stream_chat_via_ws(conversation_id, &user_text, engine_tx)
                .await
            {
                Ok(conv_id) => {
                    active_conversation = Some(conv_id);
                }
                Err(e) => {
                    tracing::error!("ws stream_chat_via_ws error: {e}");
                    // Send an error message to the client.
                    let _ = chunk_tx
                        .send(serde_json::json!({
                            "delta": format!("Error: {e}"),
                            "done": true,
                        }))
                        .await;
                }
            }
        }
    });

    tokio::select! {
        _ = &mut send_task => recv_task.abort(),
        _ = &mut recv_task => send_task.abort(),
    }

    // Disconnect webchat adapter if still registered (graceful cleanup).
    state.webchat.disconnect(&client_id).await;
}
```

### Step 5: Run `cargo check --workspace`

```bash
cargo check --workspace
```
Expected: PASS

### Step 6: Run tests

```bash
cargo test --workspace
```
Expected: all existing tests pass

### Step 7: Manual smoke test

```bash
cargo run -p rushdino-cli -- start --foreground
```
Open `http://localhost:3000`, type a message, verify text appears word-by-word (streaming), not all at once.

### Step 8: Commit

```bash
git add crates/agent/src/react_loop.rs crates/agent/src/engine.rs crates/server/src/ws.rs
git commit -m "feat: real token-by-token streaming via WebSocket using run_react_loop_streaming"
```

---

## Task 3: Tool Approval Gate

**Context:** `shell_exec` currently runs any shell command without confirmation. We add an `ApprovalGate` that pauses execution, sends an approval request to the WebSocket client, and waits for the user to approve or deny before proceeding.

**Design:**
- `ApprovalGate` holds a `pending` map (`Mutex<HashMap<request_id, oneshot::Sender<bool>>>`) and a `broadcast::Sender<ApprovalRequest>` for notifying the active ws.rs handler.
- `ws.rs` subscribes to the broadcast, forwards approval requests to the client as JSON, and routes approval responses back.
- `ShellExecTool` holds `Option<Arc<ApprovalGate>>` and calls `gate.request_approval(tool_name, args)` before executing.
- `AppState` holds `Arc<ApprovalGate>`.
- Frontend: new `ApprovalCard` component shows approve/deny buttons in the chat.

**Files:**
- Create: `crates/server/src/approval_gate.rs`
- Modify: `crates/server/src/state.rs` — add `gate: Arc<ApprovalGate>`
- Modify: `crates/server/src/lib.rs` — create gate, pass to engine
- Modify: `crates/agent/src/engine.rs` — accept `Option<Arc<ApprovalGate>>`
- Modify: `crates/agent/src/engine_bootstrap.rs` — pass gate to ShellExecTool
- Modify: `crates/agent/src/tools/shell_exec.rs` — request approval before execute
- Modify: `crates/server/src/ws.rs` — subscribe to gate notifications, route approval_response
- Create: `frontend/src/components/chat/approval-card.tsx`
- Modify: `frontend/src/hooks/use-websocket.ts` — handle `approval_request` messages
- Modify: `frontend/src/components/chat/message-list.tsx` — render approval cards

### Step 1: Create `crates/server/src/approval_gate.rs`

```rust
//! Tool execution approval gate.
//!
//! When a dangerous tool wants to run, it calls `ApprovalGate::request_approval`.
//! The gate sends an `ApprovalRequest` over a broadcast channel (ws.rs subscribes)
//! and then awaits a oneshot response from the user.

use std::{collections::HashMap, sync::Arc};

use serde::Serialize;
use serde_json::Value;
use tokio::sync::{broadcast, oneshot, Mutex};
use uuid::Uuid;

use rushdino_common::{AppError, Result};

/// Timeout in seconds for awaiting user approval.
const APPROVAL_TIMEOUT_SECS: u64 = 120;

/// Sent from the gate to ws.rs when a tool wants approval.
#[derive(Debug, Clone, Serialize)]
pub struct ApprovalRequest {
    pub request_id: String,
    pub tool: String,
    pub args: Value,
}

/// Shared gate — create one per server instance, store in `AppState`.
pub struct ApprovalGate {
    pending: Mutex<HashMap<String, oneshot::Sender<bool>>>,
    notify_tx: broadcast::Sender<ApprovalRequest>,
}

impl ApprovalGate {
    pub fn new() -> (Arc<Self>, broadcast::Receiver<ApprovalRequest>) {
        let (notify_tx, rx) = broadcast::channel(64);
        let gate = Arc::new(Self {
            pending: Mutex::new(HashMap::new()),
            notify_tx,
        });
        (gate, rx)
    }

    /// Subscribe to incoming approval requests (call once per ws.rs connection).
    pub fn subscribe(&self) -> broadcast::Receiver<ApprovalRequest> {
        self.notify_tx.subscribe()
    }

    /// Called by a tool: suspends until the user approves or denies.
    /// Returns `Ok(())` if approved, `Err` if denied or timed out.
    pub async fn request_approval(&self, tool: &str, args: Value) -> Result<()> {
        let request_id = Uuid::new_v4().to_string();
        let (tx, rx) = oneshot::channel::<bool>();

        self.pending.lock().await.insert(request_id.clone(), tx);

        let req = ApprovalRequest {
            request_id: request_id.clone(),
            tool: tool.to_owned(),
            args,
        };
        // If no ws.rs handler is subscribed this returns RecvError — treat as denied.
        if self.notify_tx.send(req).is_err() {
            self.pending.lock().await.remove(&request_id);
            return Err(AppError::Agent(
                "tool approval skipped: no active WebSocket session".to_owned(),
            ));
        }

        match tokio::time::timeout(
            std::time::Duration::from_secs(APPROVAL_TIMEOUT_SECS),
            rx,
        )
        .await
        {
            Ok(Ok(true)) => Ok(()),
            Ok(Ok(false)) => Err(AppError::Agent(format!("tool '{tool}' denied by user"))),
            Ok(Err(_)) => Err(AppError::Agent("approval channel dropped".to_owned())),
            Err(_) => {
                self.pending.lock().await.remove(&request_id);
                Err(AppError::Agent(format!(
                    "tool approval timed out after {APPROVAL_TIMEOUT_SECS}s"
                )))
            }
        }
    }

    /// Called by ws.rs when the client sends an approval_response message.
    pub async fn resolve(&self, request_id: &str, approved: bool) {
        if let Some(tx) = self.pending.lock().await.remove(request_id) {
            let _ = tx.send(approved);
        }
    }
}

impl Default for ApprovalGate {
    fn default() -> Self {
        let (notify_tx, _) = broadcast::channel(64);
        Self {
            pending: Mutex::new(HashMap::new()),
            notify_tx,
        }
    }
}
```

### Step 2: Run `cargo check -p rushdino-server`

```bash
cargo check -p rushdino-server
```
Expected: PASS

### Step 3: Add `gate` to `AppState` in `crates/server/src/state.rs`

```rust
use std::{sync::Arc, time::Instant};

use rushdino_agent::AgentEngine;
use rushdino_common::AppConfig;

use crate::{approval_gate::ApprovalGate, webchat::WebChatAdapter};

#[derive(Clone)]
pub struct AppState {
    pub engine: Arc<AgentEngine>,
    pub config: Arc<AppConfig>,
    pub start_time: Instant,
    pub webchat: Arc<WebChatAdapter>,
    pub gate: Arc<ApprovalGate>,
}

impl AppState {
    pub fn new(
        engine: Arc<AgentEngine>,
        config: Arc<AppConfig>,
        webchat: Arc<WebChatAdapter>,
        gate: Arc<ApprovalGate>,
    ) -> Self {
        Self {
            engine,
            config,
            start_time: Instant::now(),
            webchat,
            gate,
        }
    }
}
```

### Step 4: Thread `ApprovalGate` through `AgentEngine`

**Modify `crates/agent/src/tools/shell_exec.rs`:**

```rust
use std::sync::Arc;
use std::time::Duration;

use async_trait::async_trait;
use serde_json::{json, Value};
use tokio::process::Command;

use rushdino_common::{AppError, Result};

use crate::tool_registry::Tool;

/// Trait object for the approval gate, so agent crate doesn't depend on server crate.
/// server crate implements this trait on `Arc<ApprovalGate>`.
#[async_trait]
pub trait ToolApproval: Send + Sync {
    async fn request_approval(&self, tool: &str, args: Value) -> Result<()>;
}

pub struct ShellExecTool {
    timeout_secs: u64,
    approval: Option<Arc<dyn ToolApproval>>,
}

impl ShellExecTool {
    pub fn new(timeout_secs: u64) -> Self {
        Self { timeout_secs, approval: None }
    }

    pub fn with_approval(mut self, gate: Arc<dyn ToolApproval>) -> Self {
        self.approval = Some(gate);
        self
    }
}

#[async_trait]
impl Tool for ShellExecTool {
    fn name(&self) -> &str { "shell_exec" }

    fn description(&self) -> &str {
        "Execute shell command in local environment"
    }

    fn parameters(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "command": {"type": "string"},
                "cwd": {"type": "string"}
            },
            "required": ["command"]
        })
    }

    async fn execute(&self, args: Value) -> Result<String> {
        let command = args
            .get("command")
            .and_then(Value::as_str)
            .ok_or_else(|| AppError::Validation("command is required".to_owned()))?;

        // Request approval before running.
        if let Some(gate) = &self.approval {
            gate.request_approval("shell_exec", args.clone()).await?;
        }

        let cwd = args.get("cwd").and_then(Value::as_str);
        let mut cmd = Command::new("sh");
        cmd.arg("-lc").arg(command);
        if let Some(cwd) = cwd {
            cmd.current_dir(cwd);
        }

        let output = tokio::time::timeout(Duration::from_secs(self.timeout_secs), cmd.output())
            .await
            .map_err(|_| AppError::Agent("shell_exec timed out".to_owned()))?
            .map_err(|e| AppError::Agent(format!("shell_exec failed: {e}")))?;

        let stdout = String::from_utf8_lossy(&output.stdout);
        let stderr = String::from_utf8_lossy(&output.stderr);
        Ok(format!(
            "status: {}\nstdout:\n{}\nstderr:\n{}",
            output.status, stdout, stderr
        ))
    }
}
```

**Modify `crates/agent/src/engine_bootstrap.rs`:**

Change `build_engine_deps` signature to accept an optional approval gate:

```rust
pub fn build_engine_deps(
    provider: Arc<Provider>,
    pool: Arc<SqlitePool>,
    home_dir: PathBuf,
    brave_api_key: Option<String>,
    config: &AgentConfig,
    approval: Option<Arc<dyn crate::tools::shell_exec::ToolApproval>>,
) -> Result<EngineDeps> {
    // ... all existing code ...

    // Change ShellExecTool registration:
    let shell = if let Some(gate) = approval {
        ShellExecTool::new(config.tool_timeout_secs).with_approval(gate)
    } else {
        ShellExecTool::new(config.tool_timeout_secs)
    };
    registry.register(shell);

    // ... rest unchanged ...
}
```

**Modify `crates/agent/src/engine.rs`** — update `AgentEngine::new()` to accept `approval`:

```rust
pub fn new(
    provider: Arc<Provider>,
    pool: Arc<SqlitePool>,
    home_dir: PathBuf,
    brave_api_key: Option<String>,
    config: AgentConfig,
    approval: Option<Arc<dyn crate::tools::shell_exec::ToolApproval>>,
) -> Result<Self> {
    let deps = build_engine_deps(
        provider.clone(),
        pool,
        home_dir,
        brave_api_key,
        &config,
        approval,
    )?;
    // ... rest unchanged ...
}
```

Export `ToolApproval` from `crates/agent/src/lib.rs`:
```rust
pub use tools::shell_exec::ToolApproval;
```

### Step 5: Implement `ToolApproval` for `Arc<ApprovalGate>` in server crate

Add to `crates/server/src/approval_gate.rs`:

```rust
use rushdino_agent::ToolApproval;

#[async_trait::async_trait]
impl ToolApproval for ApprovalGate {
    async fn request_approval(&self, tool: &str, args: Value) -> Result<()> {
        self.request_approval(tool, args).await
    }
}
```

### Step 6: Wire gate in `crates/server/src/lib.rs`

After the existing `let engine = Arc::new(...)` line:

```rust
// Create the approval gate.
let (gate, _gate_rx_init) = ApprovalGate::new();
// Note: ws.rs subscribes per-connection via gate.subscribe(); _gate_rx_init is dropped.

let engine = Arc::new(AgentEngine::new(
    provider,
    pool.clone(),
    config.data_dir.clone(),
    credentials.brave_api_key.clone(),
    AgentConfig::default(),
    Some(gate.clone() as Arc<dyn rushdino_agent::ToolApproval>),
)?);
```

Update `AppState::new()` call to include `gate`:

```rust
let state = AppState::new(engine, config.clone(), webchat, gate);
```

Add import: `use crate::approval_gate::ApprovalGate;`

### Step 7: Run `cargo check --workspace`

```bash
cargo check --workspace
```
Expected: PASS

### Step 8: Update `ws.rs` to handle approval flow

Add to the `recv_task` in `ws.rs` — handle approval_response messages and subscribe to gate notifications:

Replace the `recv_task` and `send_task` in `ws.rs` with this revised handle_socket:

```rust
async fn handle_socket(socket: axum::extract::ws::WebSocket, state: AppState) {
    let client_id = Uuid::new_v4().to_string();
    let (mut ws_sink, mut ws_recv) = socket.split();

    let (chunk_tx, mut chunk_rx) = mpsc::channel::<serde_json::Value>(128);

    // Subscribe to approval requests for this connection.
    let mut gate_rx = state.gate.subscribe();

    // Task: forward chunk payloads AND approval requests to WebSocket.
    let mut send_task = tokio::spawn(async move {
        loop {
            tokio::select! {
                payload = chunk_rx.recv() => {
                    match payload {
                        Some(p) => {
                            if ws_sink.send(Message::Text(p.to_string())).await.is_err() {
                                break;
                            }
                        }
                        None => break,
                    }
                }
                approval_req = gate_rx.recv() => {
                    if let Ok(req) = approval_req {
                        let msg = serde_json::json!({
                            "type": "approval_request",
                            "request_id": req.request_id,
                            "tool": req.tool,
                            "args": req.args,
                        });
                        if ws_sink.send(Message::Text(msg.to_string())).await.is_err() {
                            break;
                        }
                    }
                }
            }
        }
    });

    let engine = state.engine.clone();
    let gate = state.gate.clone();
    let mut recv_task = tokio::spawn(async move {
        let mut active_conversation: Option<String> = None;

        while let Some(Ok(message)) = ws_recv.next().await {
            let Message::Text(text) = message else { continue };

            // Check for approval_response before treating as a chat message.
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&text) {
                if val.get("type").and_then(|t| t.as_str()) == Some("approval_response") {
                    let request_id = val.get("request_id").and_then(|v| v.as_str()).unwrap_or("");
                    let approved = val.get("approved").and_then(|v| v.as_bool()).unwrap_or(false);
                    gate.resolve(request_id, approved).await;
                    continue;
                }
            }

            let (conversation_id, user_text) =
                if let Ok(req) = serde_json::from_str::<WsChatRequest>(&text) {
                    (req.conversation_id.or_else(|| active_conversation.clone()), req.message)
                } else {
                    (active_conversation.clone(), text.to_string())
                };

            let (engine_tx, mut engine_rx) = mpsc::channel::<rushdino_providers::types::ChatChunk>(128);
            let chunk_fwd = chunk_tx.clone();

            tokio::spawn(async move {
                while let Some(ck) = engine_rx.recv().await {
                    let payload = serde_json::json!({
                        "delta": ck.delta,
                        "done": ck.done,
                    });
                    let _ = chunk_fwd.send(payload).await;
                }
            });

            match engine.stream_chat_via_ws(conversation_id, &user_text, engine_tx).await {
                Ok(conv_id) => { active_conversation = Some(conv_id); }
                Err(e) => {
                    tracing::error!("ws stream_chat_via_ws error: {e}");
                    let _ = chunk_tx.send(serde_json::json!({
                        "delta": format!("Error: {e}"),
                        "done": true,
                    })).await;
                }
            }
        }
    });

    tokio::select! {
        _ = &mut send_task => recv_task.abort(),
        _ = &mut recv_task => send_task.abort(),
    }

    state.webchat.disconnect(&client_id).await;
}
```

### Step 9: Add frontend `approval-card.tsx`

Create `frontend/src/components/chat/approval-card.tsx`:

```tsx
interface ApprovalCardProps {
  requestId: string;
  tool: string;
  args: Record<string, unknown>;
  onApprove: (requestId: string) => void;
  onDeny: (requestId: string) => void;
}

export function ApprovalCard({ requestId, tool, args, onApprove, onDeny }: ApprovalCardProps) {
  return (
    <div className="rounded-xl border border-yellow-400/40 bg-yellow-50/60 p-4">
      <p className="mb-1 font-semibold text-yellow-800">Tool approval required</p>
      <p className="mb-2 text-sm text-yellow-700">
        The agent wants to run <code className="rounded bg-yellow-100 px-1">{tool}</code>:
      </p>
      <pre className="mb-3 overflow-x-auto rounded bg-yellow-100 p-2 text-xs text-yellow-900">
        {JSON.stringify(args, null, 2)}
      </pre>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onApprove(requestId)}
          className="rounded-lg bg-green-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-green-700"
        >
          Approve
        </button>
        <button
          type="button"
          onClick={() => onDeny(requestId)}
          className="rounded-lg bg-red-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-700"
        >
          Deny
        </button>
      </div>
    </div>
  );
}
```

### Step 10: Update `frontend/src/lib/types.ts` for approval messages

Add to the existing types file (or create it if missing):

```typescript
export interface ApprovalRequest {
  type: 'approval_request';
  request_id: string;
  tool: string;
  args: Record<string, unknown>;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'approval';
  content: string;
  approvalRequest?: ApprovalRequest;
}
```

### Step 11: Update `use-websocket.ts` to handle approval_request messages

In `socket.onmessage`:

```typescript
socket.onmessage = (event) => {
  const data = JSON.parse(event.data);

  // Handle approval requests from the backend.
  if (data.type === 'approval_request') {
    setMessages((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        role: 'approval' as const,
        content: '',
        approvalRequest: data as ApprovalRequest,
      },
    ]);
    return;
  }

  // Existing streaming chunk handling.
  const chunk: ChatChunk = data;
  if (chunk.done) {
    setIsStreaming(false);
    return;
  }
  setMessages((current) => {
    const next = [...current];
    const last = next[next.length - 1];
    if (last && last.role === 'assistant') {
      last.content += chunk.delta;
      return [...next.slice(0, -1), last];
    }
    next.push({ id: crypto.randomUUID(), role: 'assistant', content: chunk.delta });
    return next;
  });
};
```

Add a `sendApproval` callback to the hook return:

```typescript
const sendApproval = useCallback((requestId: string, approved: boolean) => {
  socketRef.current?.send(
    JSON.stringify({ type: 'approval_response', request_id: requestId, approved }),
  );
  // Remove the approval card from the message list.
  setMessages((current) => current.filter((m) => m.approvalRequest?.request_id !== requestId));
}, []);

// Return in useMemo:
return useMemo(
  () => ({ messages, sendMessage, sendApproval, clearMessages, isConnected, isStreaming }),
  [messages, sendMessage, sendApproval, clearMessages, isConnected, isStreaming],
);
```

### Step 12: Update `message-list.tsx` to render approval cards

In the message rendering loop, handle `role === 'approval'`:

```tsx
import { ApprovalCard } from './approval-card';

// In the map:
{messages.map((msg) => {
  if (msg.role === 'approval' && msg.approvalRequest) {
    return (
      <ApprovalCard
        key={msg.id}
        requestId={msg.approvalRequest.request_id}
        tool={msg.approvalRequest.tool}
        args={msg.approvalRequest.args}
        onApprove={(id) => sendApproval(id, true)}
        onDeny={(id) => sendApproval(id, false)}
      />
    );
  }
  return <MessageBubble key={msg.id} message={msg} />;
})}
```

### Step 13: Run `cargo check --workspace`

```bash
cargo check --workspace
```
Expected: PASS

### Step 14: Run `cargo test --workspace`

```bash
cargo test --workspace
```
Expected: all existing tests pass

### Step 15: Build frontend and smoke test

```bash
cd frontend && npm run build && cd ..
cargo run -p rushdino-cli -- start --foreground
```

Open `http://localhost:3000`, send: "Run the command: echo hello". Verify:
- An approval card appears in the chat UI.
- Click "Approve" — the command runs and the output streams back.
- Click "Deny" — the agent receives a denial error and responds gracefully.

### Step 16: Commit

```bash
git add crates/server/src/approval_gate.rs crates/server/src/state.rs crates/server/src/lib.rs \
        crates/agent/src/tools/shell_exec.rs crates/agent/src/engine_bootstrap.rs \
        crates/agent/src/engine.rs crates/agent/src/lib.rs crates/server/src/ws.rs \
        frontend/src/components/chat/approval-card.tsx frontend/src/hooks/use-websocket.ts \
        frontend/src/components/chat/message-list.tsx frontend/src/lib/types.ts
git commit -m "feat: tool approval gate — shell_exec asks for user confirmation via WebSocket UI"
```

---

## Verification Checklist

After all three tasks:

```bash
cargo check --workspace          # zero errors
cargo test --workspace           # all tests pass
cargo build --release            # release build succeeds
```

Manual checks:
- [ ] Start server with Codex provider — check logs for "codex: access token near expiry, refreshing" if token was stale
- [ ] WebSocket chat — text appears word-by-word (streaming), not all at once
- [ ] Ask agent to run a shell command — approval card appears, approve → command runs, deny → error message
- [ ] Telegram/Discord/Slack routing still works (non-streaming gateway path untouched)
