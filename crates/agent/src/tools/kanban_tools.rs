//! Agent tools for interacting with the kanban task board.
//!
//! Provides four tools:
//! - `post_task` — create a new task on the board (any agent)
//! - `claim_task` — pick up a backlog task (any agent)
//! - `update_task` — update task status/result during execution (any agent)
//! - `review_task` — approve or reject completed work (any agent)

use std::sync::Arc;

use async_trait::async_trait;
use serde_json::{json, Value};

use rushdino_common::{AppError, Result};

use crate::{
    kanban_store::{
        CreateTaskInput, KanbanStore, ReviewVerdict, TaskPriority, TaskStatus, UpdateTaskInput,
    },
    tool_registry::Tool,
};

// ---------------------------------------------------------------------------
// PostTaskTool
// ---------------------------------------------------------------------------

/// Allows any agent to create a new task on the kanban board.
pub struct PostTaskTool {
    store: Arc<KanbanStore>,
}

impl PostTaskTool {
    pub fn new(store: Arc<KanbanStore>) -> Self {
        Self { store }
    }
}

#[async_trait]
impl Tool for PostTaskTool {
    fn name(&self) -> &str {
        "post_task"
    }

    fn description(&self) -> &str {
        "Post a task to the kanban board for a specialist agent to handle asynchronously. \
         Use this when a request requires 5+ tool calls, specialist expertise (research, code review, debugging), \
         or is complex enough that losing context would hurt. \
         Tags guide routing: [\"research\",\"web-search\"] → researcher, [\"code\",\"debugging\"] → software-engineer. \
         Pass notify_conversation_id so you get notified when the task is done. \
         After posting, tell the user what was queued and which agent will handle it."
    }

    fn parameters(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "title": {
                    "type": "string",
                    "description": "Short title for the task (max 160 chars)"
                },
                "description": {
                    "type": "string",
                    "description": "Detailed description of what needs to be done"
                },
                "tags": {
                    "type": "array",
                    "items": { "type": "string" },
                    "description": "Tags for agent matching (e.g. ['code', 'architecture'])"
                },
                "priority": {
                    "type": "string",
                    "enum": ["low", "medium", "high", "critical"],
                    "description": "Task priority (default: medium)"
                },
                "parent_task_id": {
                    "type": "string",
                    "description": "ID of the parent task if this is a subtask"
                },
                "source_request_id": {
                    "type": "string",
                    "description": "ID linking all tasks from the same user request"
                },
                "complexity_level": {
                    "type": "integer",
                    "description": "Complexity: 1=simple, 2=moderate, 3=complex"
                },
                "notify_conversation_id": {
                    "type": "string",
                    "description": "Conversation to notify when task completes (pass your current conversation ID)"
                }
            },
            "required": ["title", "description", "tags"]
        })
    }

    async fn execute(&self, args: Value) -> Result<String> {
        let title = args
            .get("title")
            .and_then(Value::as_str)
            .ok_or_else(|| AppError::Validation("title is required".into()))?;
        let description = args
            .get("description")
            .and_then(Value::as_str)
            .ok_or_else(|| AppError::Validation("description is required".into()))?;

        let tags: Vec<String> = args
            .get("tags")
            .and_then(Value::as_array)
            .map(|arr| {
                arr.iter()
                    .filter_map(Value::as_str)
                    .map(String::from)
                    .collect()
            })
            .unwrap_or_default();

        let priority = args
            .get("priority")
            .and_then(Value::as_str)
            .map(TaskPriority::from_str_loose)
            .unwrap_or(TaskPriority::Medium);

        let parent_task_id = args
            .get("parent_task_id")
            .and_then(Value::as_str)
            .map(String::from);

        let source_request_id = args
            .get("source_request_id")
            .and_then(Value::as_str)
            .map(String::from);

        let complexity_level = args
            .get("complexity_level")
            .and_then(Value::as_u64)
            .map(|v| v as u32)
            .unwrap_or(2);

        let notify_conversation_id = args
            .get("notify_conversation_id")
            .and_then(Value::as_str)
            .map(String::from);

        let input = CreateTaskInput {
            title: title.to_owned(),
            description: description.to_owned(),
            tags,
            priority,
            parent_task_id,
            source_request_id,
            complexity_level,
            notify_conversation_id,
        };

        let task = self.store.create_task(&input).await?;
        Ok(serde_json::to_string_pretty(&task).unwrap_or_else(|_| format!("Task created: {}", task.id)))
    }
}

