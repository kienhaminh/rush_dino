//! Workflow run lifecycle operations: create, list, get, and mark_run_* state transitions.

use chrono::Utc;
use sqlx::Row;
use uuid::Uuid;

use rushdino_common::{AppError, Result};

use crate::workflow_types::{
    StepType, WorkflowRunDetail, WorkflowRunExecutionContext, WorkflowRunExecutionStep,
    WorkflowRunListItem, WorkflowRunStartResponse, WorkflowRunStatus, WorkflowRunStepStatus,
};

use super::{map_run_step_detail, parse_run_status, parse_workflow_status, WorkflowManager};

impl WorkflowManager {
    pub async fn create_run(
        &self,
        workflow_id: &str,
        triggered_by: &str,
        run_input: &str,
    ) -> Result<WorkflowRunStartResponse> {
        let now = Utc::now().to_rfc3339();
        let run_id = Uuid::new_v4().to_string();

        let mut tx = self.pool.begin().await?;

        let workflow_row = sqlx::query("SELECT status FROM workflows WHERE id = ?1")
            .bind(workflow_id)
            .fetch_optional(&mut *tx)
            .await?
            .ok_or_else(|| AppError::NotFound(format!("workflow {workflow_id} not found")))?;

        let status = workflow_row.get::<String, _>("status");
        if parse_workflow_status(&status)? != WorkflowStatus::Active {
            return Err(AppError::Validation(
                "cannot run workflow in draft status".to_owned(),
            ));
        }

        let active_count = sqlx::query(
            "SELECT COUNT(1) AS count FROM workflow_runs WHERE workflow_id = ?1 AND status IN ('queued','running')",
        )
        .bind(workflow_id)
        .fetch_one(&mut *tx)
        .await?
        .get::<i64, _>("count");

        if active_count > 0 {
            return Err(AppError::Validation(
                "workflow already has an active run".to_owned(),
            ));
        }

        let steps = sqlx::query(
            "SELECT id, position, name, agent_id FROM workflow_steps WHERE workflow_id = ?1 ORDER BY position ASC",
        )
        .bind(workflow_id)
        .fetch_all(&mut *tx)
        .await?;

        if steps.is_empty() {
            return Err(AppError::Validation(
                "cannot run workflow without steps".to_owned(),
            ));
        }

        sqlx::query(
            r#"
            INSERT INTO workflow_runs (id, workflow_id, status, triggered_by, input, error, started_at, completed_at)
            VALUES (?1, ?2, ?3, ?4, ?5, NULL, ?6, NULL)
            "#,
        )
        .bind(&run_id)
        .bind(workflow_id)
        .bind(WorkflowRunStatus::Queued.as_str())
        .bind(triggered_by)
        .bind(run_input)
        .bind(&now)
        .execute(&mut *tx)
        .await?;

        for step in steps {
            sqlx::query(
                r#"
                INSERT INTO workflow_run_steps
                  (id, run_id, step_id, position, step_name, agent_id, status, input, output, error, conversation_id, started_at, completed_at)
                VALUES
                  (?1, ?2, ?3, ?4, ?5, ?6, ?7, '', NULL, NULL, NULL, NULL, NULL)
                "#,
            )
            .bind(Uuid::new_v4().to_string())
            .bind(&run_id)
            .bind(step.get::<String, _>("id"))
            .bind(step.get::<i64, _>("position"))
            .bind(step.get::<String, _>("name"))
            .bind(step.get::<String, _>("agent_id"))
            .bind(WorkflowRunStepStatus::Pending.as_str())
            .execute(&mut *tx)
            .await?;
        }

        tx.commit().await?;

        Ok(WorkflowRunStartResponse {
            run_id,
            status: WorkflowRunStatus::Queued,
        })
    }

    pub async fn list_runs(
        &self,
        workflow_id: &str,
        limit: i64,
    ) -> Result<Vec<WorkflowRunListItem>> {
        let bounded_limit = limit.clamp(1, 100);

        let rows = sqlx::query(
            r#"
            SELECT id, workflow_id, status, triggered_by, input, error, started_at, completed_at
            FROM workflow_runs
            WHERE workflow_id = ?1
            ORDER BY started_at DESC
            LIMIT ?2
            "#,
        )
        .bind(workflow_id)
        .bind(bounded_limit)
        .fetch_all(self.pool.as_ref())
        .await?;

        rows.into_iter().map(map_run_list_item).collect()
    }

    pub async fn get_run_detail(&self, run_id: &str) -> Result<WorkflowRunDetail> {
        let run_row = sqlx::query(
            r#"
            SELECT id, workflow_id, status, triggered_by, input, error, started_at, completed_at
            FROM workflow_runs
            WHERE id = ?1
            "#,
        )
        .bind(run_id)
        .fetch_optional(self.pool.as_ref())
        .await?
        .ok_or_else(|| AppError::NotFound(format!("workflow run {run_id} not found")))?;

        let step_rows = sqlx::query(
            r#"
            SELECT id, run_id, step_id, position, step_name, agent_id, status, input, output, error,
                   conversation_id, started_at, completed_at, retry_count
            FROM workflow_run_steps
            WHERE run_id = ?1
            ORDER BY position ASC
            "#,
        )
        .bind(run_id)
        .fetch_all(self.pool.as_ref())
        .await?;

        Ok(WorkflowRunDetail {
            id: run_row.get::<String, _>("id"),
            workflow_id: run_row.get::<String, _>("workflow_id"),
            status: parse_run_status(&run_row.get::<String, _>("status"))?,
            triggered_by: run_row.get::<String, _>("triggered_by"),
            input: run_row.get::<String, _>("input"),
            error: run_row.get::<Option<String>, _>("error"),
            started_at: run_row.get::<String, _>("started_at"),
            completed_at: run_row.get::<Option<String>, _>("completed_at"),
            steps: step_rows
                .into_iter()
                .map(map_run_step_detail)
                .collect::<Result<Vec<_>>>()?,
        })
    }

