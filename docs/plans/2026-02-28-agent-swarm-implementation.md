# Agent Team / Swarm Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Upgrade the single `AgentEngine` to a multi-agent team where a General Assistant always receives messages first, any agent can delegate via a `delegate_to_agent` tool, 12 specialist agents are bundled as TOML templates, and a Spawn Agent can create new agents at runtime.

**Architecture:** Every user message enters via `general-assistant` (loaded from `AgentManager`). Any agent in the react_loop can call `delegate_to_agent(agent_name, task)` which runs a nested react_loop with the target agent's system_prompt (max depth 3). All agents share the same global `ToolRegistry`. A `SpawnAgentTool` writes new agent TOML files to `~/.rushdino/agents/`.

**Tech Stack:** Rust, tokio, serde/toml, `Arc::new_cyclic` for self-referential tool registry, `tokio::task_local!` for delegation depth tracking via `ToolExecutionContext`.

---

## Overview of Changes

| File | Action |
|------|--------|
| `crates/agent/src/agent_manager.rs` | CREATE |
| `crates/agent/src/tools/delegate_to_agent.rs` | CREATE |
| `crates/agent/src/tools/spawn_agent.rs` | CREATE |
| `crates/common/src/agents.rs` | CREATE |
| `crates/common/src/agents/*.toml` | CREATE (12 files) |
| `crates/agent/src/tools/shell_exec.rs` | MODIFY — add `delegation_depth` |
| `crates/agent/src/engine_bootstrap.rs` | MODIFY — wire new tools + AgentManager |
| `crates/agent/src/engine.rs` | MODIFY — use general-assistant system prompt |
| `crates/agent/src/lib.rs` | MODIFY — export AgentManager |
| `crates/agent/src/tools/mod.rs` | MODIFY — add new tool modules |
| `crates/common/src/lib.rs` | MODIFY — export agents module |
| `crates/common/src/init.rs` | MODIFY — create agents dir + write bundled TOMLs |

---

## Task 1: Create `AgentManager`

**Files:**
- Create: `crates/agent/src/agent_manager.rs`

### Step 1: Write failing test

Add to bottom of new file `crates/agent/src/agent_manager.rs`:

```rust
use std::{fs, path::PathBuf};

use serde::{Deserialize, Serialize};

use rushdino_common::{AppError, Result};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AgentTemplate {
    pub name: String,
    pub description: String,
    pub system_prompt: String,
    pub icon: Option<String>,
}

pub struct AgentManager {
    agents_dir: PathBuf,
}

impl AgentManager {
    pub fn new(agents_dir: PathBuf) -> Self {
        Self { agents_dir }
    }

    pub fn get(&self, name: &str) -> Option<AgentTemplate> {
        let path = self.agents_dir.join(format!("{name}.toml"));
        let content = fs::read_to_string(path).ok()?;
        toml::from_str(&content).ok()
    }

    pub fn list(&self) -> Vec<AgentTemplate> {
        let Ok(entries) = fs::read_dir(&self.agents_dir) else {
            return Vec::new();
        };
        entries
            .filter_map(|e| e.ok())
            .filter(|e| e.path().extension().and_then(|x| x.to_str()) == Some("toml"))
            .filter_map(|e| fs::read_to_string(e.path()).ok())
            .filter_map(|content| toml::from_str(&content).ok())
            .collect()
    }

    pub fn save(&self, template: &AgentTemplate) -> Result<PathBuf> {
        fs::create_dir_all(&self.agents_dir)?;
        let path = self.agents_dir.join(format!("{}.toml", template.name));
        let content = toml::to_string_pretty(template)
            .map_err(|e| AppError::Validation(format!("failed to serialize agent: {e}")))?;
        fs::write(&path, content)?;
        Ok(path)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir() -> PathBuf {
        let dir = std::env::temp_dir()
            .join(format!("rushdino-agents-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn sample() -> AgentTemplate {
        AgentTemplate {
            name: "test-agent".to_owned(),
            description: "A test agent".to_owned(),
            system_prompt: "You are a test agent.".to_owned(),
            icon: Some("🧪".to_owned()),
        }
    }

    #[test]
    fn get_returns_none_for_missing_file() {
        let mgr = AgentManager::new(temp_dir());
        assert!(mgr.get("nonexistent").is_none());
    }

    #[test]
    fn save_and_get_round_trip() {
        let dir = temp_dir();
        let mgr = AgentManager::new(dir.clone());
        let tmpl = sample();
        mgr.save(&tmpl).unwrap();
        let loaded = mgr.get("test-agent").unwrap();
        assert_eq!(loaded, tmpl);
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn list_returns_all_valid_tomls() {
        let dir = temp_dir();
        let mgr = AgentManager::new(dir.clone());
        mgr.save(&sample()).unwrap();
        let list = mgr.list();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].name, "test-agent");
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn list_skips_invalid_toml() {
        let dir = temp_dir();
        fs::write(dir.join("bad.toml"), "not valid toml ][").unwrap();
        let mgr = AgentManager::new(dir.clone());
        assert!(mgr.list().is_empty());
        let _ = fs::remove_dir_all(dir);
    }
}
```

### Step 2: Run test to verify it fails

```bash
cargo test -p rushdino-agent agent_manager -- --nocapture 2>&1 | head -30
```

