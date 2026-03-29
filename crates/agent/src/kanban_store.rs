//! Persistent store for kanban tasks backed by SQLite.
//!
//! Provides CRUD operations for the `kanban_tasks` table used by the
//! inter-agent collaboration system. All mutations go through this store
//! so the API routes and agent tools share a single source of truth.

use std::sync::Arc;

use chrono::Utc;
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use uuid::Uuid;

use rushdino_common::{AppError, Result};

/// Maximum depth for subtask chains. Matches the delegation depth limit.
pub const MAX_TASK_DEPTH: u32 = 3;

/// Maximum concurrent tasks an agent can hold.
pub const MAX_CONCURRENT_TASKS_PER_AGENT: usize = 3;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/// Task priority levels.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TaskPriority {
    Low,
    Medium,
    High,
    Critical,
}

impl TaskPriority {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Low => "low",
            Self::Medium => "medium",
            Self::High => "high",
            Self::Critical => "critical",
        }
    }

    pub fn from_str_loose(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "low" => Self::Low,
            "high" => Self::High,
            "critical" => Self::Critical,
            _ => Self::Medium,
        }
    }

    /// Numeric weight for sorting (higher = more urgent).
    pub fn weight(&self) -> u8 {
        match self {
            Self::Low => 1,
            Self::Medium => 2,
            Self::High => 3,
            Self::Critical => 4,
        }
    }
}

/// Kanban lifecycle status.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TaskStatus {
    Backlog,
    Claimed,
    InProgress,
    Blocked,
    InReview,
    Done,
    Failed,
}

impl TaskStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Backlog => "backlog",
            Self::Claimed => "claimed",
            Self::InProgress => "in_progress",
            Self::Blocked => "blocked",
            Self::InReview => "in_review",
            Self::Done => "done",
            Self::Failed => "failed",
        }
    }

    pub fn from_str_loose(s: &str) -> Self {
        match s {
            "backlog" => Self::Backlog,
            "claimed" => Self::Claimed,
            "in_progress" => Self::InProgress,
            "blocked" => Self::Blocked,
            "in_review" => Self::InReview,
            "done" => Self::Done,
            "failed" => Self::Failed,
            _ => Self::Backlog,
        }
    }
}

/// Review verdict from the orchestrator.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ReviewVerdict {
    Approved,
    NeedsRevision,
}

/// A single kanban task row.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KanbanTask {
    pub id: String,
    pub source_request_id: Option<String>,
    pub parent_task_id: Option<String>,
    pub title: String,
    pub description: String,
    pub tags: Vec<String>,
    pub priority: TaskPriority,
    pub status: TaskStatus,
    pub assigned_agent: Option<String>,
    pub conversation_id: Option<String>,
    pub result: Option<String>,
    pub review_feedback: Option<String>,
    pub block_reason: Option<String>,
    pub complexity_level: u32,
    pub depth: u32,
    pub created_at: String,
    pub updated_at: String,
    pub claimed_at: Option<String>,
    pub completed_at: Option<String>,
    /// Number of times this task has been sent back for revision.
    pub revision_count: u32,
    /// Conversation to notify when this task reaches a terminal state (done/failed).
    pub notify_conversation_id: Option<String>,
}

/// Input for creating a new task.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTaskInput {
    pub title: String,
    pub description: String,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default = "default_priority")]
    pub priority: TaskPriority,
    pub parent_task_id: Option<String>,
    pub source_request_id: Option<String>,
    #[serde(default = "default_complexity")]
    pub complexity_level: u32,
    /// Conversation to notify when this task reaches a terminal state (done/failed).
    pub notify_conversation_id: Option<String>,
}

fn default_priority() -> TaskPriority {
    TaskPriority::Medium
}

fn default_complexity() -> u32 {
    2
}

/// Input for updating task status from an agent.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateTaskInput {
    pub task_id: String,
    pub status: TaskStatus,
    pub result: Option<String>,
    pub block_reason: Option<String>,
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

