use std::sync::Arc;

use sqlx::SqlitePool;

use rushdino_common::{AppError, Result};

use crate::workflow_types::{WorkflowRunStatus, WorkflowRunStepDetail, WorkflowRunStepStatus, WorkflowSource, WorkflowStatus};

mod runs;
mod steps;
mod workflows;

#[cfg(test)]
mod tests;

/// Central manager for workflow CRUD, run lifecycle, and step state transitions.
#[derive(Clone)]
pub struct WorkflowManager {
    pub(super) pool: Arc<SqlitePool>,
}

impl WorkflowManager {
    pub fn new(pool: Arc<SqlitePool>) -> Self {
        Self { pool }
    }
}

// ---------------------------------------------------------------------------
// Shared parsing helpers (used by both workflows.rs and runs.rs)
// ---------------------------------------------------------------------------

pub(super) fn parse_source(value: &str) -> Result<WorkflowSource> {
    WorkflowSource::from_db(value)
        .ok_or_else(|| AppError::Validation(format!("invalid workflow source: {value}")))
}

pub(super) fn parse_workflow_status(value: &str) -> Result<WorkflowStatus> {
    WorkflowStatus::from_db(value)
        .ok_or_else(|| AppError::Validation(format!("invalid workflow status: {value}")))
}

pub(super) fn parse_run_status(value: &str) -> Result<WorkflowRunStatus> {
    WorkflowRunStatus::from_db(value)
        .ok_or_else(|| AppError::Validation(format!("invalid workflow run status: {value}")))
}

pub(super) fn parse_run_step_status(value: &str) -> Result<WorkflowRunStepStatus> {
    WorkflowRunStepStatus::from_db(value)
        .ok_or_else(|| AppError::Validation(format!("invalid workflow run step status: {value}")))
}

// ---------------------------------------------------------------------------
// Shared row-mapping helpers
// ---------------------------------------------------------------------------

pub(super) fn map_run_step_detail(row: sqlx::sqlite::SqliteRow) -> Result<WorkflowRunStepDetail> {
    use sqlx::Row;
    Ok(WorkflowRunStepDetail {
        id: row.get::<String, _>("id"),
        run_id: row.get::<String, _>("run_id"),
        step_id: row.get::<String, _>("step_id"),
        position: row.get::<i64, _>("position"),
        step_name: row.get::<String, _>("step_name"),
        agent_id: row.get::<String, _>("agent_id"),
        status: parse_run_step_status(&row.get::<String, _>("status"))?,
        input: row.get::<String, _>("input"),
        output: row.get::<Option<String>, _>("output"),
        error: row.get::<Option<String>, _>("error"),
        conversation_id: row.get::<Option<String>, _>("conversation_id"),
        started_at: row.get::<Option<String>, _>("started_at"),
        completed_at: row.get::<Option<String>, _>("completed_at"),
        retry_count: row.get::<i64, _>("retry_count"),
    })
}

// ---------------------------------------------------------------------------
// Shared validation helpers
// ---------------------------------------------------------------------------

pub(super) fn validate_workflow_name(name: &str) -> Result<()> {
    if name.trim().is_empty() {
        return Err(AppError::Validation("workflow name is required".to_owned()));
    }
    Ok(())
}

pub(super) fn validate_steps(steps: &[crate::workflow_types::WorkflowStepInput]) -> Result<()> {
    if steps.is_empty() {
        return Err(AppError::Validation(
            "workflow must contain at least one step".to_owned(),
        ));
    }
    for (index, step) in steps.iter().enumerate() {
        if step.name.trim().is_empty() {
            return Err(AppError::Validation(format!(
                "step {} name is required",
                index + 1
            )));
        }
        if step.instructions.trim().is_empty() {
            return Err(AppError::Validation(format!(
                "step {} instructions are required",
                index + 1
            )));
        }
        if step.agent_id.trim().is_empty() {
            return Err(AppError::Validation(format!(
                "step {} agent_id is required",
                index + 1
            )));
        }
    }
    Ok(())
}