Expected: compile error — `uuid` import or module not found.

### Step 3: Register module in `lib.rs`

In `crates/agent/src/lib.rs`, add:
```rust
pub mod agent_manager;
pub use agent_manager::{AgentManager, AgentTemplate};
```

### Step 4: Run tests again

```bash
cargo test -p rushdino-agent agent_manager -- --nocapture
```

Expected: all 4 tests PASS.

### Step 5: Commit

```bash
git add crates/agent/src/agent_manager.rs crates/agent/src/lib.rs
git commit -m "feat(agent): add AgentManager and AgentTemplate"
```

---

## Task 2: Add `delegation_depth` to `ToolExecutionContext`

**Files:**
- Modify: `crates/agent/src/tools/shell_exec.rs`

### Step 1: Write failing test

At the bottom of `shell_exec.rs`, add to the existing `#[cfg(test)]` block (or create one):

```rust
#[cfg(test)]
mod context_tests {
    use super::*;

    #[test]
    fn default_delegation_depth_is_zero() {
        let ctx = ToolExecutionContext {
            session_id: None,
            conversation_id: None,
            delegation_depth: 0,
        };
        assert_eq!(ctx.delegation_depth, 0);
    }
}
```

### Step 2: Run test to verify it fails

```bash
cargo test -p rushdino-agent context_tests -- --nocapture 2>&1 | head -20
```

Expected: compile error — `delegation_depth` field does not exist.

### Step 3: Add the field

In `crates/agent/src/tools/shell_exec.rs`, update the struct:

```rust
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ToolExecutionContext {
    pub session_id: Option<String>,
    pub conversation_id: Option<String>,
    pub delegation_depth: u8,
}
```

### Step 4: Fix all construction sites

Find all places that construct `ToolExecutionContext`. Run:

```bash
grep -rn "ToolExecutionContext {" crates/
```

In `crates/agent/src/engine.rs`, update the one construction site:

```rust
let context = ToolExecutionContext {
    session_id: Some(session_id.to_owned()),
    conversation_id: Some(conversation_id.clone()),
    delegation_depth: 0,
};
```

### Step 5: Run tests

```bash
cargo test --workspace -- --nocapture 2>&1 | tail -20
```

Expected: all tests PASS (no compile errors).

### Step 6: Commit

```bash
git add crates/agent/src/tools/shell_exec.rs crates/agent/src/engine.rs
git commit -m "feat(agent): add delegation_depth to ToolExecutionContext"
```

---

## Task 3: Create `DelegateToAgentTool`

**Files:**
- Create: `crates/agent/src/tools/delegate_to_agent.rs`
- Modify: `crates/agent/src/tools/mod.rs`

The tool holds a `Weak<ToolRegistry>` (injected via `Arc::new_cyclic` in Task 5) to avoid a reference cycle. It runs a nested `run_react_loop` with the target agent's system_prompt.

### Step 1: Write the tool file

Create `crates/agent/src/tools/delegate_to_agent.rs`:

```rust
use std::sync::{Arc, Weak};

use async_trait::async_trait;
use chrono::Utc;
use serde_json::{json, Value};
use uuid::Uuid;

use rushdino_common::{models::{Message, Role}, AppError, Result};
use rushdino_providers::Provider;

use crate::{
    agent_manager::AgentManager,
    engine::AgentConfig,
    react_loop::run_react_loop,
    tool_registry::{Tool, ToolRegistry},
    tools::shell_exec::{
        current_tool_execution_context, with_tool_execution_context, ToolExecutionContext,
    },
};

pub const MAX_DELEGATION_DEPTH: u8 = 3;

pub struct DelegateToAgentTool {
    agent_manager: Arc<AgentManager>,
    provider: Arc<Provider>,
    config: AgentConfig,
    /// Weak to break the cycle: ToolRegistry → DelegateToAgentTool → ToolRegistry
    registry: Weak<ToolRegistry>,
}

impl DelegateToAgentTool {
    pub fn new(
        agent_manager: Arc<AgentManager>,
        provider: Arc<Provider>,
        config: AgentConfig,
        registry: Weak<ToolRegistry>,
    ) -> Self {
        Self { agent_manager, provider, config, registry }
    }
}

#[async_trait]
impl Tool for DelegateToAgentTool {
    fn name(&self) -> &str {
        "delegate_to_agent"
    }

    fn description(&self) -> &str {
        "Delegate the current task to a more suitable specialist agent. \
         Use this when you determine the task is outside your domain. \
         Available agents: general-assistant, code-reviewer, researcher, writer, \
         planner, data-analyst, devops-engineer, software-engineer, \
         artist-designer, content-creator, social-network-assistant, spawn-agent."
    }

    fn parameters(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "agent_name": {
                    "type": "string",
                    "description": "Name of the target agent (e.g. 'researcher', 'code-reviewer')"
                },
                "task": {
                    "type": "string",
                    "description": "The task description to pass to the target agent"
                }
            },
            "required": ["agent_name", "task"]
        })
    }

    async fn execute(&self, args: Value) -> Result<String> {
        let agent_name = args
            .get("agent_name")
            .and_then(Value::as_str)
            .ok_or_else(|| AppError::Validation("agent_name is required".to_owned()))?;
        let task = args
            .get("task")
            .and_then(Value::as_str)
            .ok_or_else(|| AppError::Validation("task is required".to_owned()))?;

        // Enforce delegation depth limit
        let current_depth = current_tool_execution_context()
            .map(|c| c.delegation_depth)
            .unwrap_or(0);
        if current_depth >= MAX_DELEGATION_DEPTH {
            return Err(AppError::Agent(format!(
                "max delegation depth ({MAX_DELEGATION_DEPTH}) reached; cannot delegate to {agent_name}"
            )));
        }

        // Load target agent template
        let template = self
            .agent_manager
            .get(agent_name)
            .ok_or_else(|| AppError::Agent(format!("unknown agent: {agent_name}")))?;

        // Upgrade Weak registry reference
        let registry = self
            .registry
            .upgrade()
            .ok_or_else(|| AppError::Agent("tool registry unavailable".to_owned()))?;

        // Build messages: target's system prompt + the delegated task
        let messages = vec![
            Message {
                id: Uuid::new_v4().to_string(),
                role: Role::System,
                content: template.system_prompt,
                tool_calls: None,
                created_at: Utc::now(),
            },
            Message {
                id: Uuid::new_v4().to_string(),
                role: Role::User,
                content: task.to_owned(),
                tool_calls: None,
                created_at: Utc::now(),
            },
        ];

        // Run nested react_loop with incremented depth
        let parent_ctx = current_tool_execution_context().unwrap_or(ToolExecutionContext {
            session_id: None,
            conversation_id: None,
            delegation_depth: 0,
        });
        let child_ctx = ToolExecutionContext {
            delegation_depth: current_depth + 1,
            ..parent_ctx
        };

        let (response, _) = with_tool_execution_context(
            child_ctx,
            run_react_loop(self.provider.clone(), registry, messages, &self.config),
        )
        .await?;

        Ok(response.content)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;
    use crate::{agent_manager::AgentTemplate, tool_registry::ToolRegistry};

    fn make_tool(agent_manager: Arc<AgentManager>) -> DelegateToAgentTool {
        // Use a dead weak reference — we only test depth logic, not actual delegation
        let weak: Weak<ToolRegistry> = Weak::new();
        DelegateToAgentTool {
            agent_manager,
            provider: Arc::new(rushdino_providers::Provider::Noop),
            config: AgentConfig::default(),
            registry: weak,
        }
    }

    #[tokio::test]
    async fn returns_error_for_unknown_agent() {
        let dir = std::env::temp_dir()
            .join(format!("test-delegate-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let mgr = Arc::new(AgentManager::new(dir));
        let tool = make_tool(mgr);
        let result = tool
            .execute(serde_json::json!({"agent_name": "nonexistent", "task": "do it"}))
            .await;
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("unknown agent"));
    }

    #[tokio::test]
    async fn respects_max_delegation_depth() {
        let dir = std::env::temp_dir()
            .join(format!("test-depth-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let mgr = Arc::new(AgentManager::new(dir.clone()));
        // Create a real agent so name lookup passes
        mgr.save(&AgentTemplate {
            name: "researcher".to_owned(),
            description: "Researcher".to_owned(),
            system_prompt: "You are a researcher.".to_owned(),
            icon: None,
        }).unwrap();
        let tool = make_tool(mgr);

        // Simulate max depth already reached
        let ctx = ToolExecutionContext {
            session_id: None,
            conversation_id: None,
            delegation_depth: MAX_DELEGATION_DEPTH,
        };
        let result = with_tool_execution_context(
            ctx,
            tool.execute(serde_json::json!({"agent_name": "researcher", "task": "find stuff"})),
        )
        .await;
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("max delegation depth"));
        let _ = std::fs::remove_dir_all(dir);
    }
}
```

**Note on `Provider::Noop`:** If `Provider` doesn't have a `Noop` variant, replace with a mock. Check `crates/providers/src/lib.rs` first — if no Noop exists, skip the provider-dependent tests and only test depth/name-lookup logic.

### Step 2: Register in `tools/mod.rs`

In `crates/agent/src/tools/mod.rs`, add:
```rust
pub mod delegate_to_agent;
pub mod spawn_agent;  // will be added in Task 4
```

### Step 3: Run tests

```bash
cargo test -p rushdino-agent delegate_to_agent -- --nocapture 2>&1 | tail -30
```

Expected: tests for `returns_error_for_unknown_agent` and `respects_max_delegation_depth` PASS.

### Step 4: Commit

```bash
git add crates/agent/src/tools/delegate_to_agent.rs crates/agent/src/tools/mod.rs
git commit -m "feat(agent): add DelegateToAgentTool with depth limiting"
```

---

## Task 4: Create `SpawnAgentTool`

**Files:**
- Create: `crates/agent/src/tools/spawn_agent.rs`

### Step 1: Write the tool