/// SQLite-backed store for kanban tasks.
pub struct KanbanStore {
    pool: Arc<SqlitePool>,
    /// Notifies the kanban dispatcher when new work is available (task created
    /// or sent back for revision). Avoids polling-only dispatch latency.
    task_notify: Arc<tokio::sync::Notify>,
}

impl KanbanStore {
    pub fn new(pool: Arc<SqlitePool>) -> Self {
        Self {
            pool,
            task_notify: Arc::new(tokio::sync::Notify::new()),
        }
    }

    /// Create a store that shares a dispatcher notification handle.
    pub fn with_notify(pool: Arc<SqlitePool>, notify: Arc<tokio::sync::Notify>) -> Self {
        Self {
            pool,
            task_notify: notify,
        }
    }

    /// Returns a clone of the task notification handle so the dispatcher can
    /// wait on it.
    pub fn task_notify(&self) -> Arc<tokio::sync::Notify> {
        self.task_notify.clone()
    }

    /// Returns a reference to the underlying connection pool.
    pub fn pool(&self) -> &SqlitePool {
        &self.pool
    }

    /// Create a new task in the backlog.
    pub async fn create_task(&self, input: &CreateTaskInput) -> Result<KanbanTask> {
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        let tags_str = input.tags.join(",");
        let priority_str = input.priority.as_str();

        // Compute depth from parent.
        let depth = if let Some(ref parent_id) = input.parent_task_id {
            let parent = self.get_task(parent_id).await?;
            if parent.depth >= MAX_TASK_DEPTH {
                return Err(AppError::Validation(format!(
                    "max task depth ({MAX_TASK_DEPTH}) reached; cannot create subtask"
                )));
            }
            parent.depth + 1
        } else {
            0
        };

        // Inherit source_request_id from parent if not explicitly set.
        let source_request_id = match (&input.source_request_id, &input.parent_task_id) {
            (Some(src), _) => Some(src.clone()),
            (None, Some(parent_id)) => {
                let parent = self.get_task(parent_id).await?;
                parent.source_request_id
            }
            _ => None,
        };

        sqlx::query(
            "INSERT INTO kanban_tasks (id, source_request_id, parent_task_id, title, description, tags, priority, status, complexity_level, depth, created_at, updated_at, notify_conversation_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'backlog', ?, ?, ?, ?, ?)"
        )
        .bind(&id)
        .bind(&source_request_id)
        .bind(&input.parent_task_id)
        .bind(&input.title)
        .bind(&input.description)
        .bind(&tags_str)
        .bind(priority_str)
        .bind(input.complexity_level)
        .bind(depth)
        .bind(&now)
        .bind(&now)
        .bind(&input.notify_conversation_id)
        .execute(self.pool.as_ref())
        .await?;

        let task = self.get_task(&id).await?;
        // Wake the dispatcher immediately so it picks up this task.
        self.task_notify.notify_one();
        Ok(task)
    }

    /// Claim a task for an agent. Moves it from Backlog to Claimed.
    pub async fn claim_task(&self, task_id: &str, agent_name: &str) -> Result<KanbanTask> {
        // Check agent capacity.
        let active_count = self.count_active_tasks_for_agent(agent_name).await?;
        if active_count >= MAX_CONCURRENT_TASKS_PER_AGENT {
            return Err(AppError::Validation(format!(
                "agent '{agent_name}' already has {active_count} active tasks (max {MAX_CONCURRENT_TASKS_PER_AGENT})"
            )));
        }

        let task = self.get_task(task_id).await?;
        if task.status != TaskStatus::Backlog {
            return Err(AppError::Validation(format!(
                "task '{}' is not in backlog (current: {:?})",
                task_id, task.status
            )));
        }

        let now = Utc::now().to_rfc3339();
        sqlx::query(
            "UPDATE kanban_tasks SET status = 'claimed', assigned_agent = ?, claimed_at = ?, updated_at = ? WHERE id = ?",
        )
        .bind(agent_name)
        .bind(&now)
        .bind(&now)
        .bind(task_id)
        .execute(self.pool.as_ref())
        .await?;

        self.get_task(task_id).await
    }

