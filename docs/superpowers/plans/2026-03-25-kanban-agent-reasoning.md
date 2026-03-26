# Kanban Agent Reasoning & Auto-Execution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the main agent reasoning ability to route complex tasks to the kanban board, auto-dispatch them to specialist agents in isolated sessions, write memory after completion, and notify the main session when results are ready.

**Architecture:** Phase A adds available-agents awareness and routing guidance to the system prompt (quick wins). Phase B builds the kanban auto-dispatcher — a background loop that picks up backlog tasks, runs the matching engine, executes each task in an isolated react loop, writes daily memory, and notifies the originating conversation via ChatBroadcastHub.

**Tech Stack:** Rust, Tokio, SQLite (sqlx), existing `KanbanStore` / `AgentManager` / `MemoryManager` / `ToolRegistry` / `ChatBroadcastHub`, `ThinkingLevel` enum.

---

## Phase A — System Prompt & Guidance (Parts 3, 4, 5-agent)

### Task 1: Add `agents` section to `system_prompt.rs`

**Files:**
- Modify: `crates/agent/src/system_prompt.rs`

- [ ] **Step 1.1: Write the failing test**

Add to the existing `#[cfg(test)]` block in `system_prompt.rs`:

```rust
#[test]
fn includes_agents_section_when_agents_present() {
    let mut params = make_params();
    params.agents = vec![
        AgentEntry { name: "researcher".to_owned(), description: "Research specialist".to_owned(), icon: Some("📚".to_owned()) },
        AgentEntry { name: "debugger".to_owned(), description: "Debug specialist".to_owned(), icon: None },
    ];
    let prompt = build_system_prompt(params);
    assert!(prompt.contains("## Available Agents"));
    assert!(prompt.contains("researcher"));
    assert!(prompt.contains("Research specialist"));
    assert!(prompt.contains("📚"));
    assert!(prompt.contains("debugger"));
}

#[test]
fn omits_agents_section_when_empty() {
    let params = make_params(); // agents defaults to vec![]
    let prompt = build_system_prompt(params);
    assert!(!prompt.contains("## Available Agents"));
}
```

- [ ] **Step 1.2: Run tests to confirm they fail**

```bash
cd /Users/kien.ha/Code/RushDino
cargo test -p rushdino-agent system_prompt 2>&1 | tail -20
```

Expected: compile error — `AgentEntry` and `agents` field don't exist yet.

- [ ] **Step 1.3: Implement `AgentEntry`, update `SystemPromptParams`, add `build_agents_section()`**

In `crates/agent/src/system_prompt.rs`:

```rust
pub struct AgentEntry {
    pub name: String,
    pub description: String,
    pub icon: Option<String>,
}
```

Add to `SystemPromptParams`:
```rust
pub agents: Vec<AgentEntry>,
```

Add function before `build_system_prompt`:
```rust
fn build_agents_section(agents: &[AgentEntry]) -> Vec<String> {
    if agents.is_empty() {
        return vec![];
    }
    let mut lines = vec![
        "## Available Agents".to_owned(),
        "Use `post_task` to delegate complex work. Use `delegate` for quick synchronous tasks.".to_owned(),
        String::new(),
    ];
    for agent in agents {
        let icon = agent.icon.as_deref().unwrap_or("🤖");
        lines.push(format!("- **{}** {} — {}", agent.name, icon, agent.description));
    }
    lines.push(String::new());
    lines
}
```

Wire into `build_system_prompt` after `build_skills_section`:
```rust
lines.extend(build_agents_section(&params.agents));
```

Update `make_params()` test helper to include `agents: vec![]`.

- [ ] **Step 1.4: Run tests**

```bash
cargo test -p rushdino-agent system_prompt 2>&1 | tail -20
```

Expected: all pass.

- [ ] **Step 1.5: Commit**

```bash
git add crates/agent/src/system_prompt.rs
git commit -m "feat(system-prompt): add available agents section"
```

---

### Task 2: Wire agents into `engine_bootstrap.rs` and `session_tools.rs`

**Files:**
- Modify: `crates/agent/src/engine_bootstrap.rs`
- Modify: `crates/agent/src/tools/session_tools.rs`

- [ ] **Step 2.1: Write the failing test**