```rust
use std::sync::Arc;

use async_trait::async_trait;
use serde_json::{json, Value};

use rushdino_common::{AppError, Result};

use crate::{
    agent_manager::{AgentManager, AgentTemplate},
    tool_registry::Tool,
};

pub struct SpawnAgentTool {
    agent_manager: Arc<AgentManager>,
}

impl SpawnAgentTool {
    pub fn new(agent_manager: Arc<AgentManager>) -> Self {
        Self { agent_manager }
    }
}

#[async_trait]
impl Tool for SpawnAgentTool {
    fn name(&self) -> &str {
        "spawn_agent"
    }

    fn description(&self) -> &str {
        "Create a new custom agent template. The agent will be saved as a TOML file \
         and immediately available for delegation. Use this when no existing agent \
         fits the user's specialized need."
    }

    fn parameters(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "description": "Unique kebab-case agent name (e.g. 'sql-optimizer')"
                },
                "description": {
                    "type": "string",
                    "description": "One-sentence description of this agent's domain"
                },
                "system_prompt": {
                    "type": "string",
                    "description": "Full system prompt for this agent"
                },
                "icon": {
                    "type": "string",
                    "description": "Optional emoji icon for the agent"
                }
            },
            "required": ["name", "description", "system_prompt"]
        })
    }

    async fn execute(&self, args: Value) -> Result<String> {
        let name = args
            .get("name")
            .and_then(Value::as_str)
            .ok_or_else(|| AppError::Validation("name is required".to_owned()))?;
        let description = args
            .get("description")
            .and_then(Value::as_str)
            .ok_or_else(|| AppError::Validation("description is required".to_owned()))?;
        let system_prompt = args
            .get("system_prompt")
            .and_then(Value::as_str)
            .ok_or_else(|| AppError::Validation("system_prompt is required".to_owned()))?;
        let icon = args.get("icon").and_then(Value::as_str).map(str::to_owned);

        let template = AgentTemplate {
            name: name.to_owned(),
            description: description.to_owned(),
            system_prompt: system_prompt.to_owned(),
            icon,
        };

        let path = self.agent_manager.save(&template)?;
        Ok(format!("agent '{}' created at {}", name, path.display()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[tokio::test]
    async fn creates_agent_toml_file() {
        let dir = std::env::temp_dir()
            .join(format!("test-spawn-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        let mgr = Arc::new(AgentManager::new(dir.clone()));
        let tool = SpawnAgentTool::new(mgr.clone());

        let result = tool.execute(serde_json::json!({
            "name": "sql-optimizer",
            "description": "Optimizes SQL queries",
            "system_prompt": "You are a SQL expert.",
            "icon": "🗄️"
        })).await.unwrap();

        assert!(result.contains("sql-optimizer"));
        let loaded = mgr.get("sql-optimizer").unwrap();
        assert_eq!(loaded.name, "sql-optimizer");
        assert_eq!(loaded.system_prompt, "You are a SQL expert.");

        let _ = fs::remove_dir_all(dir);
    }

    #[tokio::test]
    async fn returns_error_when_name_missing() {
        let dir = std::env::temp_dir()
            .join(format!("test-spawn-err-{}", uuid::Uuid::new_v4()));
        let mgr = Arc::new(AgentManager::new(dir));
        let tool = SpawnAgentTool::new(mgr);
        let result = tool.execute(serde_json::json!({"description": "x", "system_prompt": "y"})).await;
        assert!(result.is_err());
    }
}
```

### Step 2: Run tests

```bash
cargo test -p rushdino-agent spawn_agent -- --nocapture
```

Expected: both tests PASS.

### Step 3: Commit

```bash
git add crates/agent/src/tools/spawn_agent.rs
git commit -m "feat(agent): add SpawnAgentTool for runtime agent creation"
```

---

## Task 5: Create 12 Bundled Agent TOML Templates

**Files:**
- Create: `crates/common/src/agents/general-assistant.toml`
- Create: `crates/common/src/agents/code-reviewer.toml`
- Create: `crates/common/src/agents/researcher.toml`
- Create: `crates/common/src/agents/writer.toml`
- Create: `crates/common/src/agents/planner.toml`
- Create: `crates/common/src/agents/data-analyst.toml`
- Create: `crates/common/src/agents/devops-engineer.toml`
- Create: `crates/common/src/agents/software-engineer.toml`
- Create: `crates/common/src/agents/artist-designer.toml`
- Create: `crates/common/src/agents/content-creator.toml`
- Create: `crates/common/src/agents/social-network-assistant.toml`
- Create: `crates/common/src/agents/spawn-agent.toml`
- Create: `crates/common/src/agents.rs`

### Step 1: Create the agents directory

```bash
mkdir -p crates/common/src/agents
```

### Step 2: Create each TOML file

**`general-assistant.toml`:**
```toml
name = "general-assistant"
description = "General purpose assistant — entry point for all user messages. Handles everyday tasks and delegates specialized work to domain experts."
icon = "🤖"
system_prompt = """
You are a helpful general assistant. You are the first point of contact for all user requests.

Your responsibilities:
1. Handle general questions and everyday tasks directly.
2. For specialized tasks, delegate to the most appropriate specialist using the delegate_to_agent tool.
3. When unsure whether to delegate, attempt the task yourself first.

Available specialists you can delegate to:
- code-reviewer: code review, bugs, security, style issues
- researcher: web research, fact-finding, summarization
- writer: articles, emails, documentation, creative writing
- planner: project plans, task breakdowns, timelines
- data-analyst: data analysis, statistics, visualization guidance
- devops-engineer: CI/CD, Docker, infrastructure, shell scripts
- software-engineer: architecture, implementation, debugging
- artist-designer: UI/UX, design feedback, color, layout
- content-creator: blog posts, SEO, marketing copy
- social-network-assistant: social media strategy, engagement
- spawn-agent: create a new custom agent for specialized needs

Always aim to give the user the most helpful and accurate response possible.
"""
```

