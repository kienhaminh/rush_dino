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
}

impl KanbanStore {
    pub fn new(pool: Arc<SqlitePool>) -> Self {
        Self { pool }
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

        self.get_task(&id).await
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

    /// Review a completed task (orchestrator only).
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
        let new_status = match verdict {
            ReviewVerdict::Approved => TaskStatus::Done,
            ReviewVerdict::NeedsRevision => TaskStatus::InProgress,
        };

        sqlx::query(
            "UPDATE kanban_tasks SET status = ?, review_feedback = ?, updated_at = ? WHERE id = ?",
        )
        .bind(new_status.as_str())
        .bind(feedback)
        .bind(&now)
        .bind(task_id)
        .execute(self.pool.as_ref())
        .await?;

        self.get_task(task_id).await
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
mod tests {
    use super::*;

    #[test]
    fn task_priority_roundtrip() {
        for p in [
            TaskPriority::Low,
            TaskPriority::Medium,
            TaskPriority::High,
            TaskPriority::Critical,
        ] {
            assert_eq!(TaskPriority::from_str_loose(p.as_str()), p);
        }
    }

    #[test]
    fn task_status_roundtrip() {
        for s in [
            TaskStatus::Backlog,
            TaskStatus::Claimed,
            TaskStatus::InProgress,
            TaskStatus::Blocked,
            TaskStatus::InReview,
            TaskStatus::Done,
            TaskStatus::Failed,
        ] {
            assert_eq!(TaskStatus::from_str_loose(s.as_str()), s);
        }
    }

    #[test]
    fn priority_weight_ordering() {
        assert!(TaskPriority::Critical.weight() > TaskPriority::High.weight());
        assert!(TaskPriority::High.weight() > TaskPriority::Medium.weight());
        assert!(TaskPriority::Medium.weight() > TaskPriority::Low.weight());
    }

    #[test]
    fn tags_parsing_handles_empty_and_whitespace() {
        let row = KanbanTaskRow {
            id: "t1".into(),
            source_request_id: None,
            parent_task_id: None,
            title: "test".into(),
            description: "desc".into(),
            tags: " code , architecture , ".into(),
            priority: "medium".into(),
            status: "backlog".into(),
            assigned_agent: None,
            conversation_id: None,
            result: None,
            review_feedback: None,
            block_reason: None,
            complexity_level: 2,
            depth: 0,
            created_at: "2026-01-01T00:00:00Z".into(),
            updated_at: "2026-01-01T00:00:00Z".into(),
            claimed_at: None,
            completed_at: None,
            notify_conversation_id: None,
        };
        let task = row.into_task();
        assert_eq!(task.tags, vec!["code", "architecture"]);
    }

    async fn test_store() -> KanbanStore {
        let pool = sqlx::SqlitePool::connect(":memory:").await.unwrap();
        sqlx::query(
            "CREATE TABLE kanban_tasks (
                id TEXT PRIMARY KEY,
                source_request_id TEXT,
                parent_task_id TEXT,
                title TEXT NOT NULL,
                description TEXT NOT NULL,
                tags TEXT NOT NULL DEFAULT '',
                priority TEXT NOT NULL DEFAULT 'medium',
                status TEXT NOT NULL DEFAULT 'backlog',
                assigned_agent TEXT,
                conversation_id TEXT,
                result TEXT,
                review_feedback TEXT,
                block_reason TEXT,
                complexity_level INTEGER NOT NULL DEFAULT 2,
                depth INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                claimed_at TEXT,
                completed_at TEXT,
                notify_conversation_id TEXT
            )",
        )
        .execute(&pool)
        .await
        .unwrap();
        KanbanStore::new(std::sync::Arc::new(pool))
    }

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
            notify_conversation_id: Some("main".into()),
        };
        let task = store.create_task(&input).await.unwrap();
        assert_eq!(task.notify_conversation_id.as_deref(), Some("main"));
    }
}
