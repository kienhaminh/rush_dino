# Lazy Tool Loading Design

**Date:** 2026-03-19
**Status:** Approved

## Problem

All registered tools are listed in the system prompt on every session, consuming significant context window space. Many tools are rarely needed but still take up tokens in every request.

## Goal

Inject only a small set of "core" tools into the system prompt. All other tools live in a pool and can be activated on demand via `tool_search`. Once activated, a tool appears in subsequent system prompts for that session.

---

## Architecture

### SessionToolContext (new)

A per-session struct in `tool_registry.rs` that manages the tool pool and active set.

```rust
pub struct SessionToolContext {
    pool: Vec<Arc<dyn Tool>>,          // all registered tools
    active: RwLock<HashSet<String>>,   // currently active tool names
}
```

All tools in the pool are **fully constructed at engine startup** with their dependencies injected (see `engine_deps.rs`). Activation controls visibility only — not construction or execution. A tool in the pool is immediately executable if called; it simply won't appear in the system prompt until activated.

Methods:
- `new(pool, core_names)` — initializes active set from core names
- `search_pool(query: &str) -> Vec<ToolDefinition>` — searches pool by name, description, keywords
- `activate(name: &str) -> bool` — adds tool to active set; returns true if newly added
- `active_definitions() -> Vec<ToolDefinition>` — definitions for active tools only

### Core Tool List

Hardcoded constant in `engine_bootstrap.rs`:

```rust
const CORE_TOOLS: &[&str] = &[
    "read", "write", "edit", "exec", "memory_search",
    "memory_write", "tool_search", "delegate", "message",
];
```

Any tool not in this list is excluded from the system prompt until activated.

### Tool Keywords

Add an optional `keywords()` method to the `Tool` trait with a default empty implementation:

```rust
fn keywords(&self) -> Vec<&str> {
    vec![]
}
```

Tool implementors can override this to improve discoverability. Example:

```rust
fn keywords(&self) -> Vec<&str> {
    vec!["cron", "schedule", "recurring", "job"]
}
```

### tool_search Enhancement

`tool_search` searches the pool using case-insensitive substring matching across all three fields:
- `name`
- `description`
- `keywords`

A query matches a tool if any token of the query matches any of the three fields.

Matching tools are activated into the session's active set. Already-active tools are skipped (no duplicate activation).

---

## System Prompt Change

`build_tooling_section` inserts a hint line immediately before the trailing blank line:

```
Use `tool_search` to discover and activate additional tools by keyword.
```

Only active tools are listed. Non-core tools are entirely absent until activated.

## Edge Case: Calling an Inactive Tool Directly

If the LLM calls a tool that exists in the registry but is not in the active set, the call **succeeds** — execution is always permitted. The active set controls visibility (system prompt + provider tool schemas) only, not enforcement. This is intentional: lazy loading is a context-saving mechanism, not a security boundary.

---

## Affected Files

| File | Change |
|---|---|
| `crates/agent/src/tool_registry.rs` | Add `SessionToolContext`; add `keywords()` to `Tool` trait. **Must be done first** — `tool_search.rs` already imports `SessionToolContext` and will not compile until this exists. |
| `crates/agent/src/tools/tool_search.rs` | File already exists as a partial implementation. Enhance search to match name + description + keywords. Fix compilation by ensuring `SessionToolContext` exists first. |
| `crates/agent/src/tools/mod.rs` | Add `pub mod tool_search` — currently absent, causing the file to be dead code |
| `crates/agent/src/engine_bootstrap.rs` | Filter system prompt to core tools only using `session_ctx.active_definitions()` |
| `crates/agent/src/engine_deps.rs` | Construct `SessionToolContext` from registry pool; register `ToolSearchTool` |
| `crates/agent/src/react_loop.rs` | Replace `registry.definitions()` with `session_ctx.active_definitions()` so provider-level tool schemas also reflect the active set |
| `crates/agent/src/system_prompt.rs` | Add `tool_search` hint line before the trailing blank line in `build_tooling_section` |
| Tool impls (selected) | Add `keywords()` overrides for discoverability |

---

## Data Flow

```
AgentEngine starts
  └── engine_deps builds SessionToolContext(pool=all tools, active=core tools)
  └── engine_bootstrap calls session_ctx.active_definitions() for system prompt

User turn N
  └── system prompt lists only active tools
  └── LLM calls tool_search("cron schedule")
      └── SessionToolContext.search_pool matches "cron_run_now", "cron_create", etc.
      └── activate() adds them to active set
  └── system prompt on turn N+1 includes the newly activated tools
```

---

## What Does NOT Change

- `ToolRegistry` is unchanged — still the global store of all tools
- Tool execution path is unchanged
- Tool definitions (name, description, parameters) are unchanged
- No config files, no per-agent overrides — one global core list

---

## Success Criteria

- System prompt contains only core tools by default
- `tool_search` finds tools by name, description, or keywords
- Activated tools appear in subsequent system prompts
- All existing tool functionality continues to work
- Codebase compiles with no warnings introduced by these changes