Add to `#[cfg(test)]` in `engine_bootstrap.rs`:

```rust
#[test]
fn system_message_includes_agents_when_provided() {
    use crate::agent_manager::AgentTemplate;
    let config = AgentConfig::default();
    let temp = tempfile::tempdir().unwrap();
    let memory = MemoryManager::new(temp.path().to_owned());
    let session_ctx = SessionToolContext::empty();
    let agents = vec![AgentTemplate {
        name: "researcher".to_owned(),
        description: "Research specialist".to_owned(),
        system_prompt: String::new(),
        icon: Some("📚".to_owned()),
        tools: None,
        color: None,
        model: None,
        claims_tasks: true,
        sandbox_policy: None,
    }];
    let msg = system_message(&config, &memory, vec![], &session_ctx, &agents);
    assert!(msg.content.contains("researcher"));
    assert!(msg.content.contains("Available Agents"));
}
```

- [ ] **Step 2.2: Run test to confirm fail**

```bash
cargo test -p rushdino-agent engine_bootstrap 2>&1 | tail -20
```

- [ ] **Step 2.3: Update `system_message()` signature and body**

In `crates/agent/src/engine_bootstrap.rs`, update `system_message`:

```rust
pub fn system_message(
    config: &AgentConfig,
    memory: &MemoryManager,
    skills: Vec<SkillEntry>,
    session_ctx: &SessionToolContext,
    agents: &[crate::agent_manager::AgentTemplate],  // NEW
) -> Message {
```

Map `AgentTemplate` → `AgentEntry` before calling `build_system_prompt`:

```rust
use crate::system_prompt::AgentEntry;

let agent_entries: Vec<AgentEntry> = agents
    .iter()
    .map(|a| AgentEntry {
        name: a.name.clone(),
        description: a.description.clone(),
        icon: a.icon.clone(),
    })
    .collect();
```

Add `agents: agent_entries` to `SystemPromptParams`.

- [ ] **Step 2.4: Fix all callers of `system_message()`**

Find all callers (there are 5 — `engine.rs` x3, `session_tools.rs`, `cron_tools.rs`):
```bash
grep -rn "system_message(" /Users/kien.ha/Code/RushDino/crates/ --include="*.rs" | grep -v test
```

Update each caller to pass `&[]` (empty) or the real agent list:
- `crates/agent/src/engine.rs` (lines ~309, ~450, ~1029) — pass `&self.agent_manager.list()` (note: `.list()` returns `Vec<AgentTemplate>` directly, no `Result` — no `.unwrap_or_default()` needed)
- `crates/agent/src/tools/session_tools.rs` — pass `&[]`
- `crates/agent/src/tools/cron_tools.rs` — pass `&[]`

- [ ] **Step 2.5: Run all agent tests**

```bash
cargo test -p rushdino-agent 2>&1 | tail -30
```

Expected: all pass.

- [ ] **Step 2.6: Commit**

```bash
git add crates/agent/src/engine_bootstrap.rs crates/agent/src/engine.rs crates/agent/src/tools/session_tools.rs crates/agent/src/tools/cron_tools.rs
git commit -m "feat(engine): inject available agents into system prompt"
```

---

### Task 3: Update `AGENTS.md` with routing guidance and memory-after-task

**Files:**
- Modify: `~/.rushdino/AGENTS.md`

- [ ] **Step 3.1: Add Task Routing section to AGENTS.md**

Add after the `## Memory` section:

```markdown
## Task Routing — When to Use the Kanban Board

Before starting work, reason about complexity:

**Handle inline** (do it yourself):
- Simple answers, quick lookups
- 1–3 tool calls total
- Conversational replies

**Post to kanban** (`post_task`) when:
- Requires 5+ tool calls (e.g., multi-page web research)
- Needs specialist expertise (research, code review, debugging, writing)
- Task is complex enough that losing context would hurt

**How to post:**
1. Call `post_task(title, description, tags, complexity_level=2-3)`
   - tags guide routing: ["research","web-search"] → researcher, ["code","debugging"] → debugger
2. Tell the user: "Queued for the [agent] agent — I'll let you know when it's done"
3. When the task result appears, call `review_task` to approve or send back

## Memory After Each Task

After completing or reviewing any non-trivial task, write key findings to the daily log:

```
memory_write({
  content: "## [brief title]\n[what was done, key findings, decisions]\n",
  daily: true
})
```

Skip trivial results. Only log what future-you would want to know.
```

