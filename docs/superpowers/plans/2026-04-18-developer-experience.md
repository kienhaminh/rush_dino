# Developer Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the developer experience with OpenAPI documentation, live config hot-reload, tool sandboxing, and a useful status CLI command.

**Architecture:** OpenAPI uses utoipa to derive specs from existing types with minimal annotation overhead. Hot-reload uses the notify crate to watch the config file and triggers a targeted re-init via the existing `refresh_runtime_from_disk` path. Sandboxing adds pre-flight checks to `ShellExecTool` in `crates/agent/src/tools/bash.rs` leveraging the existing `ToolExecutionContext`. The status command enhances the existing `crates/cli/src/commands/status.rs` with richer output from new API endpoints.

**Tech Stack:** Rust, utoipa (OpenAPI), utoipa-swagger-ui, notify (file watch), axum, tokio, clap (CLI), reqwest

**Key existing patterns to follow:**
- `AppState` delegates to `RuntimeState` — use `state.runtime.config()` via `ArcSwap<AppConfig>`
- `refresh_runtime_from_disk` in `crates/server/src/provider_runtime.rs` is the canonical config reload path
- `ToolExecutionContext` (task-local in `crates/agent/src/tools/bash.rs`) carries per-execution metadata
- `LocalSystemBroker::execute_shell` in `crates/server/src/system_broker.rs` is where shell execution is dispatched
- CLI commands live in `crates/cli/src/commands/` and the `rushdino status` command already exists at `status.rs`

---

## Task 1: OpenAPI spec generation with utoipa

**Files to modify:**
- `Cargo.toml` (workspace) — add `utoipa` and `utoipa-swagger-ui` to `[workspace.dependencies]`
- `crates/server/Cargo.toml` — add those deps to `[dependencies]`
- `crates/server/src/lib.rs` — register `/api/openapi.json` and `/swagger` routes
- `crates/server/src/routes/runs.rs` — annotate `list_runs`, `get_run`
- `crates/server/src/routes/agents.rs` — annotate `list_agents`
- `crates/server/src/routes/workflows.rs` — annotate `list_workflows`
- Create: `crates/server/src/openapi.rs`

### Steps

- [ ] **1.1 Write a failing integration test** in `crates/server/tests/` (or add to existing `system_smoke.rs`) that:
  - Builds the app with `build_app(...)` using test fixtures
  - Issues `GET /api/openapi.json`
  - Asserts HTTP 200 and that the response body contains `"openapi"` and `"3.0"`

- [ ] **1.2 Add utoipa to workspace `Cargo.toml`:**

```toml
# In [workspace.dependencies]
utoipa = { version = "4", features = ["axum_extras"] }
utoipa-swagger-ui = { version = "7", features = ["axum"] }
```

- [ ] **1.3 Add utoipa to `crates/server/Cargo.toml`:**

```toml
# In [dependencies]
utoipa.workspace = true
utoipa-swagger-ui.workspace = true
```

- [ ] **1.4 Create `crates/server/src/openapi.rs`:**

```rust
//! OpenAPI specification assembled from utoipa-annotated routes.
//!
//! The `ApiDoc` struct is derived via `#[derive(OpenApi)]`. Route handler
//! annotations (`#[utoipa::path(...)]`) live beside their handler functions.
//! Add new paths/components here as the API grows.

use utoipa::OpenApi;

use crate::routes::{agents, runs, workflows};

#[derive(OpenApi)]
#[openapi(
    info(
        title = "RushDino API",
        version = "1.0.0",
        description = "Local-first AI agent platform — server-side REST API",
        contact(name = "RushDino Contributors", url = "https://github.com/rushdino"),
    ),
    paths(
        runs::list_runs,
        runs::get_run,
        runs::create_run,
        agents::list_agents,
        agents::get_agent,
        workflows::list_workflows,
        workflows::get_workflow,
    ),
    components(schemas(
        rushdino_agent::RunSnapshot,
        rushdino_agent::RunState,
        rushdino_agent::RunKind,
    )),
    tags(
        (name = "runs", description = "Agent run lifecycle"),
        (name = "agents", description = "Agent configuration"),
        (name = "workflows", description = "Workflow management"),
    )
)]
pub struct ApiDoc;
```

- [ ] **1.5 Annotate route handlers with `#[utoipa::path]`.**

Add the `utoipa::path` macro above each handler that is listed in `ApiDoc::paths(...)`. Example for `list_runs` in `crates/server/src/routes/runs.rs`:

```rust
/// List agent runs, optionally filtered by state, kind, or session.
#[utoipa::path(
    get,
    path = "/api/runs",
    tag = "runs",
    params(
        ("state" = Option<RunState>, Query, description = "Filter by run state"),
        ("kind"  = Option<RunKind>,  Query, description = "Filter by run kind"),
        ("limit" = Option<i64>,      Query, description = "Max results (default 50)"),
    ),
    responses(
        (status = 200, description = "Run list", body = serde_json::Value),
        (status = 500, description = "Internal server error"),
    )
)]
pub async fn list_runs(
    Query(query): Query<RunsQuery>,
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>> {
    // ... existing body unchanged
}
```

Apply the same pattern to `get_run`, `create_run`, `list_agents`, `get_agent`, `list_workflows`, `get_workflow`.

For types that utoipa needs to serialize into the spec (e.g. `RunSnapshot`, `RunState`), add `#[derive(utoipa::ToSchema)]` alongside their existing `Serialize`/`Deserialize` derives in `crates/agent/src/`.

- [ ] **1.6 Register routes in `crates/server/src/lib.rs`.**

Add the following import and route registration inside `build_app`:

```rust
use utoipa::OpenApi;
use utoipa_swagger_ui::SwaggerUi;

use crate::openapi::ApiDoc;

// In the router chain after all existing routes:
let router = router
    .route(
        "/api/openapi.json",
        get(|| async { axum::Json(ApiDoc::openapi()) }),
    )
    .merge(
        SwaggerUi::new("/swagger")
            .url("/api/openapi.json", ApiDoc::openapi()),
    );
```

`SwaggerUi` bundles its own static assets so no additional `rust-embed` setup is required.

- [ ] **1.7 Run the test and iterate until it passes:**

```bash
cargo test -p rushdino-server -- openapi
```

- [ ] **1.8 Manually verify Swagger UI** by running the server locally and visiting `http://localhost:3000/swagger`. Confirm the three resource groups (runs, agents, workflows) are visible.

- [ ] **1.9 Commit.**

---

## Task 2: Config hot-reload with file watcher

**Files to modify:**
- `crates/server/Cargo.toml` — add `notify`
- `crates/server/src/lib.rs` — call `spawn_config_watcher` after `build_app` in `start_server`
- Create: `crates/server/src/config_watcher.rs`

**Context:** The existing `refresh_runtime_from_disk(&runtime, mcp_manager, true)` function in `provider_runtime.rs` already handles re-reading config from disk and rebuilding the `AgentEngine`. The watcher only needs to detect the file change and call this function.

### Steps

- [ ] **2.1 Write a failing test** in `crates/server/src/config_watcher.rs` (or a `tests/` file) that:
  - Creates a temp config file with `AppConfig::default()` serialized to TOML
  - Constructs a minimal `Arc<RuntimeState>` with that path
  - Writes an updated config to the file (change `port` or a string field)
  - Waits up to 2 seconds for the watcher to fire
  - Asserts `runtime.config().port` reflects the new value

```rust
#[cfg(test)]
mod tests {
    use std::{sync::Arc, time::Duration};
    use tempfile::NamedTempFile;
    use tokio::time::timeout;

    #[tokio::test]
    async fn config_watcher_reloads_on_file_change() {
        // ... see full implementation in step 2.3
    }
}
```

- [ ] **2.2 Add `notify` to `crates/server/Cargo.toml`:**

```toml
notify = { version = "6", features = ["macos_kqueue"] }
```

- [ ] **2.3 Create `crates/server/src/config_watcher.rs`:**