**`code-reviewer.toml`:**
```toml
name = "code-reviewer"
description = "Expert code reviewer — analyzes code for bugs, security vulnerabilities, style issues, and improvement opportunities."
icon = "🔍"
system_prompt = """
You are an expert code reviewer with 15+ years of software engineering experience.

Your responsibilities:
- Review code for correctness, bugs, and logical errors
- Identify security vulnerabilities (OWASP Top 10, injection, XSS, etc.)
- Suggest style and readability improvements
- Recommend performance optimizations
- Ensure best practices for the language/framework in use

If the task is not code-related, use delegate_to_agent to hand off to a more suitable agent.

Format your reviews with clear sections: Summary, Issues Found, Recommendations.
"""
```

**`researcher.toml`:**
```toml
name = "researcher"
description = "Research specialist — finds information, synthesizes sources, and provides well-cited summaries on any topic."
icon = "📚"
system_prompt = """
You are a thorough research specialist with expertise in finding, evaluating, and synthesizing information.

Your responsibilities:
- Search for accurate and up-to-date information using available tools
- Evaluate source credibility and cross-reference claims
- Synthesize findings into clear, structured summaries
- Cite sources and acknowledge uncertainty where it exists

If the task requires writing/editing rather than research, delegate to the writer agent.
If it requires data analysis, delegate to the data-analyst agent.

Always distinguish between established facts, expert consensus, and speculation.
"""
```

**`writer.toml`:**
```toml
name = "writer"
description = "Professional writer — crafts articles, documentation, emails, and creative content with clarity and style."
icon = "✍️"
system_prompt = """
You are a skilled professional writer with expertise across technical writing, creative writing, and business communication.

Your responsibilities:
- Write clear, engaging content tailored to the audience and purpose
- Edit and improve existing text for clarity, flow, and impact
- Draft emails, reports, documentation, blog posts, and creative pieces
- Adapt tone and style to match the context (formal, casual, technical, creative)

If the task primarily requires research, delegate to the researcher agent.
If it's marketing/social media focused, delegate to the content-creator agent.
"""
```

**`planner.toml`:**
```toml
name = "planner"
description = "Strategic planner — breaks down goals into actionable plans, tasks, and timelines."
icon = "📋"
system_prompt = """
You are an expert strategic planner and project manager.

Your responsibilities:
- Break complex goals into clear, actionable tasks
- Create realistic timelines and identify dependencies
- Define success criteria and milestones
- Anticipate risks and suggest mitigations
- Structure work into phases or sprints

Use structured formats: numbered lists, tables, Gantt-style breakdowns where helpful.
If the task requires technical implementation details, delegate to the software-engineer agent.
"""
```

**`data-analyst.toml`:**
```toml
name = "data-analyst"
description = "Data analysis expert — interprets data, performs statistical analysis, and provides actionable insights."
icon = "📊"
system_prompt = """
You are a skilled data analyst with expertise in statistics, data interpretation, and visualization.

Your responsibilities:
- Analyze datasets and extract meaningful patterns
- Perform statistical calculations and hypothesis testing
- Suggest appropriate visualizations for different data types
- Interpret results and provide business insights
- Write data processing scripts (Python, SQL, etc.) when needed

Always explain your analytical reasoning and quantify uncertainty in conclusions.
If the task is primarily coding/engineering, delegate to the software-engineer agent.
"""
```

**`devops-engineer.toml`:**
```toml
name = "devops-engineer"
description = "DevOps engineer — handles CI/CD pipelines, infrastructure, Docker, Kubernetes, and automation scripts."
icon = "⚙️"
system_prompt = """
You are a senior DevOps engineer with deep expertise in infrastructure, automation, and deployment.

Your responsibilities:
- Design and troubleshoot CI/CD pipelines (GitHub Actions, GitLab CI, Jenkins)
- Write Dockerfiles, docker-compose, and Kubernetes manifests
- Configure cloud infrastructure (AWS, GCP, Azure) and IaC (Terraform, Pulumi)
- Write shell scripts and automation tooling
- Diagnose deployment issues and system reliability problems

Always prioritize security, reliability, and repeatability in your solutions.
If the task is application-level code review, delegate to code-reviewer.
"""
```

**`software-engineer.toml`:**
```toml
name = "software-engineer"
description = "Software engineer — designs architecture, implements features, debugs complex issues across any language or stack."
icon = "💻"
system_prompt = """
You are a senior software engineer with broad expertise across systems design, implementation, and debugging.

Your responsibilities:
- Design clean, maintainable architectures and APIs
- Implement features across any programming language or framework
- Debug complex issues by analyzing logs, stack traces, and code
- Write efficient algorithms and data structures
- Review architecture decisions and suggest improvements

Prefer simple, correct solutions over clever ones. Explain your reasoning.
For DevOps/deployment tasks, delegate to devops-engineer.
For pure code review, delegate to code-reviewer.
"""
```

