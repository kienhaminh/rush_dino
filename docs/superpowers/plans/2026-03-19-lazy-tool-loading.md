# Lazy Tool Loading Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Inject only core tools into the system prompt and provider API schemas; all other tools are activated on demand via `tool_search`.

**Architecture:** Add `SessionToolContext` to `tool_registry.rs` — a per-engine struct holding the full tool pool and an active subset. `engine_deps.rs` constructs it with a hardcoded core list and wires it through `EngineDeps` into `AgentEngine`, `engine_bootstrap`, and `react_loop`. The `tool_search` tool (already partially written) is wired in and enhanced to search by name, description, and keywords.

**Tech Stack:** Rust, `std::sync::RwLock`, `std::sync::Arc`/`Weak`, existing `ToolRegistry` + `Tool` trait.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `crates/agent/src/tool_registry.rs` | Modify | Add `keywords()` to `Tool` trait; add `all_tools()` to `ToolRegistry`; new `SessionToolContext` struct |
| `crates/agent/src/tools/mod.rs` | Modify | Add `pub mod tool_search` |
| `crates/agent/src/tools/tool_search.rs` | Modify | Implement enhanced search across name + description + keywords |
| `crates/agent/src/engine_deps.rs` | Modify | Add `CORE_TOOLS`; build `SessionToolContext`; register `ToolSearchTool`; add `session_ctx` to `EngineDeps` |
| `crates/agent/src/engine.rs` | Modify | Add `session_ctx` to `AgentEngine`; thread it into all callers |
| `crates/agent/src/engine_bootstrap.rs` | Modify | Accept `&SessionToolContext` instead of `&ToolRegistry`; call `active_definitions()` |
| `crates/agent/src/react_loop.rs` | Modify | Accept `Arc<SessionToolContext>`; use `active_definitions()` in `build_chat_request` |
| `crates/agent/src/system_prompt.rs` | Modify | Add `tool_search` hint line in `build_tooling_section` |
| Selected tool impl files | Modify | Add `keywords()` overrides for discoverability |

---

### Task 1: Add `keywords()` to `Tool` trait, `all_tools()` to `ToolRegistry`, and `SessionToolContext`

**Files:**
- Modify: `crates/agent/src/tool_registry.rs`

- [ ] **Step 1.1: Write failing tests for `SessionToolContext`**

Append to the bottom of `crates/agent/src/tool_registry.rs`:

```rust
#[cfg(test)]
mod session_ctx_tests {
    use super::*;
    use async_trait::async_trait;
    use serde_json::{json, Value};

    struct FakeTool {
        n: &'static str,
        desc: &'static str,
        kw: Vec<&'static str>,
    }
    #[async_trait]
    impl Tool for FakeTool {
        fn name(&self) -> &str { self.n }
        fn description(&self) -> &str { self.desc }
        fn keywords(&self) -> Vec<&str> { self.kw.clone() }
        fn parameters(&self) -> Value { json!({}) }
        async fn execute(&self, _: Value) -> rushdino_common::Result<String> { Ok(String::new()) }
    }

    fn make_pool() -> Vec<Arc<dyn Tool>> {
        vec![
            Arc::new(FakeTool { n: "read", desc: "Read a file", kw: vec![] }),
            Arc::new(FakeTool { n: "cron_create", desc: "Create a cron job", kw: vec!["schedule", "recurring"] }),
            Arc::new(FakeTool { n: "web_search", desc: "Search the web", kw: vec!["internet", "browse"] }),
        ]
    }

    #[test]
    fn active_starts_with_core_names() {
        let ctx = SessionToolContext::new(make_pool(), &["read"]);
        let defs = ctx.active_definitions();
        assert_eq!(defs.len(), 1);
        assert_eq!(defs[0].name, "read");
    }

    #[test]
    fn search_by_name() {
        let ctx = SessionToolContext::new(make_pool(), &[]);
        let results = ctx.search_pool("cron");
        assert!(results.iter().any(|d| d.name == "cron_create"));
    }

    #[test]
    fn search_by_description() {
        let ctx = SessionToolContext::new(make_pool(), &[]);
        let results = ctx.search_pool("web");
        assert!(results.iter().any(|d| d.name == "web_search"));
    }

    #[test]
    fn search_by_keyword() {
        let ctx = SessionToolContext::new(make_pool(), &[]);
        let results = ctx.search_pool("recurring");
        assert!(results.iter().any(|d| d.name == "cron_create"));
    }

    #[test]
    fn search_case_insensitive() {
        let ctx = SessionToolContext::new(make_pool(), &[]);
        let results = ctx.search_pool("SCHEDULE");
        assert!(results.iter().any(|d| d.name == "cron_create"));
    }

    #[test]
    fn activate_returns_true_first_time() {
        let ctx = SessionToolContext::new(make_pool(), &[]);
        assert!(ctx.activate("cron_create"));
    }

    #[test]
    fn activate_returns_false_if_already_active() {
        let ctx = SessionToolContext::new(make_pool(), &["read"]);
        assert!(!ctx.activate("read"));
    }

    #[test]
    fn activate_nonexistent_tool_returns_false() {
        let ctx = SessionToolContext::new(make_pool(), &[]);
        assert!(!ctx.activate("does_not_exist"));
    }

    #[test]
    fn empty_query_returns_empty() {
        let ctx = SessionToolContext::new(make_pool(), &[]);
        let results = ctx.search_pool("");
        assert!(results.is_empty());
    }
}
```

- [ ] **Step 1.2: Run tests to verify they fail**

```bash
cargo test -p rushdino-agent session_ctx_tests 2>&1 | tail -20
```

Expected: compile error — `SessionToolContext` not found, `keywords()` not in trait.

- [ ] **Step 1.3: Add `keywords()` to `Tool` trait and `all_tools()` to `ToolRegistry`**

In `crates/agent/src/tool_registry.rs`, update the `Tool` trait to add `keywords()` with a default:

```rust
#[async_trait]
pub trait Tool: Send + Sync {
    fn name(&self) -> &str;
    fn description(&self) -> &str;
    fn parameters(&self) -> Value;
    async fn execute(&self, args: Value) -> Result<String>;

    /// Optional keywords that improve tool_search discoverability.
    fn keywords(&self) -> Vec<&str> {
        vec![]
    }
}
```

Add `all_tools()` to `ToolRegistry` after `names()`:

```rust
pub fn all_tools(&self) -> Vec<Arc<dyn Tool>> {
    self.tools
        .read()
        .expect("tool registry lock poisoned")
        .values()
        .cloned()
        .collect()
}
```

- [ ] **Step 1.4: Add `SessionToolContext`**

Add after `ToolRegistry` impl block, before `#[cfg(test)]`:

```rust
/// Per-engine session context: holds all tools in the pool and tracks which are active.
///
/// Activation controls visibility in the system prompt and provider API schemas only.
/// Any tool in the pool can always be executed even if not active.
pub struct SessionToolContext {
    pool: Vec<Arc<dyn Tool>>,
    active: RwLock<HashSet<String>>,
}

impl SessionToolContext {
    /// Create a new context. `core_names` are immediately active; all others are inactive.
    pub fn new(pool: Vec<Arc<dyn Tool>>, core_names: &[&str]) -> Self {
        let active: HashSet<String> = pool
            .iter()
            .filter(|t| core_names.contains(&t.name()))
            .map(|t| t.name().to_owned())
            .collect();
        Self {
            pool,
            active: RwLock::new(active),
        }
    }

    /// Search the pool by name, description, and keywords (case-insensitive substring).
    /// Returns matching tool definitions. Empty query returns nothing.
    pub fn search_pool(&self, query: &str) -> Vec<ToolDefinition> {
        let q = query.trim().to_lowercase();
        if q.is_empty() {
            return vec![];
        }
        self.pool
            .iter()
            .filter(|t| {
                let name = t.name().to_lowercase();
                let desc = t.description().to_lowercase();
                let kws: Vec<String> = t.keywords().iter().map(|k| k.to_lowercase()).collect();
                name.contains(&q)
                    || desc.contains(&q)
                    || kws.iter().any(|k| k.contains(&q))
            })
            .map(|t| ToolDefinition {
                name: t.name().to_owned(),
                description: t.description().to_owned(),
                parameters: t.parameters(),
            })
            .collect()
    }

    /// Activate a tool by name. Returns true if newly activated, false if already active
    /// or not found in the pool.
    pub fn activate(&self, name: &str) -> bool {
        let exists = self.pool.iter().any(|t| t.name() == name);
        if !exists {
            return false;
        }
        self.active
            .write()
            .expect("active set lock poisoned")
            .insert(name.to_owned())
    }

    /// Definitions for currently active tools, sorted by name.
    pub fn active_definitions(&self) -> Vec<ToolDefinition> {
        let active = self.active.read().expect("active set lock poisoned");
        let mut defs: Vec<ToolDefinition> = self
            .pool
            .iter()
            .filter(|t| active.contains(t.name()))
            .map(|t| ToolDefinition {
                name: t.name().to_owned(),
                description: t.description().to_owned(),
                parameters: t.parameters(),
            })
            .collect();
        defs.sort_by(|a, b| a.name.cmp(&b.name));
        defs
    }
}
```

Add `HashSet` to imports at the top of the file:

```rust
use std::{
    collections::{HashMap, HashSet},
    sync::{Arc, RwLock},
};
```

- [ ] **Step 1.5: Run tests — expect pass**

```bash
cargo test -p rushdino-agent session_ctx_tests 2>&1 | tail -20
```

Expected: all 9 tests pass.

- [ ] **Step 1.6: Verify full crate still compiles**

```bash
cargo check -p rushdino-agent 2>&1 | tail -10
```

Expected: `Finished` with no errors.

- [ ] **Step 1.7: Commit**

```bash
git add crates/agent/src/tool_registry.rs
git commit -m "feat(agent): add SessionToolContext, keywords() to Tool trait, all_tools() to ToolRegistry"
```

---

### Task 2: Wire `tool_search` module and implement enhanced search

**Files:**
- Modify: `crates/agent/src/tools/mod.rs`
- Modify: `crates/agent/src/tools/tool_search.rs`

- [ ] **Step 2.1: Add `pub mod tool_search` to `tools/mod.rs`**

Append to `crates/agent/src/tools/mod.rs`:

```rust
pub mod tool_search;
```

- [ ] **Step 2.2: Run compile check — expect error**

```bash
cargo check -p rushdino-agent 2>&1 | grep "error" | head -10
```

Expected: error `cannot find type SessionToolContext in module crate::tool_registry` — the file is now compiled but `SessionToolContext` doesn't exist yet. (It will exist after Task 1.)

> **Note:** `tool_search.rs` already contains a partial implementation. Step 2.3 fully replaces it.

- [ ] **Step 2.3: Replace full contents of `tool_search.rs` with enhanced implementation**

Replace the entire file `crates/agent/src/tools/tool_search.rs`:

```rust
use std::sync::Weak;

use async_trait::async_trait;
use serde_json::{json, Value};

use rushdino_common::{AppError, Result};

use crate::tool_registry::{SessionToolContext, Tool};

/// Lets the LLM discover and activate tools from the pool on demand.
///
/// Holds `Weak<SessionToolContext>` to avoid a retain cycle:
/// `SessionToolContext.pool → ToolSearchTool → SessionToolContext`.
pub struct ToolSearchTool {
    session_ctx: Weak<SessionToolContext>,
}

impl ToolSearchTool {
    pub fn new(session_ctx: Weak<SessionToolContext>) -> Self {
        Self { session_ctx }
    }
}

#[async_trait]
impl Tool for ToolSearchTool {
    fn name(&self) -> &str {
        "tool_search"
    }

    fn description(&self) -> &str {
        "Search the tool pool by keyword and activate matching tools for this session. \
        Searches tool names, descriptions, and keywords. \
        Activated tools become available immediately in subsequent turns."
    }

    fn parameters(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Keyword(s) to search for. Matched against tool name, description, and keywords."
                }
            },
            "required": ["query"]
        })
    }

    async fn execute(&self, args: Value) -> Result<String> {
        let ctx = self
            .session_ctx
            .upgrade()
            .ok_or_else(|| AppError::Agent("session context unavailable".to_owned()))?;

        let query = args
            .get("query")
            .and_then(Value::as_str)
            .ok_or_else(|| AppError::Validation("query is required".to_owned()))?;

        let matches = ctx.search_pool(query);
        if matches.is_empty() {
            return Ok(format!("No tools found for '{query}'"));
        }

        let mut activated = Vec::new();
        let mut already_active = Vec::new();

        for m in &matches {
            if ctx.activate(&m.name) {
                activated.push(format!("{} — {}", m.name, m.description));
            } else {
                already_active.push(m.name.clone());
            }
        }

        let mut parts = Vec::new();
        if !activated.is_empty() {
            parts.push(format!(
                "Activated {} tool(s):\n{}",
                activated.len(),
                activated.join("\n")
            ));
        }
        if !already_active.is_empty() {
            parts.push(format!(
                "Already active: {}",
                already_active.join(", ")
            ));
        }

        Ok(parts.join("\n\n"))
    }
}
```

- [ ] **Step 2.4: Verify compile**

```bash
cargo check -p rushdino-agent 2>&1 | tail -10
```

Expected: `Finished` with no errors (tool_search is wired, SessionToolContext exists).

- [ ] **Step 2.5: Commit**

```bash
git add crates/agent/src/tools/mod.rs crates/agent/src/tools/tool_search.rs
git commit -m "feat(agent): wire tool_search module with enhanced name/description/keyword search"
```

---

### Task 3: Update `engine_deps.rs` — build `SessionToolContext`, register `ToolSearchTool`

**Files:**
- Modify: `crates/agent/src/engine_deps.rs`

- [ ] **Step 3.1: Add imports to `engine_deps.rs`**

Find the existing imports block and add:

```rust
use std::sync::{Arc, Weak};
```

(If `Arc` is already imported, just add `Weak`.)

Also add to the `crate::` imports:

```rust
tool_registry::SessionToolContext,
tools::tool_search::ToolSearchTool,
```

- [ ] **Step 3.2: Add `CORE_TOOLS` constant**

Add at the top of the file, after the imports:

```rust
const CORE_TOOLS: &[&str] = &[
    "delegate",
    "edit",
    "exec",
    "memory_search",
    "memory_write",
    "message",
    "read",
    "tool_search",
    "write",
];
```

- [ ] **Step 3.3: Add `session_ctx` field to `EngineDeps`**

In the `EngineDeps` struct, add:

```rust
pub session_ctx: Arc<SessionToolContext>,
```

- [ ] **Step 3.4: Build `SessionToolContext` at end of `build_engine_deps`**

At the end of `build_engine_deps`, just before the `Ok(EngineDeps { ... })` block, add:

```rust
// Build SessionToolContext with Arc::new_cyclic so ToolSearchTool can hold
// a Weak reference back to the context without a retain cycle:
// SessionToolContext.pool → Arc<ToolSearchTool> → Weak<SessionToolContext>.
let session_ctx = Arc::new_cyclic(|weak: &Weak<SessionToolContext>| {
    let tool_search = ToolSearchTool::new(weak.clone());
    registry.register(tool_search);
    let pool = registry.all_tools();
    SessionToolContext::new(pool, CORE_TOOLS)
});
```

