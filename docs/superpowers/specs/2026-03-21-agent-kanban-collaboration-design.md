# Agent Kanban Collaboration System — Design Spec

**Date:** 2026-03-21
**Status:** Approved
**Author:** Claude + Kien

## Overview

An internal agent collaboration system built on a shared Kanban board. The general-assistant orchestrator decomposes user requests into subtasks, specialist agents auto-claim tasks based on their expertise, and agents can request help from other specialists by posting subtasks. All completed work passes through orchestrator review before being marked done.

## Goals

1. Agents collaborate autonomously on complex, multi-domain user requests
2. Task decomposition scales with request complexity (simple requests skip Kanban)
3. Specialists can request cross-agent help without routing through the orchestrator
4. Users see real-time progress via a global Kanban board and per-agent filtered views
5. Quality is maintained via orchestrator review gate

## Non-Goals

- User-created/manual tasks on the Kanban board (agent-only for now)
- Drag-and-drop reordering in the UI (tasks move automatically)
- Human-in-the-loop review (orchestrator agent handles review)

---

## 1. Coordination Model

**Hybrid** — centralized decomposition with peer collaboration and orchestrator review.

### Flow

1. **User sends a message** → general-assistant receives it
2. **Complexity classification** → orchestrator analyzes and assigns a level
3. **Level 1 (Simple):** Direct handling or single `delegate_to_agent` — no Kanban involved
4. **Level 2 (Moderate):** Posts 2-3 tasks to Kanban board with tags and priorities
5. **Level 3 (Complex):** Full Kanban decomposition with dependency tracking, parallel execution, inter-agent help requests
6. **Specialists auto-claim** tasks from Backlog via matching engine
7. **Specialists can post subtasks** (help requests) that other specialists auto-claim
8. **Completed tasks move to In Review** → orchestrator validates
9. **Orchestrator approves or sends back** with revision feedback
10. **Once all root tasks for a request are Done** → orchestrator aggregates results and responds to user

### Complexity Classification

The orchestrator determines complexity in its system prompt analysis — no extra LLM call needed.

| Level | Criteria | Action |
|-------|----------|--------|
| **1 — Simple** | Single domain, direct answer, 1 step | Direct handling or `delegate_to_agent` (fast path) |
| **2 — Moderate** | 2-3 subtasks, one or two domains | Kanban with limited tasks |
| **3 — Complex** | Multiple domains, dependencies, collaboration needed | Full Kanban with dependency tracking |

Heuristics: number of distinct domains involved, estimated steps, whether cross-specialist collaboration is needed.

---

## 2. Task Matching Engine

Two-phase auto-claim system.

### Phase 1 — Tag-Based Matching

Each agent template gets a new `claim_tags` field:

| Agent | claim_tags |
|-------|------------|
| software-engineer | `code, architecture, debugging, implementation` |
| code-reviewer | `code-review, security, quality` |
| researcher | `research, analysis, fact-checking` |
| writer | `writing, editing, documentation` |
| content-creator | `content, marketing, seo, blog` |
| data-analyst | `data, analysis, statistics, visualization` |
| ui-ux-designer | `design, ui, ux, wireframe, accessibility` |
| artist-designer | `visual, branding, illustration, design-direction` |
| devops-engineer | `devops, ci-cd, docker, infrastructure` |
| planner | `planning, breakdown, timeline, milestones` |
| project-manager | `project, scope, coordination, delivery` |
| debugger | `debugging, root-cause, reproduction` |
| fullstack-developer | `frontend, backend, fullstack, api` |
| tester | `testing, qa, edge-cases, regression` |
| docs-manager | `docs, technical-writing, runbooks` |
| git-manager | `git, branching, merge, conflict` |

**Scoring formula:** `score = overlap_count / task_tag_count` (percentage of task tags matched by the agent). If one agent scores highest with score > 0.7 and no other agent is within 0.1 of their score → auto-claim. This means an agent must match at least 70% of what the task asks for. **Edge case:** if `task_tag_count == 0` (empty tags array), skip Phase 1 and go directly to Phase 2 (LLM fallback). The `post_task` tool schema enforces `"minItems": 1` on tags to discourage this, but the matching engine handles it gracefully regardless.

### Phase 2 — LLM Fallback

Triggered when:
- No agent matches via tags
- Multiple agents tie on tag score

A lightweight LLM call with:
- Task title + description
- List of available agents with their descriptions
- Current agent workloads

Returns: best-fit agent name + reasoning. Uses the cheapest configured model.

### Claim Rules

- Max **3 concurrent tasks** per agent (configurable)
- If best agent is at capacity → next-best claims
- If no agent matches → task stays in Backlog, orchestrator notified
- Notification after **30 seconds** in Backlog without a claim

---