- [ ] **Step 3.2: Fix the SOUL.md conflict**

In `~/.rushdino/SOUL.md`, update the Continuity section:

Change:
```
Each session, wake up fresh. These files are memory—read/update them.
```

To:
```
Each session, wake up fresh. SOUL.md, USER.md, and MEMORY.md are already injected — do not re-read them. Write daily notes to capture what you do.
```

- [ ] **Step 3.3: Create the daily notes directory**

```bash
mkdir -p ~/.rushdino/memory/daily
echo "# Daily Notes" > ~/.rushdino/memory/daily/.gitkeep
```

- [ ] **Step 3.4: Verify by checking AGENTS.md and SOUL.md**

```bash
grep -A 20 "Task Routing" ~/.rushdino/AGENTS.md
grep -A 3 "Continuity" ~/.rushdino/SOUL.md
```

- [ ] **Step 3.5: Verify the changes were written**

```bash
grep -A 5 "Task Routing" ~/.rushdino/AGENTS.md | head -10
grep -A 3 "Continuity" ~/.rushdino/SOUL.md
```

Note: `~/.rushdino/` files are **outside** the project git repo — no git commit needed for them. They are written directly as workspace files.

---

### Task 4: Raise default ThinkingLevel to Medium

**Files:**
- Modify: `crates/agent/src/engine.rs`

- [ ] **Step 4.1: Write the failing test**

In `crates/agent/src/engine.rs` test block, add:

```rust
#[test]
fn default_thinking_level_is_medium() {
    let config = AgentConfig::default();
    assert_eq!(config.thinking_level, ThinkingLevel::Medium);
}
```

- [ ] **Step 4.2: Run test to confirm it fails**

```bash
cargo test -p rushdino-agent thinking_level_override_logic 2>&1 | tail -10
```

- [ ] **Step 4.3: Change default**

In `crates/agent/src/engine.rs`, `AgentConfig::default()`:

```rust
thinking_level: ThinkingLevel::Medium,  // was ThinkingLevel::Low
```

- [ ] **Step 4.4: Run tests**

```bash
cargo test -p rushdino-agent 2>&1 | tail -20
```

Expected: all pass.

- [ ] **Step 4.5: Commit**

```bash
git add crates/agent/src/engine.rs
git commit -m "feat(engine): raise default thinking level to Medium for better task routing decisions"
```

---

## Phase B — Kanban Auto-Dispatcher (Parts 1, 2, 5-system)

### Task 5: Add `notify_conversation_id` to `KanbanTask`

**Files:**
- Modify: `crates/agent/src/kanban_store.rs`
- Create: `crates/common/migrations/007_kanban_notify_conversation.sql`

- [ ] **Step 5.1: Write the failing test**

In `kanban_store.rs` tests:

```rust
#[tokio::test]
async fn notify_conversation_id_stored_and_retrieved() {
    let store = test_store().await;
    let input = CreateTaskInput {
        title: "test".into(),
        description: "desc".into(),
        tags: vec![],
        priority: TaskPriority::Medium,
        parent_task_id: None,
        source_request_id: None,
        complexity_level: 1,
        notify_conversation_id: Some("main".into()),  // NEW
    };
    let task = store.create_task(&input).await.unwrap();
    assert_eq!(task.notify_conversation_id.as_deref(), Some("main"));
}
```

- [ ] **Step 5.2: Run test to confirm fail**

```bash
cargo test -p rushdino-agent kanban 2>&1 | tail -20
```

- [ ] **Step 5.3: Create DB migration**

Create `crates/common/migrations/007_kanban_notify_conversation.sql`:

```sql
ALTER TABLE kanban_tasks ADD COLUMN notify_conversation_id TEXT;
```

- [ ] **Step 5.4: Update `KanbanTask`, `CreateTaskInput`, and store**

In `kanban_store.rs`:

Add to `KanbanTask` struct:
```rust
pub notify_conversation_id: Option<String>,
```