- [ ] **Step 3.5: Add `session_ctx` to the `EngineDeps` return value**

In the `Ok(EngineDeps { ... })` block, add:

```rust
session_ctx,
```

- [ ] **Step 3.6: Verify compile**

```bash
cargo check -p rushdino-agent 2>&1 | tail -10
```

Expected: `Finished` (possibly with warnings about unused `session_ctx` field — that's fine, we'll wire it next).

- [ ] **Step 3.7: Commit**

```bash
git add crates/agent/src/engine_deps.rs
git commit -m "feat(agent): build SessionToolContext in engine_deps, register ToolSearchTool"
```

---

### Task 4: Thread `session_ctx` through `AgentEngine`

**Files:**
- Modify: `crates/agent/src/engine.rs`

- [ ] **Step 4.1: Add `session_ctx` field to `AgentEngine`**

In the `AgentEngine` struct, add:

```rust
session_ctx: Arc<SessionToolContext>,
```

Add the import to the `use crate::` block:

```rust
tool_registry::SessionToolContext,
```

- [ ] **Step 4.2: Assign `session_ctx` in `AgentEngine::new` (or `from_deps`)**

In the `Ok(Self { ... })` constructor block, add:

```rust
session_ctx: deps.session_ctx,
```

- [ ] **Step 4.3: Update all `system_message` call sites**

Find every call to `system_message(...)` in `engine.rs` (there are 3, at lines ~290, ~424, ~993). Change each one from:

```rust
system_message(
    &self.config,
    self.memory.as_ref(),
    self.agent_manager.as_ref(),
    self.skill_manager.as_ref(),
    self.tool_registry.as_ref(),
)
```

to:

```rust
system_message(
    &self.config,
    self.memory.as_ref(),
    self.agent_manager.as_ref(),
    self.skill_manager.as_ref(),
    self.session_ctx.as_ref(),
)
```

- [ ] **Step 4.4: Update `tool_registry()` accessor if it exists**

If `engine.rs` has `pub fn tool_registry(&self) -> &ToolRegistry`, leave it unchanged — it's used by the server routes and does not need to change (execution still goes through the registry).

> **Note:** Do NOT update `run_react_loop` call sites yet — the function signatures are updated in Task 6 first, then callers are updated in Step 6.5. Updating callers before signatures would leave the code in a non-compiling state.

- [ ] **Step 4.5: Verify compile — expect errors only in `engine_bootstrap.rs`**

```bash
cargo check -p rushdino-agent 2>&1 | grep "error" | head -10
```

Expected: type mismatch on `system_message` calls (still expects `&ToolRegistry`). Fixed in Task 5.

- [ ] **Step 4.6: Commit**

```bash
git add crates/agent/src/engine.rs
git commit -m "feat(agent): add session_ctx field to AgentEngine, update system_message call sites"
```

---

### Task 5: Update `engine_bootstrap.rs` to use `SessionToolContext`

**Files:**
- Modify: `crates/agent/src/engine_bootstrap.rs`

- [ ] **Step 5.1: Update import in `engine_bootstrap.rs`**

Replace:

```rust
tool_registry::ToolRegistry,
```

with:

```rust
tool_registry::SessionToolContext,
```

- [ ] **Step 5.2: Update `system_message` signature and body**

Change the function signature from:

```rust
pub fn system_message(
    config: &AgentConfig,
    memory: &MemoryManager,
    agent_manager: &AgentManager,
    skill_manager: &SkillManager,
    tool_registry: &ToolRegistry,
) -> Message {
```

to:

```rust
pub fn system_message(
    config: &AgentConfig,
    memory: &MemoryManager,
    agent_manager: &AgentManager,
    skill_manager: &SkillManager,
    session_ctx: &SessionToolContext,
) -> Message {
```