## 3. Data Model

### New Table: `kanban_tasks`

```sql
CREATE TABLE kanban_tasks (
    id TEXT PRIMARY KEY,                          -- UUID
    parent_task_id TEXT REFERENCES kanban_tasks(id) ON DELETE SET NULL,
    source_request_id TEXT NOT NULL,              -- groups all tasks from one user message
    conversation_id TEXT REFERENCES conversations(id),

    title TEXT NOT NULL,
    description TEXT NOT NULL,
    tags TEXT NOT NULL DEFAULT '[]',              -- JSON array of strings
    priority TEXT NOT NULL DEFAULT 'medium'
        CHECK (priority IN ('low', 'medium', 'high', 'critical')),

    status TEXT NOT NULL DEFAULT 'backlog'
        CHECK (status IN ('backlog', 'claimed', 'in_progress', 'blocked', 'in_review', 'done', 'failed')),

    created_by_agent TEXT NOT NULL,               -- agent name that posted the task
    assigned_agent TEXT,                           -- agent name that claimed it
    depth INTEGER NOT NULL DEFAULT 0
        CHECK (depth <= 3),                       -- max subtask depth

    result TEXT,                                  -- output when completed
    review_notes TEXT,                            -- orchestrator feedback
    block_reason TEXT,                            -- why blocked
    error TEXT,                                   -- failure details

    created_at DATETIME NOT NULL DEFAULT (datetime('now')),
    updated_at DATETIME NOT NULL DEFAULT (datetime('now')),
    claimed_at DATETIME,
    completed_at DATETIME
);

-- Indexes
CREATE INDEX idx_kanban_tasks_status ON kanban_tasks(status);
CREATE INDEX idx_kanban_tasks_source ON kanban_tasks(source_request_id);
CREATE INDEX idx_kanban_tasks_assigned ON kanban_tasks(assigned_agent);
CREATE INDEX idx_kanban_tasks_parent ON kanban_tasks(parent_task_id);
```

### Key Relationships

- `parent_task_id` → creates task tree (orchestrator posts root tasks, specialists post child help-requests)
- `source_request_id` → groups everything from one user message for the global Kanban view
- `conversation_id` → links to the agent's working conversation for that task. **Written at claim-time:** when the matching engine claims a task for an agent, it creates a new conversation (via `ConversationManager::create_conversation_with_id()`) and writes that `conversation_id` to `kanban_tasks`. **Read at relaunch-time:** when a blocked task resumes or a revision is requested, the system loads history from this `conversation_id` to replay into the new agent run.
- `depth` → enforced at creation, mirrors existing max delegation depth of 3

---

## 4. Agent Tools

### 4.1 `post_task`

Any agent can create a subtask on the Kanban board.

```json
{
    "name": "post_task",
    "description": "Post a new task to the Kanban board for another specialist to pick up",
    "parameters": {
        "title": { "type": "string", "description": "Short task title" },
        "description": { "type": "string", "description": "Detailed task instructions" },
        "tags": { "type": "array", "items": { "type": "string" }, "minItems": 1, "description": "Domain tags for matching" },
        "priority": { "type": "string", "enum": ["low", "medium", "high", "critical"], "default": "medium" }
    },
    "required": ["title", "description", "tags"]
}
```

**Behavior:**
- `parent_task_id` auto-set to the agent's current task (if working one)
- `depth` = parent depth + 1 (rejected if > 3)
- `created_by_agent` = current agent name
- `source_request_id` inherited from parent task. For orchestrator-created root tasks, set to the current `runtime_runs.id` (the run that triggered the decomposition) — this links Kanban tasks to the existing run tracking system for correlation. **Mechanism:** `post_task` reads `source_request_id` from `ToolExecutionContext.run_id`. The engine must ensure `run_id` is always `Some(...)` in `ToolExecutionContext` before invoking the react loop for interactive sessions (currently true for `AssistantRunJob` paths, but must be verified for all call paths).
- Triggers the matching engine via `tokio::spawn` (async background task, similar to `WorkflowRunner::spawn_run`). The `post_task` tool returns immediately with the task ID. The matching engine runs in the background: scores agents, writes the claim to DB atomically, and spawns the claimed agent's run. If Phase 2 LLM fallback is needed, this adds latency to the background task but does not block the calling agent.

### 4.2 `claim_task`

Agent picks up a task from Backlog.

```json
{
    "name": "claim_task",
    "description": "Claim a task from the Kanban backlog to work on",
    "parameters": {
        "task_id": { "type": "string", "description": "UUID of the task to claim (optional — omit to auto-claim best match)" }
    },
    "required": []
}
```