// ---------------------------------------------------------------------------
// ClaimTaskTool
// ---------------------------------------------------------------------------

/// Allows an agent to pick up a backlog task.
pub struct ClaimTaskTool {
    store: Arc<KanbanStore>,
}

impl ClaimTaskTool {
    pub fn new(store: Arc<KanbanStore>) -> Self {
        Self { store }
    }
}

#[async_trait]
impl Tool for ClaimTaskTool {
    fn name(&self) -> &str {
        "claim_task"
    }

    fn description(&self) -> &str {
        "Claim a task from the kanban board backlog. The task will be assigned to you."
    }

    fn parameters(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "task_id": {
                    "type": "string",
                    "description": "ID of the task to claim"
                },
                "agent_name": {
                    "type": "string",
                    "description": "Name of the agent claiming the task"
                }
            },
            "required": ["task_id", "agent_name"]
        })
    }

    async fn execute(&self, args: Value) -> Result<String> {
        let task_id = args
            .get("task_id")
            .and_then(Value::as_str)
            .ok_or_else(|| AppError::Validation("task_id is required".into()))?;
        let agent_name = args
            .get("agent_name")
            .and_then(Value::as_str)
            .ok_or_else(|| AppError::Validation("agent_name is required".into()))?;

        let task = self.store.claim_task(task_id, agent_name).await?;
        Ok(serde_json::to_string_pretty(&task).unwrap_or_else(|_| format!("Task claimed: {}", task.id)))
    }
}

// ---------------------------------------------------------------------------
// UpdateTaskTool
// ---------------------------------------------------------------------------

/// Allows an agent to update their task's status and result.
pub struct UpdateTaskTool {
    store: Arc<KanbanStore>,
}

impl UpdateTaskTool {
    pub fn new(store: Arc<KanbanStore>) -> Self {
        Self { store }
    }
}

#[async_trait]
impl Tool for UpdateTaskTool {
    fn name(&self) -> &str {
        "update_task"
    }

    fn description(&self) -> &str {
        "Update the status of a kanban task. When you set status to 'done', the task \
         automatically moves to 'in_review' for the orchestrator to validate."
    }

    fn parameters(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "task_id": {
                    "type": "string",
                    "description": "ID of the task to update"
                },
                "status": {
                    "type": "string",
                    "enum": ["in_progress", "blocked", "done", "failed"],
                    "description": "New status for the task"
                },
                "result": {
                    "type": "string",
                    "description": "Output/deliverable from the work (set when done)"
                },
                "block_reason": {
                    "type": "string",
                    "description": "Why the task is blocked (set when blocked)"
                }
            },
            "required": ["task_id", "status"]
        })
    }

    async fn execute(&self, args: Value) -> Result<String> {
        let task_id = args
            .get("task_id")
            .and_then(Value::as_str)
            .ok_or_else(|| AppError::Validation("task_id is required".into()))?;
        let status_str = args
            .get("status")
            .and_then(Value::as_str)
            .ok_or_else(|| AppError::Validation("status is required".into()))?;

        let status = TaskStatus::from_str_loose(status_str);
        let result = args.get("result").and_then(Value::as_str).map(String::from);
        let block_reason = args
            .get("block_reason")
            .and_then(Value::as_str)
            .map(String::from);

        let input = UpdateTaskInput {
            task_id: task_id.to_owned(),
            status,
            result,
            block_reason,
        };

        let task = self.store.update_task_status(&input).await?;
        Ok(serde_json::to_string_pretty(&task).unwrap_or_else(|_| format!("Task updated: {}", task.id)))
    }
}

// ---------------------------------------------------------------------------
// ReviewTaskTool
// ---------------------------------------------------------------------------

/// Allows the orchestrator to approve or reject completed work.
pub struct ReviewTaskTool {
    store: Arc<KanbanStore>,
}

impl ReviewTaskTool {
    pub fn new(store: Arc<KanbanStore>) -> Self {
        Self { store }
    }
}