    pub async fn load_execution_context(
        &self,
        run_id: &str,
    ) -> Result<WorkflowRunExecutionContext> {
        let run_row = sqlx::query("SELECT id, workflow_id, input FROM workflow_runs WHERE id = ?1")
            .bind(run_id)
            .fetch_optional(self.pool.as_ref())
            .await?
            .ok_or_else(|| AppError::NotFound(format!("workflow run {run_id} not found")))?;

        let rows = sqlx::query(
            r#"
            SELECT
              rs.id          AS run_step_id,
              rs.step_id     AS step_id,
              rs.position    AS position,
              rs.step_name   AS step_name,
              rs.agent_id    AS agent_id,
              rs.retry_count AS retry_count,
              ws.instructions  AS instructions,
              ws.step_type     AS step_type,
              ws.depends_on    AS depends_on,
              ws.max_retries   AS max_retries,
              ws.timeout_secs  AS timeout_secs,
              ws.condition     AS condition
            FROM workflow_run_steps rs
            LEFT JOIN workflow_steps ws ON ws.id = rs.step_id
            WHERE rs.run_id = ?1
            ORDER BY rs.position ASC
            "#,
        )
        .bind(run_id)
        .fetch_all(self.pool.as_ref())
        .await?;

        let mut steps = Vec::with_capacity(rows.len());
        for row in rows {
            let instructions = row
                .get::<Option<String>, _>("instructions")
                .ok_or_else(|| {
                    AppError::Validation("run step is missing source instructions".to_owned())
                })?;
            // Deserialize depends_on from stored JSON string
            let depends_on: Option<Vec<String>> = row
                .get::<Option<String>, _>("depends_on")
                .and_then(|json| serde_json::from_str(&json).ok());
            let step_type = row
                .get::<Option<String>, _>("step_type")
                .map(|s| StepType::from_str_loose(&s))
                .unwrap_or_default();
            steps.push(WorkflowRunExecutionStep {
                run_step_id: row.get::<String, _>("run_step_id"),
                step_id: row.get::<String, _>("step_id"),
                position: row.get::<i64, _>("position"),
                step_name: row.get::<String, _>("step_name"),
                instructions,
                agent_id: row.get::<String, _>("agent_id"),
                step_type,
                depends_on,
                max_retries: u8::try_from(row.get::<i64, _>("max_retries")).unwrap_or(0),
                timeout_secs: row.get::<Option<i64>, _>("timeout_secs").map(|t| t as u64),
                condition: row.get::<Option<String>, _>("condition"),
                retry_count: row.get::<i64, _>("retry_count"),
            });
        }

        Ok(WorkflowRunExecutionContext {
            run_id: run_row.get::<String, _>("id"),
            workflow_id: run_row.get::<String, _>("workflow_id"),
            run_input: run_row.get::<String, _>("input"),
            steps,
        })
    }

    pub async fn mark_run_running(&self, run_id: &str) -> Result<()> {
        sqlx::query("UPDATE workflow_runs SET status = ?1 WHERE id = ?2")
            .bind(WorkflowRunStatus::Running.as_str())
            .bind(run_id)
            .execute(self.pool.as_ref())
            .await?;
        Ok(())
    }

    pub async fn mark_run_succeeded(&self, run_id: &str) -> Result<()> {
        let now = Utc::now().to_rfc3339();
        sqlx::query("UPDATE workflow_runs SET status = ?1, completed_at = ?2 WHERE id = ?3")
            .bind(WorkflowRunStatus::Succeeded.as_str())
            .bind(&now)
            .bind(run_id)
            .execute(self.pool.as_ref())
            .await?;
        Ok(())
    }

    pub async fn mark_run_failed(&self, run_id: &str, error: &str) -> Result<()> {
        let now = Utc::now().to_rfc3339();
        sqlx::query(
            "UPDATE workflow_runs SET status = ?1, error = ?2, completed_at = ?3 WHERE id = ?4",
        )
        .bind(WorkflowRunStatus::Failed.as_str())
        .bind(error)
        .bind(&now)
        .bind(run_id)
        .execute(self.pool.as_ref())
        .await?;
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Row-mapping helpers local to run operations
// ---------------------------------------------------------------------------

fn map_run_list_item(row: sqlx::sqlite::SqliteRow) -> Result<WorkflowRunListItem> {
    Ok(WorkflowRunListItem {
        id: row.get::<String, _>("id"),
        workflow_id: row.get::<String, _>("workflow_id"),
        status: parse_run_status(&row.get::<String, _>("status"))?,
        triggered_by: row.get::<String, _>("triggered_by"),
        input: row.get::<String, _>("input"),
        error: row.get::<Option<String>, _>("error"),
        started_at: row.get::<String, _>("started_at"),
        completed_at: row.get::<Option<String>, _>("completed_at"),
    })
}

// `WorkflowStatus` is needed locally by `create_run` — bring it into scope.
use crate::workflow_types::WorkflowStatus;
