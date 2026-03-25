//! Agent tools for interacting with the kanban task board.
//!
//! Provides four tools:
//! - `post_task` — create a new task on the board (any agent)
//! - `claim_task` — pick up a backlog task (any agent)
//! - `update_task` — update task status/result during execution (any agent)
//! - `review_task` — approve or reject completed work (orchestrator only)

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
        "Create a new task on the kanban board. Used by the orchestrator to decompose requests, \
         or by specialists to request help from other agents."
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

        let input = CreateTaskInput {
            title: title.to_owned(),
            description: description.to_owned(),
            tags,
            priority,
            parent_task_id,
            source_request_id,
            complexity_level,
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
        "Review a completed task. Approve to mark as done, or send back for revision with feedback. \
         Only the main session agent should use this tool."
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

        let task = self.store.review_task(task_id, verdict, feedback).await?;
        Ok(serde_json::to_string_pretty(&task).unwrap_or_else(|_| format!("Task reviewed: {}", task.id)))
    }
}