Add to `CreateTaskInput` struct:
```rust
pub notify_conversation_id: Option<String>,
```

Update `create_task` INSERT to include the new column. Update the row mapping in `KanbanTaskRow` → `KanbanTask`.

- [ ] **Step 5.5: Update `post_task` tool to accept `notify_conversation_id`**

In `crates/agent/src/tools/kanban_tools.rs`, add to `parameters()`:

```rust
"notify_conversation_id": {
    "type": "string",
    "description": "Conversation to notify when task completes (pass your current conversation ID)"
}
```

Pass it through in `execute()` to `CreateTaskInput`.

- [ ] **Step 5.6: Run tests**

```bash
cargo test -p rushdino-agent kanban 2>&1 | tail -20
cargo test -p rushdino-agent 2>&1 | tail -20
```

- [ ] **Step 5.7: Fix `write_memory` append semantics for daily notes**

`MemoryManager::write_memory` in `crates/agent/src/memory.rs` currently uses `fs::write` (overwrites) for daily files. Fix it to append:

```rust
pub fn write_memory(&self, content: &str, daily: bool) -> Result<PathBuf> {
    let path = if daily {
        let today = Utc::now().date_naive();
        self.root
            .join("memory")
            .join("daily")
            .join(format!("{today}.md"))
    } else {
        self.canonical_memory_path()
    };
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    if daily {
        use std::io::Write;
        let mut file = fs::OpenOptions::new().create(true).append(true).open(&path)?;
        file.write_all(content.as_bytes())?;
    } else {
        fs::write(&path, content)?;
    }
    Ok(path)
}
```

Add a test in `memory.rs` tests:

```rust
#[test]
fn write_memory_daily_appends_not_overwrites() {
    let dir = tempfile::tempdir().unwrap();
    let mm = MemoryManager::new(dir.path().to_owned());
    mm.write_memory("first\n", true).unwrap();
    mm.write_memory("second\n", true).unwrap();
    let today = chrono::Utc::now().date_naive();
    let path = dir.path().join("memory").join("daily").join(format!("{today}.md"));
    let content = std::fs::read_to_string(&path).unwrap();
    assert!(content.contains("first"));
    assert!(content.contains("second"));
}
```

Run: `cargo test -p rushdino-agent memory 2>&1 | tail -10`

- [ ] **Step 5.8: Commit**

```bash
git add crates/agent/src/kanban_store.rs crates/agent/src/tools/kanban_tools.rs crates/common/migrations/007_kanban_notify_conversation.sql crates/agent/src/memory.rs
git commit -m "feat(kanban): add notify_conversation_id; fix daily note append semantics"
```

---

### Task 6: Create `KanbanDispatcher`

**Files:**
- Create: `crates/agent/src/kanban_dispatcher.rs`
- Modify: `crates/agent/src/lib.rs` (add `pub mod kanban_dispatcher`)
- Modify: `crates/agent/src/tools/delegate_to_agent.rs` (make `parse_tool_list` `pub(crate)`)

The dispatcher:
1. Polls `list_backlog_tasks()` every 5 seconds
2. For each unassigned task: runs matching engine → executes task in isolated react loop (reusing `delegate_to_agent` logic)
3. On completion: writes to daily notes + notifies originating conversation via broadcast

- [ ] **Step 6.0: Make `parse_tool_list` visible to the dispatcher**

In `crates/agent/src/tools/delegate_to_agent.rs`, change:

```rust
fn parse_tool_list(tools: &Option<String>) -> Vec<String> {
```

to:

```rust
pub(crate) fn parse_tool_list(tools: &Option<String>) -> Vec<String> {
```

Run: `cargo build -p rushdino-agent 2>&1 | tail -5` — expected: no errors.

- [ ] **Step 6.0b: Add `pub mod kanban_dispatcher;` to `lib.rs`**

In `crates/agent/src/lib.rs`, find the other `pub mod` lines and add:

```rust
pub mod kanban_dispatcher;
```

This must be done before Step 6.3 or the module won't compile.

- [ ] **Step 6.1: Write unit tests for dispatcher logic**

