# Agent Team / Swarm Design

**Date:** 2026-02-28
**Status:** Approved

## Problem

The current system has a single `AgentEngine` with one hardcoded system prompt ("You are RushDino, a local-first AI agent."). There is no concept of specialized agents or agent routing. The `Orchestrator::spawn_sub_agent` exists but is a thin fire-and-forget call with no persona, tools, or conversation awareness.

## Goal

Upgrade the agent system to a **multi-agent team** where:
- A General Assistant always receives the user message first
- Any agent can delegate a task to a more suitable specialist via a tool call
- 10+ domain specialist agents are bundled as TOML templates
- A Spawn Agent can create new custom agents at runtime
- All agents share the same global toolset

## Architecture

### Flow

```
User Message
     │
     ▼
┌─────────────────────┐
│   General Assistant  │  ← always receives first
│   (TOML agent)       │
│   - handles directly │
│   - OR delegates     │
└─────────┬───────────┘
          │ delegate_to_agent(target, task)
          ▼
┌─────────────────────┐     ┌──────────────────────┐
│  Specialist Agent   │────▶│  Spawn Agent         │
│  (any of 12 TOML)   │     │  creates new .toml   │
│  - handles directly  │     │  agent definitions   │
│  - OR re-delegates   │     └──────────────────────┘
└─────────────────────┘
     (max depth: 3)
```

Every user message enters via `general-assistant`. Any agent can call `delegate_to_agent(agent_name, task)` to hand off. Delegation runs a nested `run_react_loop` with the target agent's system_prompt and returns its response. Max delegation depth = 3 to prevent cycles.

Re-dispatch happens on every message — no sticky sessions.

### Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Routing | General Assistant first, then tool-based delegation | Minimal change, natural multi-hop |
| Agent definition | TOML files in `~/.rushdino/agents/` | Consistent with SkillManager, user-editable |
| Self-assessment | `delegate_to_agent` tool | Clean tool-based, agent decides |
| Tool access | All agents share global toolset | Simple, avoids per-agent complexity |
| Model per agent | Deferred | Out of scope for this release |
| Embedding routing | Deferred | Dispatcher uses General Assistant + delegation |

## New Components

### `AgentManager` (`crates/agent/src/agent_manager.rs`)

Loads and indexes agent TOML templates from `~/.rushdino/agents/`.

```rust
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
    pub fn get(&self, name: &str) -> Option<AgentTemplate>;
    pub fn list(&self) -> Vec<AgentTemplate>;
    pub fn save(&self, template: &AgentTemplate) -> Result<()>; // for SpawnAgentTool
}
```

Default agent when none specified: `general-assistant`.

### TOML Agent Schema

```toml
name = "code-reviewer"
description = "Reviews code for bugs, style, and security issues"
system_prompt = "You are an expert code reviewer..."
icon = "🔍"  # optional
```

Stored in `~/.rushdino/agents/<name>.toml`.

### `DelegateToAgentTool` (`crates/agent/src/tools/delegate_to_agent.rs`)

Registered in every agent's tool registry. Enables any agent to hand off to a specialist.

```
delegate_to_agent(agent_name: str, task: str) -> str
```

Internally:
1. Load target agent's `AgentTemplate` from `AgentManager`
2. Build system message from target's `system_prompt`
3. Run `run_react_loop` with target's system prompt + task
4. Return the response content

Tracks delegation depth (via `ToolExecutionContext`) and returns an error if depth > 3.

### `SpawnAgentTool` (`crates/agent/src/tools/spawn_agent.rs`)

Registered only in the `spawn-agent` template's effective toolset via its system prompt instructions. (Since all agents share the same tool registry, the Spawn Agent's system prompt instructs it to use `spawn_agent` tool; other agents are instructed not to.)

```
spawn_agent(name: str, description: str, system_prompt: str, icon: str) -> str
```

Writes a new `.toml` to the agents directory and returns confirmation.

### Changes to Existing Files

| File | Change |
|------|--------|
| `engine_bootstrap.rs` | Add `agent_manager: Arc<AgentManager>` param; register `DelegateToAgentTool` and `SpawnAgentTool` |
| `engine.rs` | `AgentConfig.system_prompt` becomes runtime lookup; `chat()` accepts `agent_name: Option<&str>` |
| `tools/shell_exec.rs` | `ToolExecutionContext` gains `delegation_depth: u8` field |
| `common/src/init.rs` | `rushdino init` copies bundled agent TOMLs to `~/.rushdino/agents/` |

**No changes to:** gateway, adapters, providers, server, CLI (beyond init), frontend.

## Bundled Agent Templates

12 TOML files shipped with `rushdino init`:

| Name | Icon | Domain |
|------|------|--------|
| `general-assistant` | 🤖 | Entry point, general tasks, routing hub |
| `code-reviewer` | 🔍 | Code review, bugs, security, style |
| `researcher` | 📚 | Web search, fact-finding, summarization |
| `writer` | ✍️ | Articles, docs, emails, creative writing |
| `planner` | 📋 | Project plans, task breakdown, timelines |
| `data-analyst` | 📊 | Data analysis, statistics, visualization |
| `devops-engineer` | ⚙️ | CI/CD, infra, Docker, shell scripts |
| `software-engineer` | 💻 | Architecture, implementation, debugging |
| `artist-designer` | 🎨 | UI/UX, design feedback, color, layout |
| `content-creator` | 📱 | Blog posts, SEO, marketing copy |
| `social-network-assistant` | 🌐 | Social strategy, engagement, platform tips |
| `spawn-agent` | 🧬 | Creates new custom agent TOML definitions |

## File Structure

```
~/.rushdino/
└── agents/
    ├── general-assistant.toml
    ├── code-reviewer.toml
    ├── researcher.toml
    ├── writer.toml
    ├── planner.toml
    ├── data-analyst.toml
    ├── devops-engineer.toml
    ├── software-engineer.toml
    ├── artist-designer.toml
    ├── content-creator.toml
    ├── social-network-assistant.toml
    └── spawn-agent.toml

crates/agent/src/
├── agent_manager.rs            # NEW
├── tools/
│   ├── delegate_to_agent.rs    # NEW
│   └── spawn_agent.rs          # NEW
└── ...existing files...

crates/common/src/
└── agents/                     # NEW - bundled TOML templates
    ├── general-assistant.toml
    └── ...
```

## Error Handling

- Unknown `agent_name` in `delegate_to_agent` → returns tool error, agent handles gracefully
- Max delegation depth exceeded → returns descriptive error message to the chain
- Malformed agent TOML → logged and skipped during `AgentManager::list()`
- Spawn Agent writes invalid TOML → `spawn_agent` returns error string

## Out of Scope (Deferred)

- Model selection per agent
- Embedding-based semantic routing
- Per-agent tool whitelisting
- Agent memory isolation
- Sticky session per agent
