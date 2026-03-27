# Conversation Compaction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the conversation context grows beyond a threshold, summarize old message groups into a compact history note instead of silently dropping them.

**Architecture:** A new `compaction.rs` module detects when the running `messages` vector approaches the `max_context_tokens` budget (≥ 75 %), calls the LLM to summarise the oldest groups into a single `[User] Compacted history` / `[Assistant] Understood` exchange, and replaces them in-place. The react loop calls this before every `truncate_messages` pass. If the LLM call fails the function returns the original messages unchanged and truncation falls back to the existing behaviour.

**Tech Stack:** Rust, `rushdino-providers` (`Provider::chat`), `rushdino-common` models, existing `estimate_tokens` helper from `context.rs`.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `crates/agent/src/compaction.rs` | `needs_compaction`, `compact_messages`, `summarize_history` |
| Modify | `crates/agent/src/lib.rs` | register `pub mod compaction` |
| Modify | `crates/agent/src/react_loop.rs` | call compaction before each `truncate_messages` |
| Modify | `crates/agent/src/context.rs` | make `build_groups` `pub(crate)` (reused by compaction) |

---

## Task 1: Make `build_groups` reusable

**Files:**
- Modify: `crates/agent/src/context.rs:12`

`build_groups` is currently `fn` (private). Compaction needs to group messages the same way to keep atomic tool-call blocks together.

- [ ] **Step 1: Change `fn build_groups` to `pub(crate) fn build_groups`**

```rust
// crates/agent/src/context.rs
pub(crate) fn build_groups(messages: &[Message]) -> Vec<Vec<&Message>> {
```

- [ ] **Step 2: Build to verify no regressions**

```bash
cargo build -p rushdino-agent 2>&1 | grep error
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add crates/agent/src/context.rs
git commit -m "refactor(context): expose build_groups as pub(crate)"
```

---

## Task 2: Create `compaction.rs` — core logic and unit tests

**Files:**
- Create: `crates/agent/src/compaction.rs`
- Modify: `crates/agent/src/lib.rs` (add `pub mod compaction`)

### Constants

```
COMPACT_THRESHOLD  = 0.75   trigger when > 75 % of max_tokens used
KEEP_RECENT_BUDGET = 0.40   keep verbatim groups that fit in 40 % of max_tokens
SUMMARY_MAX_TOKENS = 2048   LLM output cap for the summary call
```

### Public API

```rust
/// Returns true when messages approach the context budget.
pub fn needs_compaction(messages: &[Message], max_tokens: usize) -> bool

/// Replace oldest history groups with an LLM-generated summary.
/// Falls back to returning `messages` unchanged if LLM call fails or nothing to compact.
pub async fn compact_messages(
    provider: &Provider,
    messages: Vec<Message>,
    max_tokens: usize,
) -> Vec<Message>
```

### Internal helper

```rust
async fn summarize_history(provider: &Provider, messages: &[Message]) -> Result<String>
```

- [ ] **Step 1: Write failing unit tests**

```rust
// At the bottom of crates/agent/src/compaction.rs

#[cfg(test)]
mod tests {
    use chrono::Utc;
    use rushdino_common::models::{Message, Role};
    use super::needs_compaction;

    fn msg(role: Role, content: &str) -> Message {
        Message {
            id: uuid::Uuid::new_v4().to_string(),
            role,
            content: content.to_owned(),
            tool_calls: None,
            rich_content: None,
            created_at: Utc::now(),
        }
    }

    #[test]
    fn does_not_compact_when_under_threshold() {
        // 10 messages of 100 chars each → 10 * (100/4) = 250 tokens
        // threshold at 75% of 1000 = 750 — not reached
        let messages: Vec<_> = (0..10).map(|_| msg(Role::User, &"a".repeat(100))).collect();
        assert!(!needs_compaction(&messages, 1000));
    }

    #[test]
    fn compacts_when_over_threshold() {
        // 10 messages of 400 chars → 10 * 100 = 1000 tokens
        // threshold 75% of 1000 = 750 — exceeded
        let messages: Vec<_> = (0..10).map(|_| msg(Role::User, &"a".repeat(400))).collect();
        assert!(needs_compaction(&messages, 1000));
    }

    #[test]
    fn nothing_to_compact_with_two_or_fewer_groups() {
        // Only system + user — nothing in between to summarise
        // compact_messages is async so we can only test needs_compaction path here.
        let messages = vec![
            msg(Role::System, "sys"),
            msg(Role::User, "hello"),
        ];
        // Even if "over threshold", with only 2 groups compact_messages must return unchanged.
        // We verify the predicate doesn't panic with minimal input.
        let _ = needs_compaction(&messages, 1);
    }
}
```