    /// Update a task's status (used by agents during execution).
    pub async fn update_task_status(&self, input: &UpdateTaskInput) -> Result<KanbanTask> {
        let now = Utc::now().to_rfc3339();

        let completed_at = match input.status {
            TaskStatus::Done | TaskStatus::InReview | TaskStatus::Failed => Some(now.clone()),
            _ => None,
        };

        // When agent marks Done, move to InReview for orchestrator validation.
        let effective_status = if input.status == TaskStatus::Done {
            TaskStatus::InReview
        } else {
            input.status
        };

        sqlx::query(
            "UPDATE kanban_tasks SET status = ?, result = COALESCE(?, result), block_reason = ?, updated_at = ?, completed_at = COALESCE(?, completed_at) WHERE id = ?",
        )
        .bind(effective_status.as_str())
        .bind(&input.result)
        .bind(&input.block_reason)
        .bind(&now)
        .bind(&completed_at)
        .bind(&input.task_id)
        .execute(self.pool.as_ref())
        .await?;

        self.get_task(&input.task_id).await
    }

    /// Review a completed task. Approve to mark done, or reject for revision.
    ///
    /// When rejected, the task moves back to `Backlog` so the dispatcher picks
    /// it up again. After exceeding 2 revisions the task is auto-failed.
    pub async fn review_task(
        &self,
        task_id: &str,
        verdict: ReviewVerdict,
        feedback: Option<&str>,
    ) -> Result<KanbanTask> {
        let task = self.get_task(task_id).await?;
        if task.status != TaskStatus::InReview {
            return Err(AppError::Validation(format!(
                "task '{}' is not in review (current: {:?})",
                task_id, task.status
            )));
        }

        let now = Utc::now().to_rfc3339();

        match verdict {
            ReviewVerdict::Approved => {
                sqlx::query(
                    "UPDATE kanban_tasks SET status = ?, review_feedback = ?, updated_at = ? WHERE id = ?",
                )
                .bind(TaskStatus::Done.as_str())
                .bind(feedback)
                .bind(&now)
                .bind(task_id)
                .execute(self.pool.as_ref())
                .await?;
            }
            ReviewVerdict::NeedsRevision => {
                // Increment revision_count and move back to backlog for re-dispatch.
                sqlx::query(
                    "UPDATE kanban_tasks SET status = 'backlog', review_feedback = ?, \
                     revision_count = revision_count + 1, assigned_agent = NULL, updated_at = ? \
                     WHERE id = ? AND status = 'in_review'",
                )
                .bind(feedback)
                .bind(&now)
                .bind(task_id)
                .execute(self.pool.as_ref())
                .await?;

                // Auto-fail if max revisions exceeded (> 2 revisions = 3 total attempts).
                let count: (i64,) = sqlx::query_as(
                    "SELECT revision_count FROM kanban_tasks WHERE id = ?",
                )
                .bind(task_id)
                .fetch_one(self.pool.as_ref())
                .await?;
                if count.0 > 2 {
                    sqlx::query(
                        "UPDATE kanban_tasks SET status = 'failed', \
                         result = 'Exceeded maximum revision attempts', updated_at = ? \
                         WHERE id = ?",
                    )
                    .bind(&now)
                    .bind(task_id)
                    .execute(self.pool.as_ref())
                    .await?;
                } else {
                    // Task went back to backlog — wake the dispatcher for re-dispatch.
                    self.task_notify.notify_one();
                }
            }
        }

        self.get_task(task_id).await
    }

    /// Reassign a task to a different agent (used on rejection with reassignment).
    pub async fn reassign_task(&self, task_id: &str, agent_name: &str) -> Result<()> {
        let now = Utc::now().to_rfc3339();
        sqlx::query("UPDATE kanban_tasks SET assigned_agent = ?, updated_at = ? WHERE id = ?")
            .bind(agent_name)
            .bind(&now)
            .bind(task_id)
            .execute(self.pool.as_ref())
            .await?;
        Ok(())
    }