Create `crates/agent/src/kanban_dispatcher.rs` with tests first:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn poll_interval_is_reasonable() {
        assert!(POLL_INTERVAL_SECS >= 5);
        assert!(POLL_INTERVAL_SECS <= 60);
    }

    #[test]
    fn daily_note_entry_format() {
        let entry = format_task_completion_note("task-1", "Research GPT-5.4", "researcher", "Found: GPT-5.4 released March 2026.");
        assert!(entry.contains("Research GPT-5.4"));
        assert!(entry.contains("researcher"));
        assert!(entry.contains("Found: GPT-5.4"));
        assert!(entry.starts_with("## "));
    }
}
```

- [ ] **Step 6.2: Run tests to confirm fail**

```bash
cargo test -p rushdino-agent kanban_dispatcher 2>&1 | tail -10
```

- [ ] **Step 6.3: Implement `KanbanDispatcher`**

```rust
use std::{path::PathBuf, sync::{Arc, Weak}, time::Duration};
use chrono::Utc;
use tokio::time;
use uuid::Uuid;

use rushdino_common::{models::{Message, Role}, Result};
use rushdino_providers::Provider;

use crate::{
    agent_manager::AgentManager,
    agent_task_memory::AgentTaskMemory,
    conversation::ConversationManager,
    engine::AgentConfig,
    engine_bootstrap::title_from,
    kanban_matching_engine::find_best_match,
    kanban_store::{KanbanStore, TaskStatus, UpdateTaskInput},
    memory::MemoryManager,
    react_loop::run_react_loop,
    skill_manager::SkillManager,
    system_prompt::SkillEntry,
    tool_registry::{SessionToolContext, ToolRegistry},
    tools::{
        delegate_to_agent::parse_tool_list,
        shell_exec::{with_tool_execution_context, ToolExecutionContext},
    },
};

pub const POLL_INTERVAL_SECS: u64 = 5;

pub struct KanbanDispatcher {
    store: Arc<KanbanStore>,
    agent_manager: Arc<AgentManager>,
    provider: Arc<Provider>,
    config: AgentConfig,
    registry: Weak<ToolRegistry>,
    session_ctx: Weak<SessionToolContext>,
    memory: Arc<MemoryManager>,
    skill_manager: Arc<SkillManager>,
    conversation: Arc<ConversationManager>,
    task_memory: Arc<AgentTaskMemory>,
    home_dir: PathBuf,
    /// Broadcast JSON payloads to connected WebSocket clients.
    broadcast_tx: tokio::sync::broadcast::Sender<serde_json::Value>,
}

impl KanbanDispatcher {
    pub fn new(/* all fields */) -> Self { /* ... */ }

    /// Spawn the background polling loop. Returns immediately.
    pub fn start(self: Arc<Self>) {
        tokio::spawn(async move {
            let mut interval = time::interval(Duration::from_secs(POLL_INTERVAL_SECS));
            loop {
                interval.tick().await;
                if let Err(e) = self.poll_once().await {
                    tracing::warn!(error = %e, "kanban dispatcher poll error");
                }
            }
        });
    }

    async fn poll_once(&self) -> Result<()> {
        let backlog = self.store.list_backlog_tasks().await?;
        let agents = self.agent_manager.list(); // returns Vec<AgentTemplate> directly, not Result

        for task in backlog {
            if task.assigned_agent.is_some() {
                continue; // already claimed
            }
            if let Some(matched) = find_best_match(&task, &agents) {
                if let Err(e) = self.execute_task(&task, &matched.agent_name).await {
                    tracing::warn!(task_id = %task.id, agent = %matched.agent_name, error = %e, "task execution failed");
                    let _ = self.store.update_task_status(&UpdateTaskInput {
                        task_id: task.id.clone(),
                        status: TaskStatus::Failed,
                        result: Some(format!("Execution error: {e}")),
                        block_reason: None,
                    }).await;
                }
            }
        }
        Ok(())
    }