```rust
//! File-system watcher that triggers live config reload when `config.toml` changes on disk.
//!
//! Uses the `notify` crate (kqueue on macOS, inotify on Linux). A 500 ms debounce
//! window coalesces rapid saves (e.g. editor write + format) into a single reload.
//! Reload is delegated to `refresh_runtime_from_disk` — the same path used by the
//! config PATCH API — so provider clients are re-initialized on credential changes.

use std::{path::PathBuf, sync::Arc, time::Duration};

use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use tokio::sync::mpsc;

use crate::{mcp_manager::McpManager, provider_runtime::refresh_runtime_from_disk, runtime_state::RuntimeState};

/// Spawn a background task that watches `config_path` and calls
/// `refresh_runtime_from_disk` whenever the file is modified.
///
/// The task runs for the lifetime of the process; it does not need to be
/// explicitly stopped. `mcp_manager` may be `None` in tests.
pub fn spawn_config_watcher(
    config_path: PathBuf,
    runtime: Arc<RuntimeState>,
    mcp_manager: Option<Arc<McpManager>>,
) {
    tokio::spawn(async move {
        if let Err(e) = watch_loop(config_path, runtime, mcp_manager).await {
            tracing::error!("config_watcher terminated unexpectedly: {e}");
        }
    });
}

async fn watch_loop(
    config_path: PathBuf,
    runtime: Arc<RuntimeState>,
    mcp_manager: Option<Arc<McpManager>>,
) -> notify::Result<()> {
    let (tx, mut rx) = mpsc::channel::<()>(1);

    // `RecommendedWatcher` must be held alive — drop ends the watch.
    let mut watcher: RecommendedWatcher = notify::recommended_watcher(move |res: notify::Result<Event>| {
        if let Ok(event) = res {
            // Only react to content modifications, not access/metadata changes.
            if matches!(event.kind, EventKind::Modify(_) | EventKind::Create(_)) {
                // Non-blocking send — if the channel already has a pending event
                // the debounce loop will catch it.
                let _ = tx.try_send(());
            }
        }
    })?;

    watcher.watch(&config_path, RecursiveMode::NonRecursive)?;
    tracing::info!("config_watcher: watching {:?}", config_path);

    while rx.recv().await.is_some() {
        // Debounce: wait 500 ms and drain any queued events before reloading.
        tokio::time::sleep(Duration::from_millis(500)).await;
        while rx.try_recv().is_ok() {}

        tracing::info!("config_watcher: change detected, reloading config");
        match refresh_runtime_from_disk(
            runtime.as_ref(),
            mcp_manager.as_deref(),
            // `true` = re-initialize optional services (e.g. KgGateway) if enabled.
            true,
        )
        .await
        {
            Ok(()) => tracing::info!("config_watcher: reload succeeded"),
            Err(e) => tracing::error!("config_watcher: reload failed — {e}"),
        }
    }

    Ok(())
}
```

- [ ] **2.4 Wire the watcher into `crates/server/src/lib.rs`.**

In the `start_server` function (or equivalent entry point that owns `RuntimeState`), after the `build_app(...)` call, add:

```rust
use crate::config_watcher::spawn_config_watcher;

// After build_app and before axum::serve:
spawn_config_watcher(
    config_path.clone(),
    Arc::clone(&runtime_state),
    Some(Arc::clone(&mcp_manager)),
);
```

Ensure `config_watcher` is declared as a module in `lib.rs`:

```rust
mod config_watcher;
```

- [ ] **2.5 Run tests:**

```bash
cargo test -p rushdino-server -- config_watcher
```

- [ ] **2.6 Manual smoke test:** Start the server, edit `~/.rushdino/config.toml` (change `default_profile_id` or any string field), observe the log line `config_watcher: reload succeeded` within 1 second.

- [ ] **2.7 Commit.**

---

## Task 3: Tool sandboxing for shell tools

**Files to modify:**
- `crates/agent/src/tools/bash.rs` — add `sandbox` to `ToolExecutionContext` and implement pre-flight check
- `crates/agent/src/context.rs` — if `ToolExecutionContext` is defined there (it is, in `bash.rs` — keep it there)
- `crates/server/src/system_broker.rs` — pass the new `sandbox` field through `ShellExecRequest`
- `crates/agent/src/system_broker.rs` — add `sandbox` to `ShellExecRequest` (check the trait definition in `crates/agent/src/`)

**Context:** `ToolExecutionContext` is a task-local struct in `crates/agent/src/tools/bash.rs`. `ShellExecRequest` is defined in `crates/agent/src/system_broker.rs` (or `engine_deps.rs` — confirm with grep). `LocalSystemBroker::execute_shell` in `crates/server/src/system_broker.rs` is where the actual `tokio::process::Command` is built.

### Steps

- [ ] **3.1 Locate `ShellExecRequest`:**

```bash
grep -rn "pub struct ShellExecRequest" crates/
```

Note the file path; all subsequent sandbox-related changes to the request struct go there.

- [ ] **3.2 Write a failing test** in `crates/agent/src/tools/bash.rs`:

```rust
#[tokio::test]
async fn sandbox_rejects_cwd_outside_agent_root() {
    use std::path::PathBuf;
    let broker = Arc::new(MockBroker::default());
    let tool = super::ShellExecTool::new(30, broker.clone());

    let result = super::with_tool_execution_context(
        ToolExecutionContext {
            session_id: Some("s".to_owned()),
            conversation_id: Some("c".to_owned()),
            run_id: Some("r".to_owned()),
            delegation_depth: 0,
            workspace_override: None,
            parent_context: None,
            ws_event_tx: None,
            sandbox: true,
            agent_root: PathBuf::from("/tmp/agent-workspace"),
        },
        tool.execute(serde_json::json!({
            "command": "pwd",
            "cwd": "/etc"   // outside agent_root
        })),
    )
    .await;

    assert!(result.is_err(), "sandbox should reject cwd outside agent root");
    let err_msg = result.unwrap_err().to_string();
    assert!(err_msg.contains("Sandbox violation"), "expected sandbox error, got: {err_msg}");
}

#[tokio::test]
async fn sandbox_allows_cwd_inside_agent_root() {
    use std::path::PathBuf;
    let broker = Arc::new(MockBroker::default());
    let tool = super::ShellExecTool::new(30, broker.clone());

    let result = super::with_tool_execution_context(
        ToolExecutionContext {
            session_id: Some("s".to_owned()),
            conversation_id: Some("c".to_owned()),
            run_id: Some("r".to_owned()),
            delegation_depth: 0,
            workspace_override: None,
            parent_context: None,
            ws_event_tx: None,
            sandbox: true,
            agent_root: PathBuf::from("/tmp/agent-workspace"),
        },
        tool.execute(serde_json::json!({
            "command": "pwd",
            "cwd": "/tmp/agent-workspace/subdir"  // inside agent_root
        })),
    )
    .await;

    assert!(result.is_ok(), "sandbox should allow cwd inside agent root");
}
```

- [ ] **3.3 Add `sandbox` and `agent_root` fields to `ToolExecutionContext`:**

```rust
#[derive(Debug, Clone)]
pub struct ToolExecutionContext {
    pub session_id: Option<String>,
    pub conversation_id: Option<String>,
    pub run_id: Option<String>,
    pub delegation_depth: u8,
    pub workspace_override: Option<PathBuf>,
    pub parent_context: Option<String>,
    pub ws_event_tx: Option<mpsc::Sender<WsStreamEvent>>,
    /// When `true`, shell tool execution is restricted to `agent_root` and
    /// output is capped at 64 KB.
    pub sandbox: bool,
    /// The agent's workspace root directory. Used by sandbox checks to allow
    /// or reject a requested working directory. Defaults to the engine workspace.
    pub agent_root: PathBuf,
}
```

Update the `Default`-equivalent construction sites and the `default_delegation_depth_is_zero` test to include the new fields (`sandbox: false`, `agent_root: PathBuf::default()`).

- [ ] **3.4 Implement `check_sandbox` in `crates/agent/src/tools/bash.rs`:**

```rust
/// Pre-flight sandbox check. Returns an error if the requested working
/// directory is outside the agent root. No-op when `ctx.sandbox` is false.
fn check_sandbox(ctx: &ToolExecutionContext, cwd: &std::path::Path) -> Result<()> {
    if !ctx.sandbox {
        return Ok(());
    }

    let canonical_cwd = cwd.canonicalize().unwrap_or_else(|_| cwd.to_path_buf());
    let canonical_root = ctx
        .agent_root
        .canonicalize()
        .unwrap_or_else(|_| ctx.agent_root.clone());

    if !canonical_cwd.starts_with(&canonical_root) {
        return Err(AppError::Validation(format!(
            "Sandbox violation: working directory '{}' is outside agent root '{}'. \
             Sandbox mode restricts execution to the agent workspace.",
            canonical_cwd.display(),
            canonical_root.display(),
        )));
    }
    Ok(())
}
```

- [ ] **3.5 Call `check_sandbox` and cap output in `ShellExecTool::execute`:**

In the `execute` method of `ShellExecTool`, after resolving `cwd` and before dispatching to the broker:

```rust
let cwd = args.get("cwd").and_then(Value::as_str).map(PathBuf::from);
let context = current_tool_execution_context();

// Sandbox pre-flight: check before any I/O.
if let (Some(ctx), Some(cwd_path)) = (context.as_ref(), cwd.as_ref()) {
    check_sandbox(ctx, cwd_path)?;
}

let result = self
    .broker
    .execute_shell(ShellExecRequest {
        command: command.to_owned(),
        host_cwd: cwd,
        timeout_secs: self.timeout_secs,
        session_id: context.as_ref().and_then(|ctx| ctx.session_id.clone()),
        conversation_id: context.as_ref().and_then(|ctx| ctx.conversation_id.clone()),
        run_id: context.and_then(|ctx| ctx.run_id),
    })
    .await?;

// Cap output at 64 KB when running in sandbox mode.
const MAX_OUTPUT: usize = 64 * 1024;
let (stdout, stderr) = if context.as_ref().map(|c| c.sandbox).unwrap_or(false) {
    let s = if result.stdout.len() > MAX_OUTPUT {
        format!(
            "{}... [truncated at 64KB]",
            &result.stdout[..MAX_OUTPUT]
        )
    } else {
        result.stdout.clone()
    };
    let e = if result.stderr.len() > MAX_OUTPUT {
        format!(
            "{}... [truncated at 64KB]",
            &result.stderr[..MAX_OUTPUT]
        )
    } else {
        result.stderr.clone()
    };
    (s, e)
} else {
    (result.stdout.clone(), result.stderr.clone())
};

Ok(format!(
    "status: {}\ncwd: {}\nstdout:\n{}\nstderr:\n{}",
    result.exit_status,
    result.cwd.display(),
    stdout,
    stderr,
))
```

Note: `context` is consumed before the branch above. Adjust to clone or re-read as needed to avoid a borrow-after-move.

- [ ] **3.6 Update all `ToolExecutionContext` construction sites** to include `sandbox: false` and `agent_root: <engine workspace path>`. The engine workspace is available via `AppConfig::data_dir` or the per-agent workspace. Use `PathBuf::from(rushdino_common::init::canonical_home_dir())` as a sensible default when no per-agent workspace is configured.

Search for all sites:

```bash
grep -rn "ToolExecutionContext {" crates/
```

- [ ] **3.7 Run tests:**

```bash
cargo test -p rushdino-agent -- sandbox
cargo test -p rushdino-agent -- bash
```

- [ ] **3.8 Commit.**

---

## Task 4: `rushdino status` CLI enhancements

**Files to modify:**
- `crates/cli/src/commands/status.rs` — enhance the existing `run()` function
- `crates/server/src/routes/health.rs` — optionally extend the `/healthz` response body
- `crates/server/src/routes/runs.rs` — already exposes `/api/runs?state=running` (use `RunState`)
- `crates/server/src/routes/config.rs` — already exposes `/api/config` for profile info

**Context:** The `rushdino status` subcommand already exists and is registered in `main.rs`. The existing implementation queries `/healthz` for basic health. We will enhance it to also show active run count, connected channels, provider profiles, and the config file path. No new server routes are needed — all data is already accessible via existing endpoints.

### Steps

- [ ] **4.1 Write a test** in `crates/cli/src/main_tests.rs` or a new `crates/cli/tests/` file:

```rust
// Integration test: start a test server, run status command, verify output format.
// Uses `axum::serve` with a `TcpListener::bind("127.0.0.1:0")` to get a random port.
#[tokio::test]
async fn status_command_shows_server_info() {
    // Minimal test: verify the status command parses without error and
    // produces expected field labels when server is unreachable.
    let result = status_output_for_url("http://127.0.0.1:1").await;
    // When server is down, expect a graceful "not running" message, not a panic.
    assert!(result.contains("not running") || result.contains("unreachable") || result.contains("error"));
}
```

- [ ] **4.2 Add `reqwest` feature flags** if not already present (already in workspace deps).

- [ ] **4.3 Enhance `crates/cli/src/commands/status.rs`:**