    /// Set conversation_id for a task (when the agent run starts).
    pub async fn set_conversation(&self, task_id: &str, conversation_id: &str) -> Result<()> {
        let now = Utc::now().to_rfc3339();
        sqlx::query("UPDATE kanban_tasks SET conversation_id = ?, updated_at = ? WHERE id = ?")
            .bind(conversation_id)
            .bind(&now)
            .bind(task_id)
            .execute(self.pool.as_ref())
            .await?;
        Ok(())
    }

    /// Get a single task by ID.
    pub async fn get_task(&self, task_id: &str) -> Result<KanbanTask> {
        let row = sqlx::query_as::<_, KanbanTaskRow>(
            "SELECT * FROM kanban_tasks WHERE id = ?"
        )
        .bind(task_id)
        .fetch_optional(self.pool.as_ref())
        .await?
        .ok_or_else(|| AppError::NotFound(format!("kanban task '{task_id}' not found")))?;

        Ok(row.into_task())
    }

    /// List all tasks, optionally filtered by status.
    pub async fn list_tasks(&self, status_filter: Option<TaskStatus>) -> Result<Vec<KanbanTask>> {
        let rows = if let Some(status) = status_filter {
            sqlx::query_as::<_, KanbanTaskRow>(
                "SELECT * FROM kanban_tasks WHERE status = ? ORDER BY created_at DESC",
            )
            .bind(status.as_str())
            .fetch_all(self.pool.as_ref())
            .await?
        } else {
            sqlx::query_as::<_, KanbanTaskRow>(
                "SELECT * FROM kanban_tasks ORDER BY created_at DESC",
            )
            .fetch_all(self.pool.as_ref())
            .await?
        };

        Ok(rows.into_iter().map(|r| r.into_task()).collect())
    }

    /// List tasks for a specific source request (all tasks in one user request tree).
    pub async fn list_tasks_by_source(&self, source_request_id: &str) -> Result<Vec<KanbanTask>> {
        let rows = sqlx::query_as::<_, KanbanTaskRow>(
            "SELECT * FROM kanban_tasks WHERE source_request_id = ? ORDER BY depth ASC, created_at ASC",
        )
        .bind(source_request_id)
        .fetch_all(self.pool.as_ref())
        .await?;

        Ok(rows.into_iter().map(|r| r.into_task()).collect())
    }

    /// List tasks assigned to a specific agent.
    pub async fn list_tasks_by_agent(&self, agent_name: &str) -> Result<Vec<KanbanTask>> {
        let rows = sqlx::query_as::<_, KanbanTaskRow>(
            "SELECT * FROM kanban_tasks WHERE assigned_agent = ? ORDER BY created_at DESC",
        )
        .bind(agent_name)
        .fetch_all(self.pool.as_ref())
        .await?;

        Ok(rows.into_iter().map(|r| r.into_task()).collect())
    }

    /// List unclaimed backlog tasks.
    pub async fn list_backlog_tasks(&self) -> Result<Vec<KanbanTask>> {
        self.list_tasks(Some(TaskStatus::Backlog)).await
    }

    /// List all tasks ordered by updated_at DESC, limited to 50.
    pub async fn list_all_tasks(&self) -> Result<Vec<KanbanTask>> {
        let rows = sqlx::query_as::<_, KanbanTaskRow>(
            "SELECT * FROM kanban_tasks ORDER BY updated_at DESC LIMIT 50",
        )
        .fetch_all(self.pool.as_ref())
        .await?;

        Ok(rows.into_iter().map(|r| r.into_task()).collect())
    }

    /// Count active (claimed/in_progress/blocked) tasks for an agent.
    pub async fn count_active_tasks_for_agent(&self, agent_name: &str) -> Result<usize> {
        let row: (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM kanban_tasks WHERE assigned_agent = ? AND status IN ('claimed', 'in_progress', 'blocked')",
        )
        .bind(agent_name)
        .fetch_one(self.pool.as_ref())
        .await?;

        Ok(row.0 as usize)
    }

    /// Check if all root tasks for a source request are done.
    pub async fn all_root_tasks_done(&self, source_request_id: &str) -> Result<bool> {
        let row: (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM kanban_tasks WHERE source_request_id = ? AND parent_task_id IS NULL AND status != 'done'",
        )
        .bind(source_request_id)
        .fetch_one(self.pool.as_ref())
        .await?;

        Ok(row.0 == 0)
    }