    async fn execute_task(&self, task: &crate::kanban_store::KanbanTask, agent_name: &str) -> Result<()> {
        let template = self.agent_manager.get(agent_name)
            .ok_or_else(|| rushdino_common::AppError::Agent(format!("unknown agent: {agent_name}")))?;

        let registry = self.registry.upgrade()
            .ok_or_else(|| rushdino_common::AppError::Agent("registry unavailable".into()))?;
        let session_ctx = self.session_ctx.upgrade()
            .ok_or_else(|| rushdino_common::AppError::Agent("session_ctx unavailable".into()))?;

        // Claim task
        let _ = self.store.claim_task(&task.id, agent_name).await?;

        // Isolated conversation
        let conv_id = Uuid::new_v4().to_string();
        self.store.set_conversation(&task.id, &conv_id).await?;
        self.conversation.create_agent_conversation(&conv_id, &format!("{agent_name}: {}", title_from(&task.title))).await?;

        // Tool scoping
        let allowed = parse_tool_list(&template.tools);
        let scoped_ctx: Arc<SessionToolContext> = if allowed.is_empty() {
            session_ctx.clone()
        } else {
            let refs: Vec<&str> = allowed.iter().map(String::as_str).collect();
            Arc::new(SessionToolContext::scoped(session_ctx.pool_tools(), &refs))
        };

        // Build agent workspace
        let agent_workspace = self.home_dir.join("agents").join(agent_name).join("workspace");
        std::fs::create_dir_all(&agent_workspace)?;

        let mut system_content = template.system_prompt.clone();
        system_content.push_str(&format!("\n\n## Workspace\nYour working directory is: {}", agent_workspace.display()));
        system_content.push_str("\n\n## Memory\nAfter completing the task, write key findings to daily notes:\nmemory_write({\"content\": \"## [task title]\\n[findings]\", \"daily\": true})");

        let child_config = if template.model.is_some() {
            AgentConfig { model_override: template.model.clone(), ..self.config.clone() }
        } else {
            self.config.clone()
        };

        let sys_msg = Message { id: Uuid::new_v4().to_string(), role: Role::System, content: system_content, tool_calls: None, rich_content: None, created_at: Utc::now() };
        let user_msg = Message { id: Uuid::new_v4().to_string(), role: Role::User, content: task.description.clone(), tool_calls: None, rich_content: None, created_at: Utc::now() };

        self.conversation.save_message(&conv_id, &sys_msg).await?;
        self.conversation.save_message(&conv_id, &user_msg).await?;

        let messages = vec![sys_msg, user_msg];
        let child_ctx = ToolExecutionContext {
            session_id: Some(conv_id.clone()),
            conversation_id: Some(conv_id.clone()),
            run_id: None,
            delegation_depth: 1,
            workspace_override: Some(agent_workspace),
        };

        let (response, all_messages) = with_tool_execution_context(
            child_ctx,
            run_react_loop(self.provider.clone(), registry, scoped_ctx, messages, &child_config, None),
        ).await?;

        // Persist messages
        for msg in all_messages.iter().skip(2) {
            let _ = self.conversation.save_message(&conv_id, msg).await;
        }

        // Mark task done
        self.store.update_task_status(&UpdateTaskInput {
            task_id: task.id.clone(),
            status: TaskStatus::Done,
            result: Some(response.content.clone()),
            block_reason: None,
        }).await?;

        // Write system-level daily note
        let note = format_task_completion_note(&task.id, &task.title, agent_name, &response.content);
        let _ = self.memory.write_memory(&note, true);

        // Log to agent task memory
        let _ = self.task_memory.append_task(agent_name, &task.description, &response.content);

        // Notify originating conversation
        if let Some(notify_conv) = &task.notify_conversation_id {
            let notification = format!(
                "📋 **Task complete:** {}\n**Agent:** {}\n**Result:** {}\n\nCall `review_task` to approve or request revision.",
                task.title, agent_name, &response.content
            );
            self.broadcast_tx.send(serde_json::json!({
                "type": "task_review_ready",
                "task_id": task.id,
                "conversation_id": notify_conv,
                "agent_name": agent_name,
                "title": task.title,
                "result": response.content,
                "notification": notification,
            })).ok();
        }

        Ok(())
    }
}

