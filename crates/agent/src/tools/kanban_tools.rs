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