#[async_trait]
impl Tool for ReviewTaskTool {
    fn name(&self) -> &str {
        "review_task"
    }

    fn description(&self) -> &str {
        "Review a completed task. Approve to mark it done, or reject with feedback \
         for the agent to revise. Any agent can review tasks."
    }

    fn parameters(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "task_id": {
                    "type": "string",
                    "description": "ID of the task to review"
                },
                "verdict": {
                    "type": "string",
                    "enum": ["approved", "needs_revision"],
                    "description": "Approve the work or send it back for revision"
                },
                "feedback": {
                    "type": "string",
                    "description": "Feedback for the agent (required when verdict is needs_revision)"
                },
                "reassign_to": {
                    "type": "string",
                    "description": "Optional: reassign the task to a different agent on rejection"
                }
            },
            "required": ["task_id", "verdict"]
        })
    }

    async fn execute(&self, args: Value) -> Result<String> {
        let task_id = args
            .get("task_id")
            .and_then(Value::as_str)
            .ok_or_else(|| AppError::Validation("task_id is required".into()))?;
        let verdict_str = args
            .get("verdict")
            .and_then(Value::as_str)
            .ok_or_else(|| AppError::Validation("verdict is required".into()))?;

        let verdict = match verdict_str {
            "approved" => ReviewVerdict::Approved,
            "needs_revision" => ReviewVerdict::NeedsRevision,
            _ => {
                return Err(AppError::Validation(format!(
                    "invalid verdict: '{verdict_str}' (expected 'approved' or 'needs_revision')"
                )));
            }
        };

        let feedback = args.get("feedback").and_then(Value::as_str);
        let reassign_to = args.get("reassign_to").and_then(Value::as_str);

        let task = self.store.review_task(task_id, verdict, feedback).await?;

        // If rejected and reassign_to is provided, update the assigned agent so
        // the dispatcher routes the retry to the specified agent.
        if matches!(verdict, ReviewVerdict::NeedsRevision) {
            if let Some(agent) = reassign_to {
                self.store.reassign_task(task_id, agent).await?;
                // Re-fetch after reassignment to return accurate state.
                let updated = self.store.get_task(task_id).await?;
                return Ok(serde_json::to_string_pretty(&updated)
                    .unwrap_or_else(|_| format!("Task reviewed and reassigned: {}", updated.id)));
            }
        }

        Ok(serde_json::to_string_pretty(&task).unwrap_or_else(|_| format!("Task reviewed: {}", task.id)))
    }
}