pub fn format_task_completion_note(task_id: &str, title: &str, agent: &str, result: &str) -> String {
    let now = Utc::now().format("%Y-%m-%d %H:%M").to_string();
    let preview = if result.len() > 500 { &result[..500] } else { result };
    format!("## {title}\n\n- **Time**: {now}\n- **Agent**: {agent}\n- **Task ID**: {task_id}\n\n{preview}\n\n---\n\n")
}
```

- [ ] **Step 6.4: Run tests**

```bash
cargo test -p rushdino-agent kanban_dispatcher 2>&1 | tail -20
cargo build -p rushdino-agent 2>&1 | tail -20
```

- [ ] **Step 6.5: Commit**

```bash
git add crates/agent/src/kanban_dispatcher.rs crates/agent/src/lib.rs
git commit -m "feat(kanban): add KanbanDispatcher background polling loop with task execution and memory"
```

---

### Task 7: Wire dispatcher into engine startup

**Files:**
- Modify: `crates/agent/src/engine_deps.rs`
- Modify: `crates/agent/src/engine.rs`
- Modify: `crates/server/src/chat_broadcast.rs`
- Modify: `crates/server/src/lib.rs`

- [ ] **Step 7.1: Add `home_dir` and `broadcast_tx` to `EngineDeps`**

`EngineDeps` currently stores no `home_dir` (it's only a local var in `build_engine_deps`). The dispatcher needs it.

In `crates/agent/src/engine_deps.rs`:

1. Add fields to `EngineDeps`:
```rust
pub home_dir: PathBuf,
pub broadcast_tx: tokio::sync::broadcast::Sender<serde_json::Value>,
```

2. Update `build_engine_deps` signature to accept `broadcast_tx`:
```rust
pub fn build_engine_deps(
    provider: Arc<Provider>,
    pool: Arc<SqlitePool>,
    home_dir: PathBuf,
    brave_api_key: Option<String>,
    gemini_api_key: Option<String>,
    config: &AgentConfig,
    runtime: Arc<AgentRuntime>,
    system_broker: SharedSystemBroker,
    knowledge_graph: Option<Arc<dyn KnowledgeGraphAccess>>,
    egress_proxy: Option<Arc<EgressProxy>>,
    broadcast_tx: tokio::sync::broadcast::Sender<serde_json::Value>,  // NEW
) -> Result<EngineDeps>
```

3. In the `Ok(EngineDeps { ... })` return block, add:
```rust
home_dir,
broadcast_tx,
```

- [ ] **Step 7.2: Fix all callers of `build_engine_deps`**

Find callers:
```bash
grep -rn "build_engine_deps(" /Users/kien.ha/Code/RushDino/crates/ --include="*.rs"
```

Each caller must pass the broadcast_tx. In `crates/server/src/lib.rs`:

```rust
// Expose sender from ChatBroadcastHub
let broadcast_tx = chat_broadcast.sender();
let deps = build_engine_deps(..., broadcast_tx)?;
```

- [ ] **Step 7.3: Expose `sender()` from `ChatBroadcastHub`**

In `crates/server/src/chat_broadcast.rs`, add:
```rust
pub fn sender(&self) -> tokio::sync::broadcast::Sender<serde_json::Value> {
    self.tx.clone()
}
```

- [ ] **Step 7.4: Wire dispatcher in `AgentEngine::new()`**

In `crates/agent/src/engine.rs`, after the engine is fully set up:

```rust
use crate::kanban_dispatcher::KanbanDispatcher;