**`artist-designer.toml`:**
```toml
name = "artist-designer"
description = "UI/UX and design expert — provides design feedback, color theory, layout advice, and creative direction."
icon = "🎨"
system_prompt = """
You are a creative UI/UX designer and visual artist with expertise in design principles and user experience.

Your responsibilities:
- Provide design feedback on UI layouts, color schemes, and typography
- Apply design principles (hierarchy, contrast, alignment, proximity)
- Suggest improvements for user experience and accessibility (WCAG)
- Give creative direction for branding, illustration, and visual identity
- Describe designs in terms implementable by developers

Reference established design systems (Material Design, Apple HIG, etc.) where appropriate.
If the task requires writing marketing copy, delegate to content-creator.
"""
```

**`content-creator.toml`:**
```toml
name = "content-creator"
description = "Content creation specialist — produces blog posts, SEO-optimized copy, marketing campaigns, and branded content."
icon = "📱"
system_prompt = """
You are a professional content creator with expertise in digital marketing, SEO, and brand communication.

Your responsibilities:
- Write engaging blog posts, landing pages, and marketing copy
- Apply SEO best practices (keywords, meta descriptions, headings)
- Create content strategies and editorial calendars
- Adapt brand voice across different formats and platforms
- Write compelling calls-to-action and conversion-focused copy

Always consider the target audience and business goals.
For social media strategy specifically, delegate to social-network-assistant.
For general writing and editing, delegate to writer.
"""
```

**`social-network-assistant.toml`:**
```toml
name = "social-network-assistant"
description = "Social media strategist — advises on platform-specific strategies, content calendars, engagement tactics, and community building."
icon = "🌐"
system_prompt = """
You are a social media strategist and community manager with expertise across major platforms.

Your responsibilities:
- Craft platform-appropriate content (Twitter/X, LinkedIn, Instagram, TikTok, etc.)
- Develop social media strategies and content calendars
- Advise on hashtag strategies, posting times, and engagement tactics
- Analyze social media performance metrics and suggest improvements
- Draft replies, community management responses, and influencer outreach

Stay current with platform algorithm changes and best practices.
For broader content creation, delegate to content-creator.
"""
```

**`spawn-agent.toml`:**
```toml
name = "spawn-agent"
description = "Meta-agent that creates new specialized agent definitions for domains not covered by existing templates."
icon = "🧬"
system_prompt = """
You are a meta-agent specialized in creating new AI agent definitions.

Your responsibility is to create a new custom agent when the user needs a specialist that doesn't exist yet.

Process:
1. Understand the domain and specialized needs from the user's request
2. Design an appropriate name (kebab-case, descriptive), description, and system prompt
3. Use the spawn_agent tool to create the agent definition
4. Confirm the agent was created and explain how to use it via delegate_to_agent

Guidelines for good agent design:
- system_prompt should clearly define the agent's domain, responsibilities, and boundaries
- description should be one sentence summarizing the domain
- Include explicit instructions on when to delegate to other agents
- Keep system prompts focused — one agent, one domain

After creating the agent, you can immediately delegate tasks to it via delegate_to_agent.
"""
```

### Step 3: Create `crates/common/src/agents.rs`

```rust
/// Bundled agent templates embedded at compile time.
/// These are written to `~/.rushdino/agents/` on first run via `ensure_rushdino_dir_at`.
pub const BUNDLED_AGENTS: &[(&str, &str)] = &[
    ("general-assistant",        include_str!("agents/general-assistant.toml")),
    ("code-reviewer",            include_str!("agents/code-reviewer.toml")),
    ("researcher",               include_str!("agents/researcher.toml")),
    ("writer",                   include_str!("agents/writer.toml")),
    ("planner",                  include_str!("agents/planner.toml")),
    ("data-analyst",             include_str!("agents/data-analyst.toml")),
    ("devops-engineer",          include_str!("agents/devops-engineer.toml")),
    ("software-engineer",        include_str!("agents/software-engineer.toml")),
    ("artist-designer",          include_str!("agents/artist-designer.toml")),
    ("content-creator",          include_str!("agents/content-creator.toml")),
    ("social-network-assistant", include_str!("agents/social-network-assistant.toml")),
    ("spawn-agent",              include_str!("agents/spawn-agent.toml")),
];
```

### Step 4: Export from `crates/common/src/lib.rs`

Add to `crates/common/src/lib.rs`:
```rust
pub mod agents;
```

### Step 5: Verify compile

```bash
cargo check -p rushdino-common 2>&1 | head -30
```

Expected: compiles cleanly.

### Step 6: Commit

```bash
git add crates/common/src/agents/ crates/common/src/agents.rs crates/common/src/lib.rs
git commit -m "feat(common): add 12 bundled agent TOML templates"
```

---

## Task 6: Update `init.rs` to Provision `agents/` Dir

**Files:**
- Modify: `crates/common/src/init.rs`

### Step 1: Update `ensure_rushdino_dir_at`

In `crates/common/src/init.rs`, add `agents` to the directory list and write bundled TOMLs:

```rust
use crate::agents::BUNDLED_AGENTS;

pub fn ensure_rushdino_dir_at(home: &Path) -> Result<()> {
    fs::create_dir_all(home)?;
    for dir in [
        "documents",
        "plugins",
        "logs",
        "skills",
        "memory",
        "memory/daily",
        "agents",          // ADD THIS
    ] {
        fs::create_dir_all(home.join(dir))?;
    }

    // ... existing write_if_missing calls for config, credentials, memory files ...

    // ADD: Write bundled agent templates
    for (name, content) in BUNDLED_AGENTS {
        write_if_missing(
            &home.join("agents").join(format!("{name}.toml")),
            content.as_bytes(),
        )?;
    }

    Ok(())
}
```

### Step 2: Run existing test

```bash
cargo test -p rushdino-common ensure_dir -- --nocapture
```

Expected: PASS (the test checks `agents` dir isn't in the assertion list, so it won't break — but add it).

### Step 3: Update the test in `crates/common/src/tests.rs`

Add assertion to `ensure_dir_creates_expected_structure`:
```rust
assert!(root.join("agents").exists());
assert!(root.join("agents/general-assistant.toml").exists());
assert!(root.join("agents/spawn-agent.toml").exists());
```

### Step 4: Run tests again

```bash
cargo test -p rushdino-common -- --nocapture
```

Expected: all tests PASS.

### Step 5: Commit

```bash
git add crates/common/src/init.rs crates/common/src/tests.rs
git commit -m "feat(common): provision agents dir and write bundled templates on init"
```

---

## Task 7: Wire `AgentManager` into `engine_bootstrap.rs`

**Files:**
- Modify: `crates/agent/src/engine_bootstrap.rs`

This is the most complex task. We use `Arc::new_cyclic` to build a self-referential `ToolRegistry` where `DelegateToAgentTool` holds a `Weak<ToolRegistry>`.

### Step 1: Update `EngineDeps` struct

Add `agent_manager` field:
```rust
pub struct EngineDeps {
    pub conversation: Arc<ConversationManager>,
    pub tool_registry: Arc<ToolRegistry>,
    pub job_manager: Arc<JobManager>,
    pub orchestrator: Arc<Orchestrator>,
    pub memory: Arc<MemoryManager>,
    pub agent_manager: Arc<AgentManager>,   // ADD
    pub inbox_rx: mpsc::Receiver<JobResult>,
}
```

### Step 2: Update `build_engine_deps` signature

```rust
pub fn build_engine_deps(
    provider: Arc<Provider>,
    pool: Arc<SqlitePool>,
    home_dir: PathBuf,
    brave_api_key: Option<String>,
    config: &AgentConfig,
    approval: Option<Arc<dyn crate::tools::shell_exec::ToolApproval>>,
) -> Result<EngineDeps> {
```

(Signature unchanged — `AgentManager` is derived from `home_dir`.)

### Step 3: Replace registry construction with `Arc::new_cyclic`

Inside `build_engine_deps`, replace the existing `let mut registry = ToolRegistry::new(); ... let registry = Arc::new(registry);` block with:

```rust
use crate::{
    agent_manager::AgentManager,
    tools::{
        delegate_to_agent::DelegateToAgentTool,
        spawn_agent::SpawnAgentTool,
        // ... existing imports ...
    },
};

let agent_manager = Arc::new(AgentManager::new(home_dir.join("agents")));

// Arc::new_cyclic lets DelegateToAgentTool hold Weak<ToolRegistry>
// without creating a reference cycle.
let tool_registry = {
    let provider_ref = provider.clone();
    let agent_manager_ref = agent_manager.clone();
    let config_ref = config.clone();
    let memory_ref = memory.clone();
    let skills_ref = skills.clone();
    let jobs_ref = jobs.clone();
    let orchestrator_ref = orchestrator.clone();
    let home_ref = home_dir.clone();
    let brave_ref = brave_api_key.clone();
    let approval_ref = approval.clone();

    Arc::new_cyclic(|weak_registry| {
        let delegate_tool = DelegateToAgentTool::new(
            agent_manager_ref,
            provider_ref.clone(),
            config_ref,
            weak_registry.clone(),
        );

        let shell_exec = if let Some(gate) = approval_ref {
            ShellExecTool::new(config.tool_timeout_secs).with_approval(gate)
        } else {
            ShellExecTool::new(config.tool_timeout_secs)
        };

        let mut r = ToolRegistry::new();
        r.register(WebSearchTool::new(
            "https://api.search.brave.com/res/v1/web/search".to_owned(),
            brave_ref,
        ));
        r.register(FileReadTool::new(home_ref.join("documents")));
        r.register(shell_exec);
        r.register(MemoryReadTool::new(memory_ref.clone()));
        r.register(MemoryWriteTool::new(memory_ref));
        r.register(CreateJobTool::new(jobs_ref));
        r.register(SpawnSubAgentTool::new(orchestrator_ref));
        r.register(CreateSkillTool::new(skills_ref.clone()));
        r.register(ListSkillsTool::new(skills_ref));
        r.register(delegate_tool);
        r.register(SpawnAgentTool::new(
            Arc::new(AgentManager::new(home_dir.clone().join("agents")))
        ));
        r
    })
};

memory.render_tool_doc(&tool_registry.names())?;

Ok(EngineDeps {
    conversation: Arc::new(ConversationManager::new(pool)),
    tool_registry,
    job_manager: jobs,
    orchestrator,
    memory,
    agent_manager,
    inbox_rx,
})
```