Change the body from:

```rust
let mut tool_defs = tool_registry.definitions();
tool_defs.sort_by(|a, b| a.name.cmp(&b.name));
```

to:

```rust
let tool_defs = session_ctx.active_definitions(); // already sorted
```

- [ ] **Step 5.3: Verify compile**

```bash
cargo check -p rushdino-agent 2>&1 | grep "error" | head -10
```

Expected: only `react_loop.rs` errors remain.

- [ ] **Step 5.4: Commit**

```bash
git add crates/agent/src/engine_bootstrap.rs
git commit -m "feat(agent): engine_bootstrap uses SessionToolContext.active_definitions() for system prompt"
```

---

### Task 6: Update `react_loop.rs` to use `SessionToolContext`

**Files:**
- Modify: `crates/agent/src/react_loop.rs`

- [ ] **Step 6.1: Update imports**

Add `SessionToolContext` to the existing `tool_registry` import line:

```rust
tool_registry::{SessionToolContext, ToolRegistry},
```

Keep `ToolRegistry` — it is still used for tool execution (`registry.get(&call.name)`) and in the test module at the bottom of the file.

- [ ] **Step 6.2: Update `build_chat_request` signature and body**

Change from:

```rust
fn build_chat_request(
    messages: Vec<Message>,
    registry: &ToolRegistry,
    config: &AgentConfig,
) -> ChatRequest {
    ChatRequest {
        messages,
        tools: Some(registry.definitions()),
        ...
    }
}
```

to:

```rust
fn build_chat_request(
    messages: Vec<Message>,
    session_ctx: &SessionToolContext,
    config: &AgentConfig,
) -> ChatRequest {
    ChatRequest {
        messages,
        tools: Some(session_ctx.active_definitions()),
        ...
    }
}
```

- [ ] **Step 6.3: Update `run_react_loop` signature**

Change from:

```rust
pub async fn run_react_loop(
    ...,
    registry: Arc<ToolRegistry>,
    ...
) -> ...
```

to:

```rust
pub async fn run_react_loop(
    ...,
    session_ctx: Arc<SessionToolContext>,
    ...
) -> ...
```

Update the body: replace `build_chat_request(input.clone(), &registry, config)` with `build_chat_request(input.clone(), &session_ctx, config)`.

The tool execution line (`registry.get(&call.name)`) must still use the `ToolRegistry`. Pass `registry: Arc<ToolRegistry>` as a separate parameter OR keep it accessible. The simplest approach: keep `registry` as a parameter alongside `session_ctx`:

```rust
pub async fn run_react_loop(
    ...,
    registry: Arc<ToolRegistry>,
    session_ctx: Arc<SessionToolContext>,
    ...
) -> ...
```

Then update callers in `engine.rs` to pass both `self.tool_registry.clone()` and `self.session_ctx.clone()`.

- [ ] **Step 6.4: Repeat for `run_react_loop_streaming`**

Apply the same changes to `run_react_loop_streaming`.

- [ ] **Step 6.5: Update callers in `engine.rs`**

Add `self.session_ctx.clone()` as a new argument to every `run_react_loop` and `run_react_loop_streaming` call site (keep `self.tool_registry.clone()` — both are now passed).

- [ ] **Step 6.6: Verify full compile**

```bash
cargo check -p rushdino-agent 2>&1 | tail -10
```

Expected: `Finished` with no errors.

- [ ] **Step 6.7: Run existing tests**

```bash
cargo test -p rushdino-agent 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 6.8: Commit**

```bash
git add crates/agent/src/react_loop.rs crates/agent/src/engine.rs
git commit -m "feat(agent): react_loop uses session_ctx.active_definitions() for provider API schemas"
```

---

### Task 7: Update `system_prompt.rs` — add `tool_search` hint

**Files:**
- Modify: `crates/agent/src/system_prompt.rs`

- [ ] **Step 7.1: Write failing test**

In the existing `#[cfg(test)]` block, add a new test that uses params with a `tool_search` tool definition (to match real usage):