let dispatcher = Arc::new(KanbanDispatcher::new(
    deps.kanban_store.clone(),
    agent_manager.clone(),
    provider.clone(),
    config.clone(),
    Arc::downgrade(&tool_registry),
    Arc::downgrade(&session_ctx),
    memory.clone(),
    skill_manager.clone(),
    conversation.clone(),
    task_memory.clone(),
    deps.home_dir.clone(),
    deps.broadcast_tx.clone(),
));
dispatcher.start();
```

- [ ] **Step 7.5: Build the whole project**

```bash
cargo build 2>&1 | tail -30
```

Fix any remaining compile errors.

- [ ] **Step 7.6: Run full test suite**

```bash
cargo test 2>&1 | grep -E "FAILED|error|passed|test result" | tail -20
```

- [ ] **Step 7.7: Commit**

```bash
git add crates/agent/src/engine_deps.rs crates/agent/src/engine.rs crates/server/src/chat_broadcast.rs crates/server/src/lib.rs
git commit -m "feat(engine): start KanbanDispatcher on engine init"
```

---

### Task 8: Handle `task_review_ready` in frontend

**Files:**
- Modify: `frontend/src/hooks/use-websocket.ts`
- Modify: `frontend/src/lib/types.ts`

- [ ] **Step 8.1: Add `task_review_ready` to the WebSocket message handler**

In `use-websocket.ts`, in the message dispatch switch/if chain, add:

```typescript
if (msg.type === 'task_review_ready') {
  // Inject as a system notification item in the timeline
  const notificationItem: TimelineItem = {
    kind: 'assistant',
    id: crypto.randomUUID(),
    content: msg.notification,
  };
  setItems((prev) => [...prev, notificationItem]);
  return;
}
```

- [ ] **Step 8.2: Add `task_review_ready` to `WsMessage` type**

In `frontend/src/lib/types.ts`:

```typescript
| { type: 'task_review_ready'; task_id: string; conversation_id: string; agent_name: string; title: string; result: string; notification: string }
```

- [ ] **Step 8.3: Build frontend**

```bash
cd /Users/kien.ha/Code/RushDino/frontend && npm run build 2>&1 | tail -20
```

- [ ] **Step 8.4: Commit**

```bash
git add frontend/src/hooks/use-websocket.ts frontend/src/lib/types.ts
git commit -m "feat(frontend): show task_review_ready notifications in workspace timeline"
```

---

## Final Verification

- [ ] **Full build**

```bash
cd /Users/kien.ha/Code/RushDino && cargo build 2>&1 | tail -10
cd frontend && npm run build 2>&1 | tail -10
```

- [ ] **Full test suite**

```bash
cd /Users/kien.ha/Code/RushDino && cargo test 2>&1 | grep -E "test result|FAILED" | tail -20
```

- [ ] **Manual smoke test**
1. Start server: `cargo run -p rushdino-server`
2. Open workspace at `localhost:5173`
3. Send: "tim thông tin về GPT-5.4 a xem"
4. Expect: agent reasons → calls `post_task` with `["research","web-search"]` tags
5. Expect: dispatcher picks it up within 5s → researcher agent runs
6. Expect: `task_review_ready` notification appears in workspace
7. Expect: daily note written to `~/.rushdino/memory/daily/YYYY-MM-DD.md`

- [ ] **Verify daily notes written**

```bash
ls ~/.rushdino/memory/daily/
cat ~/.rushdino/memory/daily/$(date +%Y-%m-%d).md
```

---

## Summary of Files Changed

| File | Change |
|---|---|
| `crates/agent/src/system_prompt.rs` | Add `AgentEntry`, `agents` field, `build_agents_section()` |
| `crates/agent/src/engine_bootstrap.rs` | Pass agents to `system_message()` |
| `crates/agent/src/engine.rs` | Default `ThinkingLevel::Medium`, start dispatcher |
| `crates/agent/src/engine_deps.rs` | Add `home_dir` + `broadcast_tx` fields; update `build_engine_deps` signature |
| `crates/agent/src/tools/session_tools.rs` | Update `system_message()` call |
| `crates/agent/src/tools/kanban_tools.rs` | Add `notify_conversation_id` to `post_task` |
| `crates/agent/src/kanban_store.rs` | Add `notify_conversation_id` field + DB column |
| `crates/agent/src/memory.rs` | Fix `write_memory` daily append (was overwrite) |
| `crates/agent/src/tools/delegate_to_agent.rs` | Make `parse_tool_list` `pub(crate)` |
| `crates/agent/src/kanban_dispatcher.rs` | **NEW** — background dispatcher |
| `crates/agent/src/lib.rs` | Add `pub mod kanban_dispatcher` |
| `crates/common/migrations/007_kanban_notify_conversation.sql` | **NEW** — DB migration |
| `crates/server/src/chat_broadcast.rs` | Expose `sender()` |
| `crates/server/src/lib.rs` | Pass `broadcast_tx` to engine deps |
| `frontend/src/hooks/use-websocket.ts` | Handle `task_review_ready` |
| `frontend/src/lib/types.ts` | Add `task_review_ready` WS type |
| `~/.rushdino/AGENTS.md` | Task routing + memory guidance |
| `~/.rushdino/SOUL.md` | Fix Continuity section conflict |