**Behavior:**
- Called automatically by the matching engine (agents don't normally call this directly)
- Sets status to `claimed`, `assigned_agent` to current agent, `claimed_at` to now
- Rejects if agent already has 3 concurrent tasks

### 4.3 `update_task`

Agent updates their task status and result.

```json
{
    "name": "update_task",
    "description": "Update the status or result of a task you are working on",
    "parameters": {
        "task_id": { "type": "string", "description": "UUID of the task" },
        "status": { "type": "string", "enum": ["in_progress", "blocked", "done", "failed"] },
        "result": { "type": "string", "description": "Task output/deliverable (required when status=done)" },
        "block_reason": { "type": "string", "description": "Why the task is blocked (required when status=blocked)" },
        "error": { "type": "string", "description": "Error details (when status=failed)" }
    },
    "required": ["task_id", "status"]
}
```

**Behavior:**
- `status=done` → moves task to `in_review`, notifies orchestrator
- `status=blocked` → agent's current react loop **ends** (returns a "blocked waiting for subtask" result). When the child subtask completes, the system **launches a new agent run** for the blocked agent with: (1) the full previous conversation history replayed from DB, (2) the child task's result injected as a new system message. This "relaunch" pattern is compatible with the existing synchronous react loop — no suspend/resume needed.
- `status=failed` → marks task failed with error, notifies orchestrator
- Updates `updated_at` on every call, `completed_at` when done/failed

### 4.4 `review_task` (Orchestrator only)

Approve or reject completed work.

```json
{
    "name": "review_task",
    "description": "Review a completed task and approve or request revisions",
    "parameters": {
        "task_id": { "type": "string", "description": "UUID of the task to review" },
        "verdict": { "type": "string", "enum": ["approved", "needs_revision"] },
        "feedback": { "type": "string", "description": "Review feedback (required for needs_revision)" }
    },
    "required": ["task_id", "verdict"]
}
```

**Behavior:**
- `approved` → status = `done`, `completed_at` set
- `needs_revision` → status = `in_progress`, `review_notes` set. The system **launches a new agent run** for the assigned agent with: (1) full previous conversation history from DB, (2) review feedback injected as a system message: "Your task was reviewed and needs revision: {feedback}". Same relaunch pattern as blocked task resumption.
- **Authorization:** Enforced via runtime check inside `review_task.execute()`. The tool reads the calling agent's name from `ToolExecutionContext` (requires adding `agent_name: Option<String>` to the context struct) and rejects execution if the caller is not `general-assistant`. This is the only feasible approach because the codebase uses a single shared `ToolRegistry` and `SessionToolContext` pool across all agent invocations — there is no per-agent registry isolation. The runtime check is a simple guard clause at the top of `execute()`, returning an error message if unauthorized.

---

## 5. Orchestration Flow

### End-to-End Sequence

```
User Message
    │
    ▼
General Assistant (Orchestrator)
    │
    ├── Classify complexity (L1/L2/L3)
    │
    ├── [L1] Handle directly or delegate_to_agent (existing fast path)
    │
    ├── [L2/L3] Decompose into subtasks
    │   └── post_task() × N  →  Kanban Backlog
    │
    ▼
Matching Engine
    │
    ├── Tag match (Phase 1)
    │   └── >70% confidence → auto-claim
    │
    ├── LLM fallback (Phase 2)
    │   └── Ambiguous → lightweight LLM selection
    │
    ▼
Specialists Execute (parallel)
    │
    ├── update_task(in_progress)
    ├── [needs help?] → post_task(subtask) → Matching Engine → Another Specialist
    │   └── update_task(blocked) → waits for subtask result
    ├── update_task(done, result)
    │
    ▼
Orchestrator Review
    │
    ├── review_task(approved) → Done
    ├── review_task(needs_revision, feedback) → Back to In Progress
    │
    ▼
All Root Tasks Done?
    │
    ├── No → continue waiting
    ├── Yes → Orchestrator aggregates results → responds to user
```

### Safeguards

| Safeguard | Value | Purpose |
|-----------|-------|---------|
| Max subtask depth | 3 | Prevents infinite task chains |
| Max concurrent tasks per agent | 3 (configurable) | Prevents overload |
| Blocked task timeout | 5 minutes | Prevents infinite waits |
| Backlog alert threshold | 30 seconds | Ensures unclaimed tasks get attention |
| Review loop limit | 3 revisions | Prevents infinite review cycles |

---

## 6. Frontend

### 6.1 Global Kanban Page (`/kanban`)

A new top-level route in the main navigation sidebar.

**Layout:** Horizontal columns for each status: Backlog | Claimed | In Progress | Blocked | In Review | Done | Failed

**Task Card Contents:**
- Priority indicator (color-coded: critical=red, high=orange, medium=blue, low=green)
- Title
- Tags
- Assigned agent (emoji + name)
- Subtask indicator (if has parent: "↳ subtask of [parent title]")
- Time-in-status indicator
- Blocked reason (if blocked)
- Review status (if in review)

**Features:**
- **Real-time updates** via WebSocket — cards move between columns as agents work
- **Filter by agent** — click agent name to show only their tasks
- **Filter by source request** — group all tasks from one user message
- **Subtask tree expansion** — expand a card to see its child tasks
- **Task count badges** per column

### 6.2 Per-Agent Kanban Panel

Embedded in the agent detail page (evolves `AgentProgressBoardPanel`).

Same Kanban layout but pre-filtered to show only the selected agent's tasks (both assigned and created-by). Compact view suitable for a panel rather than full page.

### 6.3 API Endpoints

```
GET    /api/kanban/tasks                  — list all tasks (filterable by status, agent, source_request_id)
GET    /api/kanban/tasks/:id              — get single task with subtask tree
POST   /api/kanban/tasks                  — create task (internal, called via tools)
PATCH  /api/kanban/tasks/:id              — update task status/result
GET    /api/kanban/tasks/:id/children     — get subtasks of a task
GET    /api/kanban/stats                  — dashboard stats (counts per status, per agent)
WS     (via existing /ws/chat)             — real-time task updates multiplexed on existing connection
```

---

## 7. Integration with Existing Systems

### Agent Templates

**Add `agent_name` to `ToolExecutionContext`:**

The Kanban tools need to know which agent is calling them. Add `agent_name: Option<String>` to `ToolExecutionContext`. This is set when the engine starts a react loop for an agent. Used by: `post_task` (sets `created_by_agent`), `review_task` (authorization check), `claim_task` (sets `assigned_agent`).

**Add `claim_tags` field to `AgentTemplate`:**

```rust
pub struct AgentTemplate {
    // ... existing fields
    pub claim_tags: Option<Vec<String>>,  // new: tags this agent can claim
}
```

Parsed from `.toml` and `.md` agent definition files. Backward-compatible — agents without `claim_tags` are excluded from auto-claiming but can still be explicitly delegated to.

**Parser changes required:**
- **TOML parser:** Adding `#[serde(default)]` to the struct field is sufficient — serde handles it.
- **Markdown parser:** `parse_agent_markdown` in `agent_manager.rs` uses a manual `match key { ... }` block. A new match arm for `"claim_tags"` must be added, parsing the value as a comma-separated list.
- **Save function:** `AgentManager::save()` writes front-matter manually. Must serialize `claim_tags` back as a comma-separated value to avoid round-trip data loss.
- **Bundled agents:** The built-in agents in `crates/common/src/agents/` exist as both `.toml` and `.md` files. Add `claim_tags` to the `.md` files (which take precedence). Note: calling `save()` on a `.toml`-only agent migrates it to `.md` format — this is pre-existing behavior and acceptable since `.md` is the preferred format going forward.

### Workflow System Coexistence

The Kanban system operates alongside the existing workflow engine:
- **Workflows** = predefined, repeatable multi-step processes (DAG)
- **Kanban** = dynamic, ad-hoc task decomposition with agent autonomy

A workflow step could potentially post Kanban tasks in the future, but this is out of scope for v1.

### WebSocket Events

Extend the existing `ChatBroadcastHub` to emit Kanban events over the existing `/ws/chat` connection (no separate WebSocket endpoint). This avoids requiring clients to maintain two concurrent WebSocket connections. Kanban events are multiplexed alongside existing chat events using a `"kanban"` event type prefix:

```rust
// New variants added to existing broadcast event enum
enum BroadcastEvent {
    // ... existing chat events
    KanbanTaskCreated { task: KanbanTask },
    KanbanTaskClaimed { task_id: String, agent: String },
    KanbanTaskStatusChanged { task_id: String, old_status: String, new_status: String },
    KanbanTaskCompleted { task_id: String, result: String },
    KanbanTaskReviewed { task_id: String, verdict: String },
}
```

Frontend filters these events by type prefix to route to the Kanban UI components.

---

## 8. Implementation Scope

### In Scope (v1)

- `kanban_tasks` database table and migration
- `post_task`, `claim_task`, `update_task`, `review_task` tools
- Tag-based matching engine with LLM fallback
- Complexity classification in orchestrator system prompt
- Orchestrator review flow
- Global `/kanban` page with real-time updates
- Per-agent Kanban panel (replacing `AgentProgressBoardPanel`)
- `claim_tags` field on agent templates
- REST API endpoints for Kanban data
- WebSocket event streaming for task updates

### Out of Scope (future)

- User-created manual tasks
- Drag-and-drop task reordering
- Task priority auto-adjustment
- Cross-workflow Kanban integration
- Task analytics and reporting dashboard
- Agent performance scoring based on task completion