```rust
#[test]
fn tooling_section_includes_tool_search_hint() {
    let mut params = make_params();
    params.tool_defs.push(ToolDefinition {
        name: "tool_search".to_owned(),
        description: "Search the tool pool by keyword".to_owned(),
        parameters: serde_json::Value::Null,
    });
    let prompt = build_system_prompt(params);
    assert!(prompt.contains("Use `tool_search` to discover and activate additional tools"));
}
```

- [ ] **Step 7.2: Run test — expect fail**

```bash
cargo test -p rushdino-agent tooling_section_includes_tool_search_hint 2>&1 | tail -10
```

Expected: FAIL.

- [ ] **Step 7.3: Add hint line to `build_tooling_section`**

In `build_tooling_section`, change:

```rust
lines.push(String::new());
lines
```

to:

```rust
lines.push("Use `tool_search` to discover and activate additional tools by keyword.".to_owned());
lines.push(String::new());
lines
```

- [ ] **Step 7.4: Run test — expect pass**

```bash
cargo test -p rushdino-agent tooling_section_includes_tool_search_hint 2>&1 | tail -10
```

Expected: PASS.

- [ ] **Step 7.5: Run all agent tests**

```bash
cargo test -p rushdino-agent 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 7.6: Commit**

```bash
git add crates/agent/src/system_prompt.rs
git commit -m "feat(agent): add tool_search discovery hint to tooling section of system prompt"
```

---

### Task 8: Add `keywords()` to non-core tools

**Files:**
- Modify: selected tool impl files under `crates/agent/src/tools/`

Add `keywords()` overrides to improve `tool_search` discoverability for the most commonly searched non-core tools. Suggested list:

| Tool file | keywords |
|---|---|
| `cron_tools.rs` | `"cron"`, `"schedule"`, `"recurring"`, `"job"`, `"timer"` |
| `create_workflow.rs` | `"workflow"`, `"pipeline"`, `"automation"` |
| `run_workflow.rs` | `"workflow"`, `"run"`, `"execute"`, `"pipeline"` |
| `web_fetch.rs` | `"http"`, `"url"`, `"fetch"`, `"browser"`, `"page"` |
| `web_search.rs` | `"internet"`, `"search"`, `"google"`, `"browse"` |
| `session_tools.rs` | `"session"`, `"conversation"`, `"history"` |
| `spawn_agent.rs` | `"agent"`, `"spawn"`, `"subagent"`, `"delegate"` |
| `image.rs` | `"image"`, `"picture"`, `"generate"`, `"gemini"` |

- [ ] **Step 8.1: Add `keywords()` to each tool**

For each tool file above, find the `impl Tool for <ToolName>` block and add after `description()`:

```rust
fn keywords(&self) -> Vec<&str> {
    vec!["cron", "schedule", "recurring", "job", "timer"]  // adjust per tool
}
```

- [ ] **Step 8.2: Full compile check**

```bash
cargo check 2>&1 | tail -10
```

Expected: `Finished` with no errors.

- [ ] **Step 8.3: Run all tests**

```bash
cargo test -p rushdino-agent 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 8.4: Commit**

```bash
git add crates/agent/src/tools/
git commit -m "feat(agent): add keywords() to non-core tools for tool_search discoverability"
```

---

## Verification Checklist

After all tasks are done, manually verify:

- [ ] Start the server and send a chat message — system prompt should list only core tools
- [ ] Call `tool_search` with query `"cron"` — should return and activate cron tools
- [ ] On the next turn, system prompt should include the activated cron tools
- [ ] Call a non-active tool directly (e.g. `web_fetch`) — should still execute successfully
- [ ] Run full test suite: `cargo test 2>&1 | tail -20`