    /// Delete a task by ID. Also deletes any child subtasks.
    pub async fn delete_task(&self, task_id: &str) -> Result<()> {
        // Delete subtasks first (parent_task_id FK is SET NULL, but we want full cleanup).
        sqlx::query("DELETE FROM kanban_tasks WHERE parent_task_id = ?1")
            .bind(task_id)
            .execute(self.pool.as_ref())
            .await?;
        let result = sqlx::query("DELETE FROM kanban_tasks WHERE id = ?1")
            .bind(task_id)
            .execute(self.pool.as_ref())
            .await?;
        if result.rows_affected() == 0 {
            return Err(AppError::NotFound(format!("task {task_id} not found")));
        }
        Ok(())
    }

    /// Get board summary statistics.
    pub async fn get_board_stats(&self) -> Result<KanbanBoardStats> {
        let rows = sqlx::query_as::<_, StatusCountRow>(
            "SELECT status, COUNT(*) as count FROM kanban_tasks GROUP BY status",
        )
        .fetch_all(self.pool.as_ref())
        .await?;

        let mut stats = KanbanBoardStats::default();
        for row in rows {
            let count = row.count as usize;
            match row.status.as_str() {
                "backlog" => stats.backlog = count,
                "claimed" => stats.claimed = count,
                "in_progress" => stats.in_progress = count,
                "blocked" => stats.blocked = count,
                "in_review" => stats.in_review = count,
                "done" => stats.done = count,
                "failed" => stats.failed = count,
                _ => {}
            }
        }
        stats.total = stats.backlog
            + stats.claimed
            + stats.in_progress
            + stats.blocked
            + stats.in_review
            + stats.done
            + stats.failed;

        Ok(stats)
    }
}

// ---------------------------------------------------------------------------
// Board stats response
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KanbanBoardStats {
    pub total: usize,
    pub backlog: usize,
    pub claimed: usize,
    pub in_progress: usize,
    pub blocked: usize,
    pub in_review: usize,
    pub done: usize,
    pub failed: usize,
}

// ---------------------------------------------------------------------------
// Internal row mapping
// ---------------------------------------------------------------------------

#[derive(sqlx::FromRow)]
struct KanbanTaskRow {
    id: String,
    source_request_id: Option<String>,
    parent_task_id: Option<String>,
    title: String,
    description: String,
    tags: String,
    priority: String,
    status: String,
    assigned_agent: Option<String>,
    conversation_id: Option<String>,
    result: Option<String>,
    review_feedback: Option<String>,
    block_reason: Option<String>,
    complexity_level: i64,
    depth: i64,
    created_at: String,
    updated_at: String,
    claimed_at: Option<String>,
    completed_at: Option<String>,
    revision_count: i64,
    notify_conversation_id: Option<String>,
}

impl KanbanTaskRow {
    fn into_task(self) -> KanbanTask {
        KanbanTask {
            id: self.id,
            source_request_id: self.source_request_id,
            parent_task_id: self.parent_task_id,
            title: self.title,
            description: self.description,
            tags: self
                .tags
                .split(',')
                .map(|s| s.trim().to_owned())
                .filter(|s| !s.is_empty())
                .collect(),
            priority: TaskPriority::from_str_loose(&self.priority),
            status: TaskStatus::from_str_loose(&self.status),
            assigned_agent: self.assigned_agent,
            conversation_id: self.conversation_id,
            result: self.result,
            review_feedback: self.review_feedback,
            block_reason: self.block_reason,
            complexity_level: self.complexity_level as u32,
            depth: self.depth as u32,
            created_at: self.created_at,
            updated_at: self.updated_at,
            claimed_at: self.claimed_at,
            completed_at: self.completed_at,
            revision_count: self.revision_count as u32,
            notify_conversation_id: self.notify_conversation_id,
        }
    }
}

#[derive(sqlx::FromRow)]
struct StatusCountRow {
    status: String,
    count: i64,
}

#[cfg(test)]
#[path = "kanban_store_tests.rs"]
mod tests;