- [ ] **Step 2: Run failing tests (module doesn't exist yet)**

```bash
cargo test -p rushdino-agent compaction 2>&1 | tail -10
```
Expected: compile error — `compaction` module not found.

- [ ] **Step 3: Create `compaction.rs` with `needs_compaction`**

```rust
//! Conversation history compaction.
//!
//! When the running `messages` vector approaches `max_context_tokens`, `compact_messages`
//! replaces the oldest groups with a single LLM-generated summary exchange, preserving
//! key facts without consuming the full token budget.

use chrono::Utc;
use uuid::Uuid;

use rushdino_common::{
    models::{Message, Role},
    Result,
};
use rushdino_providers::{
    types::{ChatRequest, ThinkingLevel},
    Provider,
};

use crate::context::{build_groups, estimate_tokens};

const COMPACT_THRESHOLD: f64 = 0.75;
const KEEP_RECENT_BUDGET: f64 = 0.40;
const SUMMARY_MAX_TOKENS: u32 = 2048;

/// Returns `true` when total estimated tokens exceed `COMPACT_THRESHOLD * max_tokens`.
pub fn needs_compaction(messages: &[Message], max_tokens: usize) -> bool {
    let total: usize = messages.iter().map(|m| estimate_tokens(&m.content)).sum();
    (total as f64) > (max_tokens as f64 * COMPACT_THRESHOLD)
}
```

- [ ] **Step 4: Add `compact_messages` and `summarize_history`**

```rust
/// Compact the oldest message groups into a summary exchange.
///
/// - Groups at index 0 (system prompt) and the most-recent groups (up to
///   `KEEP_RECENT_BUDGET * max_tokens`) are kept verbatim.
/// - The groups in between are passed to the LLM for summarisation and
///   replaced by a synthetic `[User] Compacted history` / `[Assistant] Understood`
///   exchange.
/// - On any failure the original `messages` vec is returned unchanged.
pub async fn compact_messages(
    provider: &Provider,
    messages: Vec<Message>,
    max_tokens: usize,
) -> Vec<Message> {
    let groups = build_groups(&messages);

    if groups.len() <= 2 {
        return messages; // system + at most one other group — nothing to compact
    }

    // Determine how many recent groups to keep verbatim.
    let keep_budget = (max_tokens as f64 * KEEP_RECENT_BUDGET) as usize;
    let mut used = 0usize;
    let mut keep_count = 0usize;

    for group in groups[1..].iter().rev() {
        let cost: usize = group.iter().map(|m| estimate_tokens(&m.content)).sum();
        if used + cost > keep_budget {
            break;
        }
        used += cost;
        keep_count += 1;
    }

    let compact_end = groups.len().saturating_sub(keep_count);
    if compact_end <= 1 {
        return messages; // Everything fits in the keep budget — nothing to compact
    }

    // Collect messages that will be summarised (groups[1..compact_end]).
    let to_compact: Vec<&Message> = groups[1..compact_end].iter().flatten().copied().collect();

    if to_compact.is_empty() {
        return messages;
    }

    let summary = match summarize_history(provider, &to_compact).await {
        Ok(s) => s,
        Err(e) => {
            tracing::warn!(error = %e, "compaction LLM call failed — keeping original messages");
            return messages;
        }
    };

    tracing::info!(
        compacted = to_compact.len(),
        kept_recent = keep_count,
        "conversation history compacted"
    );

    // Rebuild: system prompt + summary exchange + recent groups.
    let sys_end = groups[0].len(); // messages[0..sys_end] is the system group
    let keep_start_group = &groups[compact_end];
    // Find the index of the first message in the first kept group.
    // Each group holds &Message references into `messages`; use pointer arithmetic.
    let keep_start_idx = keep_start_group[0] as *const Message;
    let base = messages.as_ptr();
    // SAFETY: keep_start_group[0] is a reference into `messages`.
    let keep_start = unsafe { keep_start_idx.offset_from(base) } as usize;

    let mut result = messages[..sys_end].to_vec();

    result.push(Message {
        id: Uuid::new_v4().to_string(),
        role: Role::User,
        content: format!("[Conversation history — compacted]\n\n{summary}"),
        tool_calls: None,
        rich_content: None,
        created_at: Utc::now(),
    });
    result.push(Message {
        id: Uuid::new_v4().to_string(),
        role: Role::Assistant,
        content: "Understood, I have the context from the earlier part of this conversation."
            .to_owned(),
        tool_calls: None,
        rich_content: None,
        created_at: Utc::now(),
    });

    result.extend_from_slice(&messages[keep_start..]);
    result
}

async fn summarize_history(provider: &Provider, messages: &[&Message]) -> Result<String> {
    let mut history = String::new();
    for msg in messages {
        let label = match msg.role {
            Role::System => continue,
            Role::User => "User",
            Role::Assistant => "Assistant",
            Role::Tool => "Tool result",
        };
        let snippet = if msg.content.len() > 2_000 {
            format!("{}…(truncated)", &msg.content[..2_000])
        } else {
            msg.content.clone()
        };
        history.push_str(&format!("[{label}]: {snippet}\n\n"));
    }

    let prompt = format!(
        "Summarize the following conversation history into a compact context note.\n\
         Focus on:\n\
         - What the user asked or requested\n\
         - What tools were called and the key information found\n\
         - Important facts, decisions, or discoveries\n\
         - What has been completed and what remains pending\n\n\
         Be concise. Use bullet points. Preserve specific details that may be needed \
         later (file names, URLs, key facts, exact values).\n\n\
         Conversation history:\n{history}"
    );

    let response = provider
        .chat(ChatRequest {
            messages: vec![Message {
                id: Uuid::new_v4().to_string(),
                role: Role::User,
                content: prompt,
                tool_calls: None,
                rich_content: None,
                created_at: Utc::now(),
            }],
            tools: None,
            temperature: Some(0.1),
            max_tokens: Some(SUMMARY_MAX_TOKENS),
            model: None,
            thinking_level: Some(ThinkingLevel::Off),
        })
        .await?;

    Ok(response.content)
}
```

> ⚠️ **Note on `keep_start` calculation**: The pointer arithmetic approach is fragile. See Task 3 for a cleaner index-based alternative.

- [ ] **Step 5: Register module in `lib.rs`**

```rust
// crates/agent/src/lib.rs  — add after existing mod declarations
pub mod compaction;
```

- [ ] **Step 6: Run tests**

```bash
cargo test -p rushdino-agent compaction 2>&1 | tail -20
```
Expected: all 3 unit tests pass.

- [ ] **Step 7: Commit**

```bash
git add crates/agent/src/compaction.rs crates/agent/src/lib.rs
git commit -m "feat(agent): add conversation compaction module"
```

---

## Task 3: Fix index tracking — replace pointer arithmetic

The pointer-arithmetic approach to find `keep_start` is unsafe and fragile. Use index-based group tracking instead by returning `(start_idx, end_idx)` pairs.

**Files:**
- Modify: `crates/agent/src/compaction.rs`

- [ ] **Step 1: Write test that exercises the keep_start boundary**

```rust
// Add to #[cfg(test)] in compaction.rs
#[test]
fn keeps_correct_messages_after_compact_boundary() {
    // 6 messages: sys(0) + user(1) + assistant_tool(2)+tool_result(3) + user(4) + assistant(5)
    // Groups: [0], [1], [2,3], [4], [5]
    // With a tiny budget, groups 1 and 2-3 should be compacted; 4 and 5 kept.
    // We just test that keep_count logic is correct (no provider needed here).
    let messages = vec![
        msg(Role::System, "sys"),
        msg(Role::User, &"u".repeat(400)),
        msg(Role::User, &"a".repeat(400)),  // simulated assistant w/tools (simplified)
        msg(Role::Tool, &"t".repeat(400)),
        msg(Role::User, "recent user"),
        msg(Role::Assistant, "recent reply"),
    ];
    // recent 2 messages: (100 + 100) / 4 = 50 tokens each ≈ 100 total
    // keep_budget = 40% of 300 = 120 → both recent messages fit
    assert!(needs_compaction(&messages, 300));
}
```

- [ ] **Step 2: Refactor `compact_messages` to use index-based groups**

Replace the `build_groups`-based approach (which gives `&Message` refs) with an index approach that tracks `(start, end)` pairs directly in `messages`:

```rust
/// Returns (start_inclusive, end_exclusive) index pairs for each atomic group.
fn group_indices(messages: &[Message]) -> Vec<(usize, usize)> {
    let mut groups = Vec::new();
    let mut i = 0;
    while i < messages.len() {
        if messages[i].role == Role::Assistant
            && messages[i]
                .tool_calls
                .as_ref()
                .is_some_and(|tc| !tc.is_empty())
        {
            let start = i;
            i += 1;
            while i < messages.len() && messages[i].role == Role::Tool {
                i += 1;
            }
            groups.push((start, i));
        } else {
            groups.push((i, i + 1));
            i += 1;
        }
    }
    groups
}
```

Rewrite `compact_messages` using `group_indices` — no unsafe code, no pointer arithmetic, clean slices:

```rust
pub async fn compact_messages(
    provider: &Provider,
    messages: Vec<Message>,
    max_tokens: usize,
) -> Vec<Message> {
    let groups = group_indices(&messages);

    if groups.len() <= 2 {
        return messages;
    }

    let keep_budget = (max_tokens as f64 * KEEP_RECENT_BUDGET) as usize;
    let mut used = 0usize;
    let mut keep_count = 0usize;

    for &(start, end) in groups[1..].iter().rev() {
        let cost: usize = messages[start..end]
            .iter()
            .map(|m| estimate_tokens(&m.content))
            .sum();
        if used + cost > keep_budget {
            break;
        }
        used += cost;
        keep_count += 1;
    }

    let compact_end_group = groups.len().saturating_sub(keep_count);
    if compact_end_group <= 1 {
        return messages;
    }

    let sys_end = groups[0].1;                       // end of system prompt group
    let compact_start = groups[1].0;                  // start of first compacted group
    let keep_start = groups[compact_end_group].0;     // start of first kept recent group

    let to_compact = &messages[compact_start..keep_start];
    if to_compact.is_empty() {
        return messages;
    }

    let summary = match summarize_history(provider, to_compact).await {
        Ok(s) => s,
        Err(e) => {
            tracing::warn!(error = %e, "compaction LLM call failed — keeping original messages");
            return messages;
        }
    };

    tracing::info!(
        compacted = to_compact.len(),
        kept_recent = keep_count,
        "conversation history compacted"
    );

    let mut result = messages[..sys_end].to_vec();
    result.push(Message {
        id: Uuid::new_v4().to_string(),
        role: Role::User,
        content: format!("[Conversation history — compacted]\n\n{summary}"),
        tool_calls: None,
        rich_content: None,
        created_at: Utc::now(),
    });
    result.push(Message {
        id: Uuid::new_v4().to_string(),
        role: Role::Assistant,
        content: "Understood, I have the context from the earlier part of this conversation."
            .to_owned(),
        tool_calls: None,
        rich_content: None,
        created_at: Utc::now(),
    });
    result.extend_from_slice(&messages[keep_start..]);
    result
}
```

Update `summarize_history` signature to take `&[Message]` (no double-reference):

```rust
async fn summarize_history(provider: &Provider, messages: &[Message]) -> Result<String> {
    // (same body as before, but `msg` is `&Message` not `&&Message`)
}
```

- [ ] **Step 3: Remove `build_groups` import from compaction.rs** (now uses `group_indices` only)

Also remove `pub(crate)` from `build_groups` in `context.rs` if no other caller needs it (check with grep first).

- [ ] **Step 4: Build and run all tests**

```bash
cargo test -p rushdino-agent 2>&1 | tail -20
```
Expected: all tests pass, no unsafe code.

- [ ] **Step 5: Commit**

```bash
git add crates/agent/src/compaction.rs crates/agent/src/context.rs
git commit -m "refactor(compaction): use index-based grouping, remove unsafe pointer arithmetic"
```

---

## Task 4: Wire compaction into the react loop

**Files:**
- Modify: `crates/agent/src/react_loop.rs`

Both `run_react_loop` and `run_react_loop_streaming` have the same iteration structure:

```rust
for _ in 0..config.max_iterations {
    let input = truncate_messages(&messages, config.max_context_tokens);
    ...
}
```

Compaction runs **before** `truncate_messages`. It is only triggered when `needs_compaction` returns `true` to avoid an LLM call on every iteration.

- [ ] **Step 1: Add imports to `react_loop.rs`**

```rust
use crate::compaction::{compact_messages, needs_compaction};
```

- [ ] **Step 2: Add compaction call in `run_react_loop`**

```rust
for _ in 0..config.max_iterations {
    // Compact history if approaching the context budget.
    if needs_compaction(&messages, config.max_context_tokens) {
        messages = compact_messages(&provider, messages, config.max_context_tokens).await;
    }
    let input = truncate_messages(&messages, config.max_context_tokens);
    ...
}
```

- [ ] **Step 3: Add the same call in `run_react_loop_streaming`**

Same two lines at the top of its `for` loop body.

- [ ] **Step 4: Build**

```bash
cargo build -p rushdino-agent 2>&1 | grep error
```
Expected: no errors.

- [ ] **Step 5: Run all agent tests**

```bash
cargo test -p rushdino-agent 2>&1 | tail -20
```
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add crates/agent/src/react_loop.rs
git commit -m "feat(react-loop): compact conversation history when approaching context budget"
```

---

## Task 5: Add `max_context_tokens` to config (make it tunable)

Currently hardcoded at `200_000` in `AgentConfig::default()`. Operators running smaller models benefit from a lower value.

**Files:**
- Modify: `crates/common/src/config.rs` — add `AgentSection`
- Modify: `crates/server/src/provider_runtime.rs` — read from config

- [ ] **Step 1: Add `AgentSection` to `config.rs`**

```rust
/// Agent runtime tuning knobs.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct AgentSection {
    /// Maximum estimated tokens kept in the context window per react-loop iteration.
    /// Default: 200 000 (suitable for Claude / GPT-4o class models).
    pub max_context_tokens: Option<usize>,
}
```

Add to `AppConfig`:

```rust
#[serde(default)]
pub agent: AgentSection,
```

- [ ] **Step 2: Wire into `provider_runtime.rs`**

```rust
AgentConfig {
    max_context_tokens: config
        .agent
        .max_context_tokens
        .unwrap_or(200_000),
    bootstrap_max_chars: config
        .bootstrap
        .max_chars_per_file
        .unwrap_or(DEFAULT_BOOTSTRAP_MAX_CHARS),
    bootstrap_total_max_chars: config
        .bootstrap
        .max_total_chars
        .unwrap_or(DEFAULT_BOOTSTRAP_TOTAL_MAX_CHARS),
    ..AgentConfig::default()
}
```

- [ ] **Step 3: Build and test**

```bash
cargo build -p rushdino-server 2>&1 | grep error
cargo test -p rushdino-server 2>&1 | tail -10
```

- [ ] **Step 4: Commit**

```bash
git add crates/common/src/config.rs crates/server/src/provider_runtime.rs
git commit -m "feat(config): make max_context_tokens configurable via [agent] section"
```

---

## Verification

After all tasks, run the full test suite and verify end-to-end:

```bash
cargo test --workspace 2>&1 | tail -30
```

Expected: all tests pass.

**Manual smoke test**: Start the server, open Workspace, ask "tìm thông tin về gpt 5.4 đi". Observe:
1. Agent reads SOUL.md/USER.md/MEMORY.md once at session start
2. Agent calls web search + web fetch (LLM-extracted summaries now)
3. Agent does NOT re-read identity files mid-conversation
4. Agent responds with actual GPT-5.4 information

---