#[cfg(test)]
#[path = "kanban_tools_tests.rs"]
mod tests;

    async fn make_store() -> Arc<KanbanStore> {
        let opts = SqliteConnectOptions::from_str("sqlite::memory:")
            .unwrap()
            .foreign_keys(true);
        let pool = Arc::new(SqlitePool::connect_with(opts).await.unwrap());
        rushdino_common::db::run_migrations(&pool).await.unwrap();
        Arc::new(KanbanStore::new(pool))
    }

    fn agent(name: &str, claims: bool) -> AgentTemplate {
        AgentTemplate {
            name: name.into(),
            description: format!("{name} specialist"),
            system_prompt: format!("You are a {name}."),
            icon: None,
            tools: None,
            color: None,
            model: None,
            claims_tasks: claims,
            claim_tags: Vec::new(),
            sandbox_policy: None,
        }
    }

    async fn post(store: &Arc<KanbanStore>, title: &str, tags: &[&str]) -> String {
        let tool = PostTaskTool::new(store.clone());
        let result = tool
            .execute(serde_json::json!({
                "title": title,
                "description": format!("Description for {title}"),
                "tags": tags,
            }))
            .await
            .unwrap();
        let v: serde_json::Value = serde_json::from_str(&result).unwrap();
        v["id"].as_str().unwrap().to_owned()
    }

    // ── Group 1: PostTaskTool ─────────────────────────────────────────────────

    /// An agent posts a task — it lands in the backlog with correct fields.
    #[tokio::test]
    async fn post_task_tool_creates_backlog_entry() {
        let store = make_store().await;
        let tool = PostTaskTool::new(store.clone());

        let result = tool
            .execute(serde_json::json!({
                "title": "Implement auth module",
                "description": "Add JWT-based authentication to the API",
                "tags": ["code", "architecture", "api"],
                "priority": "high",
                "complexity_level": 3,
            }))
            .await
            .unwrap();

        let task: serde_json::Value = serde_json::from_str(&result).unwrap();
        assert_eq!(task["status"], "backlog");
        assert_eq!(task["title"], "Implement auth module");
        assert_eq!(task["priority"], "high");
        assert_eq!(task["complexityLevel"], 3);
        assert!(task["assignedAgent"].is_null());
        assert!(task["id"].is_string());

        // Verify it appears in the backlog list.
        let backlog = store.list_backlog_tasks().await.unwrap();
        assert_eq!(backlog.len(), 1);
        assert_eq!(backlog[0].title, "Implement auth module");
    }

    /// Missing required fields return a validation error.
    #[tokio::test]
    async fn post_task_tool_rejects_missing_required_fields() {
        let store = make_store().await;
        let tool = PostTaskTool::new(store.clone());

        let err = tool
            .execute(serde_json::json!({"title": "No description or tags"}))
            .await;
        assert!(err.is_err());
    }

    // ── Group 2: ClaimTaskTool ────────────────────────────────────────────────

    /// A second agent claims a task from the backlog — status moves to claimed.
    #[tokio::test]
    async fn claim_task_tool_assigns_task_to_agent() {
        let store = make_store().await;
        let task_id = post(&store, "Research competitors", &["research", "analysis"]).await;

        let tool = ClaimTaskTool::new(store.clone());
        let result = tool
            .execute(serde_json::json!({
                "task_id": task_id,
                "agent_name": "researcher",
            }))
            .await
            .unwrap();

        let task: serde_json::Value = serde_json::from_str(&result).unwrap();
        assert_eq!(task["status"], "claimed");
        assert_eq!(task["assignedAgent"], "researcher");
        assert!(task["claimedAt"].is_string());

        // No longer in backlog.
        let backlog = store.list_backlog_tasks().await.unwrap();
        assert!(backlog.is_empty());
    }

    /// Claiming an already-claimed task returns an error.
    #[tokio::test]
    async fn claim_task_tool_rejects_non_backlog_task() {
        let store = make_store().await;
        let task_id = post(&store, "Write docs", &["documentation"]).await;

        let tool = ClaimTaskTool::new(store.clone());
        // First claim succeeds.
        tool.execute(serde_json::json!({
            "task_id": task_id,
            "agent_name": "writer",
        }))
        .await
        .unwrap();

        // Second claim by a different agent must fail.
        let err = tool
            .execute(serde_json::json!({
                "task_id": task_id,
                "agent_name": "researcher",
            }))
            .await;
        assert!(err.is_err());
        assert!(err.unwrap_err().to_string().contains("not in backlog"));
    }

    /// An agent cannot claim more than MAX_CONCURRENT_TASKS_PER_AGENT tasks.
    #[tokio::test]
    async fn claim_task_tool_enforces_capacity_limit() {
        let store = make_store().await;
        let tool = ClaimTaskTool::new(store.clone());

        // Fill the agent's capacity.
        for i in 0..MAX_CONCURRENT_TASKS_PER_AGENT {
            let id = post(&store, &format!("Task {i}"), &["code"]).await;
            tool.execute(serde_json::json!({
                "task_id": id,
                "agent_name": "software-engineer",
            }))
            .await
            .unwrap();
        }

        // One more should be rejected.
        let overflow_id = post(&store, "Overflow task", &["code"]).await;
        let err = tool
            .execute(serde_json::json!({
                "task_id": overflow_id,
                "agent_name": "software-engineer",
            }))
            .await;
        assert!(err.is_err());
        assert!(err.unwrap_err().to_string().contains("active tasks"));
    }

    // ── Group 3: UpdateTaskTool ───────────────────────────────────────────────

    /// Setting status to "done" auto-transitions the task to "in_review".
    #[tokio::test]
    async fn update_task_done_auto_transitions_to_in_review() {
        let store = make_store().await;
        let task_id = post(&store, "Fix memory leak", &["debugging"]).await;
        store.claim_task(&task_id, "software-engineer").await.unwrap();

        let tool = UpdateTaskTool::new(store.clone());
        let result = tool
            .execute(serde_json::json!({
                "task_id": task_id,
                "status": "done",
                "result": "Identified and patched the leak in the connection pool.",
            }))
            .await
            .unwrap();

        let task: serde_json::Value = serde_json::from_str(&result).unwrap();
        // Store converts "done" → "in_review" so the orchestrator can validate.
        assert_eq!(task["status"], "in_review");
        assert_eq!(task["result"], "Identified and patched the leak in the connection pool.");
        assert!(task["completedAt"].is_string());
    }

    /// An agent can mark a task as blocked with a reason.
    #[tokio::test]
    async fn update_task_can_be_blocked_with_reason() {
        let store = make_store().await;
        let task_id = post(&store, "Deploy to production", &["devops"]).await;
        store.claim_task(&task_id, "devops-engineer").await.unwrap();

        let tool = UpdateTaskTool::new(store.clone());
        let result = tool
            .execute(serde_json::json!({
                "task_id": task_id,
                "status": "blocked",
                "block_reason": "Waiting for VPN access credentials from IT team.",
            }))
            .await
            .unwrap();

        let task: serde_json::Value = serde_json::from_str(&result).unwrap();
        assert_eq!(task["status"], "blocked");
        assert_eq!(task["blockReason"], "Waiting for VPN access credentials from IT team.");
    }

    // ── Group 4: ReviewTaskTool ───────────────────────────────────────────────

    /// Orchestrator approves work — task moves from in_review to done.
    #[tokio::test]
    async fn review_task_approved_marks_done() {
        let store = make_store().await;
        let task_id = post(&store, "Write API docs", &["documentation"]).await;
        store.claim_task(&task_id, "writer").await.unwrap();
        store
            .update_task_status(&crate::kanban_store::UpdateTaskInput {
                task_id: task_id.clone(),
                status: TaskStatus::Done,
                result: Some("All endpoints documented.".into()),
                block_reason: None,
            })
            .await
            .unwrap();

        let tool = ReviewTaskTool::new(store.clone());
        let result = tool
            .execute(serde_json::json!({
                "task_id": task_id,
                "verdict": "approved",
            }))
            .await
            .unwrap();

        let task: serde_json::Value = serde_json::from_str(&result).unwrap();
        assert_eq!(task["status"], "done");
    }

    /// Reviewer sends task back — moves from in_review to backlog for re-dispatch.
    #[tokio::test]
    async fn review_task_needs_revision_resets_to_backlog() {
        let store = make_store().await;
        let task_id = post(&store, "Design landing page", &["design", "ui"]).await;
        store.claim_task(&task_id, "designer").await.unwrap();
        store
            .update_task_status(&crate::kanban_store::UpdateTaskInput {
                task_id: task_id.clone(),
                status: TaskStatus::Done,
                result: Some("Initial design attached.".into()),
                block_reason: None,
            })
            .await
            .unwrap();

        let tool = ReviewTaskTool::new(store.clone());
        let result = tool
            .execute(serde_json::json!({
                "task_id": task_id,
                "verdict": "needs_revision",
                "feedback": "Color contrast fails WCAG AA. Please revise palette.",
            }))
            .await
            .unwrap();

        let task: serde_json::Value = serde_json::from_str(&result).unwrap();
        // Task returns to backlog so the dispatcher can re-assign it.
        assert_eq!(task["status"], "backlog");
        assert_eq!(task["reviewFeedback"], "Color contrast fails WCAG AA. Please revise palette.");
        // assigned_agent is cleared so any agent can pick it up.
        assert!(task["assignedAgent"].is_null());
        // revision_count is incremented.
        assert_eq!(task["revisionCount"], 1);
    }

    /// After 3 rejections (revision_count > 2), task is auto-failed.
    #[tokio::test]
    async fn review_task_auto_fails_after_max_revisions() {
        let store = make_store().await;
        let task_id = post(&store, "Flaky task", &["code"]).await;

        for i in 0..3 {
            // Claim and complete.
            if i == 0 {
                store.claim_task(&task_id, "engineer").await.unwrap();
            } else {
                // Task is in backlog after rejection; re-claim it.
                store.claim_task(&task_id, "engineer").await.unwrap();
            }
            store
                .update_task_status(&crate::kanban_store::UpdateTaskInput {
                    task_id: task_id.clone(),
                    status: TaskStatus::Done,
                    result: Some(format!("Attempt {}", i + 1)),
                    block_reason: None,
                })
                .await
                .unwrap();
            // Reject.
            store
                .review_task(&task_id, crate::kanban_store::ReviewVerdict::NeedsRevision, Some("Try again"))
                .await
                .unwrap();
        }

        let task = store.get_task(&task_id).await.unwrap();
        assert_eq!(task.status, TaskStatus::Failed);
        assert!(task.result.unwrap().contains("maximum revision"));
    }

    // ── Group 5: Full pipeline ────────────────────────────────────────────────

    /// Complete happy path: one agent posts → another claims → updates done →
    /// orchestrator approves → task is done.
    #[tokio::test]
    async fn full_pipeline_post_claim_update_approve() {
        let store = make_store().await;

        // Agent A posts a task to the board.
        let post_tool = PostTaskTool::new(store.clone());
        let posted = post_tool
            .execute(serde_json::json!({
                "title": "Audit codebase for security issues",
                "description": "Review all API endpoints for auth bypass, injection, and data exposure.",
                "tags": ["review", "security", "bugs"],
                "priority": "critical",
                "source_request_id": "req-001",
            }))
            .await
            .unwrap();
        let task_id = serde_json::from_str::<serde_json::Value>(&posted).unwrap()["id"]
            .as_str()
            .unwrap()
            .to_owned();

        // Verify: in backlog, no owner.
        let t = store.get_task(&task_id).await.unwrap();
        assert_eq!(t.status, TaskStatus::Backlog);
        assert!(t.assigned_agent.is_none());

        // Agent B (code-reviewer) picks it up.
        let claim_tool = ClaimTaskTool::new(store.clone());
        claim_tool
            .execute(serde_json::json!({
                "task_id": task_id,
                "agent_name": "code-reviewer",
            }))
            .await
            .unwrap();

        let t = store.get_task(&task_id).await.unwrap();
        assert_eq!(t.status, TaskStatus::Claimed);
        assert_eq!(t.assigned_agent.as_deref(), Some("code-reviewer"));

        // Agent B completes the work.
        let update_tool = UpdateTaskTool::new(store.clone());
        update_tool
            .execute(serde_json::json!({
                "task_id": task_id,
                "status": "done",
                "result": "Found 3 issues: missing rate-limit on /login, raw SQL in /search, JWT not validated on /admin.",
            }))
            .await
            .unwrap();

        let t = store.get_task(&task_id).await.unwrap();
        assert_eq!(t.status, TaskStatus::InReview); // auto-transition

        // Orchestrator approves.
        let review_tool = ReviewTaskTool::new(store.clone());
        review_tool
            .execute(serde_json::json!({
                "task_id": task_id,
                "verdict": "approved",
            }))
            .await
            .unwrap();

        let t = store.get_task(&task_id).await.unwrap();
        assert_eq!(t.status, TaskStatus::Done);
        assert!(t.result.is_some());
        assert!(t.completed_at.is_some());
    }

    // ── Group 6: Auto-routing via matching engine ─────────────────────────────

    /// A code task is automatically routed to software-engineer (high tag score).
    #[tokio::test]
    async fn auto_routing_code_task_goes_to_software_engineer() {
        let agents = vec![
            agent("software-engineer", true),
            agent("researcher", true),
            agent("designer", true),
        ];
        let store = make_store().await;
        let task_id = post(&store, "Refactor auth service", &["code", "architecture", "api"]).await;
        let task = store.get_task(&task_id).await.unwrap();

        let m = find_best_match(&task, &agents, None).await.unwrap();
        assert_eq!(m.agent_name, "software-engineer");
        assert!(m.confidence >= 0.7, "confidence={}", m.confidence);
    }

    /// A research task is routed to researcher, not code agents.
    #[tokio::test]
    async fn auto_routing_research_task_goes_to_researcher() {
        let agents = vec![
            agent("software-engineer", true),
            agent("researcher", true),
            agent("writer", true),
        ];
        let store = make_store().await;
        let task_id = post(&store, "Market analysis", &["research", "analysis", "facts"]).await;
        let task = store.get_task(&task_id).await.unwrap();

        let m = find_best_match(&task, &agents, None).await.unwrap();
        assert_eq!(m.agent_name, "researcher");
    }

    /// An agent with claims_tasks=false is excluded from auto-routing.
    #[tokio::test]
    async fn auto_routing_excludes_non_claiming_agents() {
        // Only agent has claims_tasks=false — no match should be returned.
        let agents = vec![agent("software-engineer", false)];
        let store = make_store().await;
        let task_id = post(&store, "Add tests", &["code", "testing"]).await;
        let task = store.get_task(&task_id).await.unwrap();

        let m = find_best_match(&task, &agents, None).await;
        assert!(m.is_none(), "non-claiming agent must not be auto-routed");
    }

    /// Posting a task then routing and claiming it via the matching engine
    /// produces the expected assigned_agent field on the stored task.
    #[tokio::test]
    async fn auto_routing_and_claim_updates_board_correctly() {
        let agents = vec![
            agent("software-engineer", true),
            agent("researcher", true),
        ];
        let store = make_store().await;
        let task_id = post(&store, "Build REST endpoint", &["code", "api", "implementation"]).await;
        let task = store.get_task(&task_id).await.unwrap();

        // Matching engine selects the best agent.
        let m = find_best_match(&task, &agents, None).await.unwrap();
        assert_eq!(m.agent_name, "software-engineer");

        // That agent then claims the task (as the dispatcher would).
        store.claim_task(&task_id, &m.agent_name).await.unwrap();
        let t = store.get_task(&task_id).await.unwrap();
        assert_eq!(t.status, TaskStatus::Claimed);
        assert_eq!(t.assigned_agent.as_deref(), Some("software-engineer"));
    }

    // ── Group 7: Task tree / subtasks ─────────────────────────────────────────

    /// A subtask inherits source_request_id from its parent automatically.
    #[tokio::test]
    async fn subtask_inherits_source_request_id_from_parent() {
        let store = make_store().await;
        let post_tool = PostTaskTool::new(store.clone());

        // Parent with explicit source_request_id.
        let parent_resp = post_tool
            .execute(serde_json::json!({
                "title": "Parent task",
                "description": "Root of the tree",
                "tags": ["planning"],
                "source_request_id": "req-xyz",
            }))
            .await
            .unwrap();
        let parent_id = serde_json::from_str::<serde_json::Value>(&parent_resp).unwrap()["id"]
            .as_str()
            .unwrap()
            .to_owned();

        // Child without source_request_id — should inherit from parent.
        let child_resp = post_tool
            .execute(serde_json::json!({
                "title": "Child subtask",
                "description": "Subtask of parent",
                "tags": ["code"],
                "parent_task_id": parent_id,
            }))
            .await
            .unwrap();
        let child: serde_json::Value = serde_json::from_str(&child_resp).unwrap();
        assert_eq!(child["sourceRequestId"], "req-xyz");
        assert_eq!(child["depth"], 1);
    }

    /// Attempting to create a subtask beyond MAX_TASK_DEPTH returns an error.
    #[tokio::test]
    async fn subtask_depth_limit_enforced() {
        let store = make_store().await;

        // Build a chain to MAX_TASK_DEPTH.
        let mut parent_id = post(&store, "Root", &["planning"]).await;
        for depth in 1..=MAX_TASK_DEPTH {
            let child_resp = PostTaskTool::new(store.clone())
                .execute(serde_json::json!({
                    "title": format!("Depth {depth}"),
                    "description": "Nested task",
                    "tags": ["code"],
                    "parent_task_id": parent_id,
                }))
                .await
                .unwrap();
            parent_id = serde_json::from_str::<serde_json::Value>(&child_resp).unwrap()["id"]
                .as_str()
                .unwrap()
                .to_owned();
        }

        // One level too deep must be rejected.
        let err = PostTaskTool::new(store.clone())
            .execute(serde_json::json!({
                "title": "Too deep",
                "description": "Should be rejected",
                "tags": ["code"],
                "parent_task_id": parent_id,
            }))
            .await;
        assert!(err.is_err());
        assert!(err.unwrap_err().to_string().contains("max task depth"));
    }
}