**Note:** `Arc::new_cyclic` closure must be sync (not async), which is fine — we're just constructing the registry.

### Step 4: Check compile

```bash
cargo check -p rushdino-agent 2>&1 | head -40
```

Expected: any compile errors surfaced — fix them (likely import paths or missing `AgentConfig: Clone`).

### Step 5: Verify `AgentConfig` is `Clone`

`AgentConfig` derives `Debug, Clone` — check `engine.rs:21`. If `Clone` is missing, add it.

### Step 6: Run all tests

```bash
cargo test --workspace -- --nocapture 2>&1 | tail -30
```

Expected: all existing tests still pass.

### Step 7: Commit

```bash
git add crates/agent/src/engine_bootstrap.rs
git commit -m "feat(agent): wire AgentManager and DelegateToAgentTool via Arc::new_cyclic"
```

---

## Task 8: Update `engine.rs` to Use `general-assistant` System Prompt

**Files:**
- Modify: `crates/agent/src/engine.rs`
- Modify: `crates/agent/src/engine_bootstrap.rs`

### Step 1: Add `agent_manager` to `AgentEngine`

In `engine.rs`, update the struct:
```rust
pub struct AgentEngine {
    provider: Arc<Provider>,
    conversation: Arc<ConversationManager>,
    pub tool_registry: Arc<ToolRegistry>,
    _job_manager: Arc<JobManager>,
    _orchestrator: Arc<Orchestrator>,
    memory: Arc<MemoryManager>,
    agent_manager: Arc<AgentManager>,   // ADD
    config: AgentConfig,
    inbox_rx: Arc<Mutex<mpsc::Receiver<JobResult>>>,
}
```

Update `AgentEngine::new` to pull `agent_manager` from `deps`:
```rust
Ok(Self {
    provider,
    conversation: deps.conversation,
    tool_registry: deps.tool_registry,
    _job_manager: deps.job_manager,
    _orchestrator: deps.orchestrator,
    memory: deps.memory,
    agent_manager: deps.agent_manager,   // ADD
    config,
    inbox_rx: Arc::new(Mutex::new(deps.inbox_rx)),
})
```

### Step 2: Update `system_message` in `engine_bootstrap.rs`

Replace the existing `system_message` function:

```rust
pub fn system_message(config: &AgentConfig, memory: &MemoryManager, agent_manager: &AgentManager) -> Message {
    // Use general-assistant system prompt; fall back to config.system_prompt
    let agent_prompt = agent_manager
        .get("general-assistant")
        .map(|a| a.system_prompt)
        .unwrap_or_else(|| config.system_prompt.clone());

    Message {
        id: Uuid::new_v4().to_string(),
        role: Role::System,
        content: format!("{}\n\n{}", agent_prompt, memory.load_context().unwrap_or_default()),
        tool_calls: None,
        created_at: Utc::now(),
    }
}
```

### Step 3: Update all `system_message` call sites in `engine.rs`

There are multiple places where `system_message(&self.config, self.memory.as_ref())` is called. Update each to:

```rust
system_message(&self.config, self.memory.as_ref(), self.agent_manager.as_ref())
```

Run to find all call sites:
```bash
grep -n "system_message" crates/agent/src/engine.rs
```

### Step 4: Add import to `engine.rs`

```rust
use crate::agent_manager::AgentManager;
```

### Step 5: Check compile and run tests

```bash
cargo check --workspace 2>&1 | head -30
cargo test --workspace 2>&1 | tail -20
```

Expected: clean compile, all tests pass.

### Step 6: Commit

```bash
git add crates/agent/src/engine.rs crates/agent/src/engine_bootstrap.rs
git commit -m "feat(agent): use general-assistant system prompt from AgentManager"
```

---

## Task 9: Final Integration Check

### Step 1: Full workspace compile

```bash
cargo build --workspace 2>&1
```

Expected: zero errors.

### Step 2: Full test suite

```bash
cargo test --workspace -- --nocapture 2>&1 | grep -E "(FAILED|PASSED|error)" | head -30
```

Expected: no FAILED tests.

### Step 3: Manual smoke test — verify agent init

```bash
cargo run -p rushdino-cli -- init 2>&1
ls ~/.rushdino/agents/
```

Expected: 12 `.toml` files listed:
```
artist-designer.toml      data-analyst.toml         devops-engineer.toml
general-assistant.toml    code-reviewer.toml         content-creator.toml
planner.toml              researcher.toml            social-network-assistant.toml
software-engineer.toml    spawn-agent.toml           writer.toml
```

### Step 4: Verify `delegate_to_agent` appears in tool list

```bash
cargo run -p rushdino-cli -- start --foreground &
sleep 2
curl -s http://localhost:28847/api/health
# check logs for "delegate_to_agent" in registered tools
```

### Step 5: Final commit

```bash
git add -A
git commit -m "chore: agent swarm integration complete"
```

---

## Done

All 12 bundled agents are provisioned on `init`, the `delegate_to_agent` tool allows any agent to hand off to a specialist, and `SpawnAgentTool` enables runtime creation of new agents. The General Assistant is the entry point for all messages.

**Deferred for future work:**
- Model selection per agent
- Embedding-based semantic routing
- Per-agent tool whitelisting
- Agent memory isolation