```rust
//! `rushdino status` — print server health, active runs, channels, providers,
//! and config file path in a human-readable format.

use colored::Colorize;

use rushdino_common::{AppConfig, Result};

pub async fn run() -> Result<()> {
    let manager = crate::service::detect()?;

    if !manager.is_running() {
        println!("{}", "RushDino is not running".yellow());
        return Ok(());
    }

    println!("{}", manager.status_line());

    let config = AppConfig::load()?;
    let base_url = format!("http://{}:{}", config.host, config.port);
    let config_path = AppConfig::config_path()?;

    // --- Health ---
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .unwrap_or_default();

    match client.get(format!("{base_url}/healthz")).send().await {
        Ok(res) if res.status().is_success() => {
            if let Ok(health) = res.json::<serde_json::Value>().await {
                let status = health["status"].as_str().unwrap_or("unknown");
                let uptime = health["uptime_secs"].as_u64().unwrap_or(0);
                let provider = health["provider"].as_str().unwrap_or("none");
                let profile = health["effective_profile_id"]
                    .as_str()
                    .unwrap_or("none");

                println!();
                println!("{}", "Server".bold());
                println!("  status:   {}", colorize_status(status));
                println!("  uptime:   {}", format_uptime(uptime));
                println!("  provider: {provider}  (profile: {profile})");
            }
        }
        Ok(res) => {
            println!("  {} (HTTP {})", "server degraded".red(), res.status());
        }
        Err(e) => {
            println!("  {} — {e}", "server unreachable".red());
            return Ok(());
        }
    }

    // --- Active runs ---
    if let Ok(res) = client
        .get(format!("{base_url}/api/runs?state=running&limit=200"))
        .send()
        .await
    {
        if let Ok(body) = res.json::<serde_json::Value>().await {
            let count = body["items"]
                .as_array()
                .map(|a| a.len())
                .unwrap_or(0);
            println!();
            println!("{}", "Runs".bold());
            println!("  active: {count}");
        }
    }

    // --- Provider profiles ---
    if let Ok(res) = client
        .get(format!("{base_url}/api/config"))
        .send()
        .await
    {
        if let Ok(body) = res.json::<serde_json::Value>().await {
            let profiles = body["profiles"].as_array();
            let default_id = body["default_profile_id"].as_str().unwrap_or("none");
            println!();
            println!("{}", "Provider profiles".bold());
            println!("  default: {default_id}");
            if let Some(profiles) = profiles {
                for p in profiles {
                    let id = p["id"].as_str().unwrap_or("?");
                    let name = p["name"].as_str().unwrap_or("?");
                    let kind = p["provider_kind"].as_str().unwrap_or("?");
                    let marker = if id == default_id { " *" } else { "" };
                    println!("  - {id} ({name}, {kind}){marker}");
                }
            }
        }
    }

    // --- Config file path ---
    println!();
    println!("{}", "Config".bold());
    println!("  path: {}", config_path.display());

    Ok(())
}

fn colorize_status(status: &str) -> colored::ColoredString {
    match status {
        "ok"      => status.green(),
        "degraded" => status.yellow(),
        _          => status.red(),
    }
}

fn format_uptime(secs: u64) -> String {
    if secs < 60 {
        format!("{secs}s")
    } else if secs < 3600 {
        format!("{}m {}s", secs / 60, secs % 60)
    } else {
        format!("{}h {}m", secs / 3600, (secs % 3600) / 60)
    }
}
```

The `reqwest` import requires adding it to `crates/cli/src/commands/status.rs` at the top. `reqwest` is already in the CLI crate's `Cargo.toml`.

- [ ] **4.4 Update `build_app` to expose active-runs count via `/api/runs`.**

The `list_runs` route already exists and accepts `?state=running&limit=200`. No server changes needed. Confirm the query parameter name matches `RunState` serialization (`"running"` in lowercase):

```bash
grep -n "Running\|running" crates/agent/src/engine.rs | head -10
```

If `RunState` serializes as `"Running"` (capitalized), update the CLI query string accordingly.

- [ ] **4.5 Run tests:**

```bash
cargo test -p rushdino-cli
cargo build -p rushdino-cli
./target/debug/rushdino status   # manual verification when server is up
```

Expected output format:
```
RushDino is running (pid 12345)

Server
  status:   ok
  uptime:   2h 14m
  provider: anthropic  (profile: claude-3-7)

Runs
  active: 3

Provider profiles
  default: claude-3-7
  - claude-3-7 (Claude 3.7, anthropic) *
  - ollama-local (Ollama Local, ollama)

Config
  path: /Users/kien.ha/.rushdino/config.toml
```

- [ ] **4.6 Commit.**

---

## Completion Checklist

Before declaring the branch ready for review, verify:

- [ ] All four tasks have green tests: `cargo test -p rushdino-server -p rushdino-agent -p rushdino-cli`
- [ ] `cargo clippy --workspace -- -D warnings` passes with no new warnings
- [ ] `GET /api/openapi.json` returns valid OpenAPI 3.0 JSON
- [ ] `GET /swagger` loads Swagger UI in the browser
- [ ] Editing `~/.rushdino/config.toml` while the server runs triggers the `config_watcher: reload succeeded` log within 1 s
- [ ] Shell tool with `sandbox=true` and `cwd` outside `agent_root` returns a `Sandbox violation` error
- [ ] `rushdino status` shows server health, active run count, provider profiles, and config path
