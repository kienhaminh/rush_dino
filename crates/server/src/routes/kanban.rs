//! API routes for the kanban task board.
//!
//! Provides endpoints for listing tasks, viewing the board, and getting stats.
//! Task mutations (create, claim, update, review) happen through agent tools.

use axum::{
    extract::{Path, Query, State},
    Json,
};
use chrono::Utc;
use serde::{Deserialize, Serialize};

use rushdino_agent::kanban_store::{KanbanBoardStats, KanbanTask, TaskStatus};
use rushdino_common::Result;

use crate::state::AppState;

// ---------------------------------------------------------------------------
// Query params
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
pub struct KanbanListQuery {
    /// Filter by status (e.g. "backlog", "in_progress", "done").
    pub status: Option<String>,
    /// Filter by assigned agent name.
    pub agent: Option<String>,
    /// Filter by source request ID.
    pub source: Option<String>,
}

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KanbanBoardResponse {
    pub generated_at: String,
    pub stats: KanbanBoardStats,
    pub columns: KanbanBoardColumns,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KanbanBoardColumns {
    pub backlog: Vec<KanbanTask>,
    pub claimed: Vec<KanbanTask>,
    pub in_progress: Vec<KanbanTask>,
    pub blocked: Vec<KanbanTask>,
    pub in_review: Vec<KanbanTask>,
    pub done: Vec<KanbanTask>,
    pub failed: Vec<KanbanTask>,
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/// GET /api/kanban/board — Full board view with all columns and stats.
pub async fn get_kanban_board(State(state): State<AppState>) -> Result<Json<KanbanBoardResponse>> {
    let engine = state.engine()?;
    let store = engine.kanban_store();

    let stats = store.get_board_stats().await?;
    let all_tasks = store.list_tasks(None).await?;

    let mut columns = KanbanBoardColumns {
        backlog: Vec::new(),
        claimed: Vec::new(),
        in_progress: Vec::new(),
        blocked: Vec::new(),
        in_review: Vec::new(),
        done: Vec::new(),
        failed: Vec::new(),
    };

    for task in all_tasks {
        match task.status {
            TaskStatus::Backlog => columns.backlog.push(task),
            TaskStatus::Claimed => columns.claimed.push(task),
            TaskStatus::InProgress => columns.in_progress.push(task),
            TaskStatus::Blocked => columns.blocked.push(task),
            TaskStatus::InReview => columns.in_review.push(task),
            TaskStatus::Done => columns.done.push(task),
            TaskStatus::Failed => columns.failed.push(task),
        }
    }

    Ok(Json(KanbanBoardResponse {
        generated_at: Utc::now().to_rfc3339(),
        stats,
        columns,
    }))
}

/// GET /api/kanban/tasks — List tasks with optional filters.
pub async fn list_kanban_tasks(
    State(state): State<AppState>,
    Query(query): Query<KanbanListQuery>,
) -> Result<Json<Vec<KanbanTask>>> {
    let engine = state.engine()?;
    let store = engine.kanban_store();

    let tasks = if let Some(ref agent) = query.agent {
        store.list_tasks_by_agent(agent).await?
    } else if let Some(ref source) = query.source {
        store.list_tasks_by_source(source).await?
    } else if let Some(ref status) = query.status {
        let status = TaskStatus::from_str_loose(status);
        store.list_tasks(Some(status)).await?
    } else {
        store.list_tasks(None).await?
    };

    Ok(Json(tasks))
}

/// GET /api/kanban/tasks/:id — Get a single task by ID.
pub async fn get_kanban_task(
    State(state): State<AppState>,
    Path(task_id): Path<String>,
) -> Result<Json<KanbanTask>> {
    let engine = state.engine()?;
    let store = engine.kanban_store();
    let task = store.get_task(&task_id).await?;
    Ok(Json(task))
}

/// DELETE /api/kanban/tasks/:id — Delete a task and its subtasks.
pub async fn delete_kanban_task(
    State(state): State<AppState>,
    Path(task_id): Path<String>,
) -> Result<Json<serde_json::Value>> {
    let engine = state.engine()?;
    let store = engine.kanban_store();
    store.delete_task(&task_id).await?;
    Ok(Json(serde_json::json!({ "deleted": task_id })))
}

/// GET /api/kanban/stats — Board statistics only.
pub async fn get_kanban_stats(State(state): State<AppState>) -> Result<Json<KanbanBoardStats>> {
    let engine = state.engine()?;
    let store = engine.kanban_store();
    let stats = store.get_board_stats().await?;
    Ok(Json(stats))
}
