use std::sync::Arc;

use chrono::Utc;
use sqlx::{Row, SqlitePool};
use uuid::Uuid;

use rushdino_common::{AppError, Result};

use crate::workflow_types::{
    CreateWorkflowInput, UpdateWorkflowInput, WorkflowDetail, WorkflowListItem, WorkflowRunDetail,
    WorkflowRunExecutionContext, WorkflowRunExecutionStep, WorkflowRunListItem,
    WorkflowRunStartResponse, WorkflowRunStatus, WorkflowRunStepDetail, WorkflowRunStepStatus,
    WorkflowSource, WorkflowStatus, WorkflowStep,
};

#[derive(Clone)]
pub struct WorkflowManager {
    pool: Arc<SqlitePool>,
}

impl WorkflowManager {
    pub fn new(pool: Arc<SqlitePool>) -> Self {
        Self { pool }
    }

    pub async fn list_workflows(&self) -> Result<Vec<WorkflowListItem>> {


        let rows = sqlx::query(
            r#"
            SELECT
              w.id,
              w.name,
              w.description,
              w.source,
              w.status,
              w.created_by,
              w.created_at,
              w.updated_at,
              COUNT(s.id) AS step_count
            FROM workflows w
            LEFT JOIN workflow_steps s ON s.workflow_id = w.id
            GROUP BY w.id
            ORDER BY w.updated_at DESC
            "#,
        )
        .fetch_all(self.pool.as_ref())
        .await?;

        rows.into_iter().map(map_workflow_list_item).collect()
    }

    pub async fn get_workflow(&self, id: &str) -> Result<WorkflowDetail> {


        let workflow_row = sqlx::query(
            r#"
            SELECT id, name, description, source, status, created_by, created_at, updated_at
            FROM workflows
            WHERE id = ?1
            "#,
        )
        .bind(id)
        .fetch_optional(self.pool.as_ref())
        .await?
        .ok_or_else(|| AppError::NotFound(format!("workflow {id} not found")))?;

        let step_rows = sqlx::query(
            r#"
            SELECT id, workflow_id, position, name, instructions, agent_id, created_at, updated_at,
                   depends_on, max_retries, timeout_secs, condition
            FROM workflow_steps
            WHERE workflow_id = ?1
            ORDER BY position ASC
            "#,
        )
        .bind(id)
        .fetch_all(self.pool.as_ref())
        .await?;

        Ok(WorkflowDetail {
            id: workflow_row.get::<String, _>("id"),
            name: workflow_row.get::<String, _>("name"),
            description: workflow_row.get::<String, _>("description"),
            source: parse_source(&workflow_row.get::<String, _>("source"))?,
            status: parse_workflow_status(&workflow_row.get::<String, _>("status"))?,
            created_by: workflow_row.get::<String, _>("created_by"),
            created_at: workflow_row.get::<String, _>("created_at"),
            updated_at: workflow_row.get::<String, _>("updated_at"),
            steps: step_rows
                .into_iter()
                .map(map_workflow_step)
                .collect::<Result<_>>()?,
        })
    }

    pub async fn create_workflow(
        &self,
        payload: CreateWorkflowInput,
        source: WorkflowSource,
        created_by: &str,
    ) -> Result<WorkflowDetail> {


        validate_workflow_name(&payload.name)?;
        validate_steps(&payload.steps)?;

        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();

        let mut tx = self.pool.begin().await?;

        sqlx::query(
            r#"
            INSERT INTO workflows (id, name, description, source, status, created_by, created_at, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
            "#,
        )
        .bind(&id)
        .bind(payload.name.trim())
        .bind(payload.description.trim())
        .bind(source.as_str())
        .bind(payload.status.as_str())
        .bind(created_by)
        .bind(&now)
        .bind(&now)
        .execute(&mut *tx)
        .await?;

        for (index, step) in payload.steps.iter().enumerate() {
            let depends_on_json = step
                .depends_on
                .as_ref()
                .map(|ids| serde_json::to_string(ids).unwrap_or_default());
            sqlx::query(
                r#"
                INSERT INTO workflow_steps
                  (id, workflow_id, position, name, instructions, agent_id, created_at, updated_at,
                   depends_on, max_retries, timeout_secs, condition)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
                "#,
            )
            .bind(Uuid::new_v4().to_string())
            .bind(&id)
            .bind((index + 1) as i64)
            .bind(step.name.trim())
            .bind(step.instructions.trim())
            .bind(step.agent_id.trim())
            .bind(&now)
            .bind(&now)
            .bind(depends_on_json)
            .bind(step.max_retries as i64)
            .bind(step.timeout_secs.map(|t| t as i64))
            .bind(step.condition.as_deref())
            .execute(&mut *tx)
            .await?;
        }

        tx.commit().await?;
        self.get_workflow(&id).await
    }

    pub async fn update_workflow(
        &self,
        id: &str,
        payload: UpdateWorkflowInput,
    ) -> Result<WorkflowDetail> {


        let existing = self.get_workflow(id).await?;

        if let Some(name) = payload.name.as_ref() {
            validate_workflow_name(name)?;
        }
        if let Some(steps) = payload.steps.as_ref() {
            validate_steps(steps)?;
        }

        let name = payload
            .name
            .as_deref()
            .map(str::trim)
            .unwrap_or(existing.name.as_str())
            .to_owned();
        let description = payload
            .description
            .as_deref()
            .map(str::trim)
            .unwrap_or(existing.description.as_str())
            .to_owned();
        let status = payload.status.unwrap_or(existing.status);
        let now = Utc::now().to_rfc3339();

        let mut tx = self.pool.begin().await?;

        sqlx::query("UPDATE workflows SET name = ?1, description = ?2, status = ?3, updated_at = ?4 WHERE id = ?5")
            .bind(&name)
            .bind(&description)
            .bind(status.as_str())
            .bind(&now)
            .bind(id)
            .execute(&mut *tx)
            .await?;

        if let Some(steps) = payload.steps {
            sqlx::query("DELETE FROM workflow_steps WHERE workflow_id = ?1")
                .bind(id)
                .execute(&mut *tx)
                .await?;

            for (index, step) in steps.iter().enumerate() {
                let depends_on_json = step
                    .depends_on
                    .as_ref()
                    .map(|ids| serde_json::to_string(ids).unwrap_or_default());
                sqlx::query(
                    r#"
                    INSERT INTO workflow_steps
                      (id, workflow_id, position, name, instructions, agent_id, created_at, updated_at,
                       depends_on, max_retries, timeout_secs, condition)
                    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
                    "#,
                )
                .bind(Uuid::new_v4().to_string())
                .bind(id)
                .bind((index + 1) as i64)
                .bind(step.name.trim())
                .bind(step.instructions.trim())
                .bind(step.agent_id.trim())
                .bind(&now)
                .bind(&now)
                .bind(depends_on_json)
                .bind(step.max_retries as i64)
                .bind(step.timeout_secs.map(|t| t as i64))
                .bind(step.condition.as_deref())
                .execute(&mut *tx)
                .await?;
            }
        }

        tx.commit().await?;
        self.get_workflow(id).await
    }

    pub async fn delete_workflow(&self, id: &str) -> Result<()> {


        let result = sqlx::query("DELETE FROM workflows WHERE id = ?1")
            .bind(id)
            .execute(self.pool.as_ref())
            .await?;

        if result.rows_affected() == 0 {
            return Err(AppError::NotFound(format!("workflow {id} not found")));
        }

        Ok(())
    }

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
            steps.push(WorkflowRunExecutionStep {
                run_step_id: row.get::<String, _>("run_step_id"),
                step_id: row.get::<String, _>("step_id"),
                position: row.get::<i64, _>("position"),
                step_name: row.get::<String, _>("step_name"),
                instructions,
                agent_id: row.get::<String, _>("agent_id"),
                depends_on,
                max_retries: u8::try_from(row.get::<i64, _>("max_retries")).unwrap_or(0),
                timeout_secs: row
                    .get::<Option<i64>, _>("timeout_secs")
                    .map(|t| t as u64),
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

    pub async fn mark_run_step_running(&self, run_step_id: &str, input: &str) -> Result<()> {


        let now = Utc::now().to_rfc3339();
        sqlx::query(
            "UPDATE workflow_run_steps SET status = ?1, input = ?2, started_at = ?3 WHERE id = ?4",
        )
        .bind(WorkflowRunStepStatus::Running.as_str())
        .bind(input)
        .bind(&now)
        .bind(run_step_id)
        .execute(self.pool.as_ref())
        .await?;
        Ok(())
    }

    pub async fn mark_run_step_succeeded(
        &self,
        run_step_id: &str,
        output: &str,
        conversation_id: &str,
    ) -> Result<()> {


        let now = Utc::now().to_rfc3339();
        sqlx::query(
            r#"
            UPDATE workflow_run_steps
            SET status = ?1, output = ?2, error = NULL, conversation_id = ?3, completed_at = ?4
            WHERE id = ?5
            "#,
        )
        .bind(WorkflowRunStepStatus::Succeeded.as_str())
        .bind(output)
        .bind(conversation_id)
        .bind(&now)
        .bind(run_step_id)
        .execute(self.pool.as_ref())
        .await?;
        Ok(())
    }

    pub async fn mark_run_step_failed(
        &self,
        run_step_id: &str,
        error: &str,
        conversation_id: &str,
    ) -> Result<()> {


        let now = Utc::now().to_rfc3339();
        sqlx::query(
            r#"
            UPDATE workflow_run_steps
            SET status = ?1, error = ?2, conversation_id = ?3, completed_at = ?4
            WHERE id = ?5
            "#,
        )
        .bind(WorkflowRunStepStatus::Failed.as_str())
        .bind(error)
        .bind(conversation_id)
        .bind(&now)
        .bind(run_step_id)
        .execute(self.pool.as_ref())
        .await?;
        Ok(())
    }

    pub async fn mark_run_step_skipped(&self, run_step_id: &str) -> Result<()> {


        let now = Utc::now().to_rfc3339();
        sqlx::query(
            "UPDATE workflow_run_steps SET status = ?1, completed_at = ?2 WHERE id = ?3",
        )
        .bind(WorkflowRunStepStatus::Skipped.as_str())
        .bind(&now)
        .bind(run_step_id)
        .execute(self.pool.as_ref())
        .await?;
        Ok(())
    }

    pub async fn increment_run_step_retry(&self, run_step_id: &str) -> Result<()> {


        sqlx::query(
            "UPDATE workflow_run_steps SET retry_count = retry_count + 1, status = ?1 WHERE id = ?2",
        )
        .bind(WorkflowRunStepStatus::Pending.as_str())
        .bind(run_step_id)
        .execute(self.pool.as_ref())
        .await?;
        Ok(())
    }

}

fn validate_workflow_name(name: &str) -> Result<()> {
    if name.trim().is_empty() {
        return Err(AppError::Validation("workflow name is required".to_owned()));
    }
    Ok(())
}

fn validate_steps(steps: &[crate::workflow_types::WorkflowStepInput]) -> Result<()> {
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

fn map_workflow_list_item(row: sqlx::sqlite::SqliteRow) -> Result<WorkflowListItem> {
    Ok(WorkflowListItem {
        id: row.get::<String, _>("id"),
        name: row.get::<String, _>("name"),
        description: row.get::<String, _>("description"),
        source: parse_source(&row.get::<String, _>("source"))?,
        status: parse_workflow_status(&row.get::<String, _>("status"))?,
        created_by: row.get::<String, _>("created_by"),
        created_at: row.get::<String, _>("created_at"),
        updated_at: row.get::<String, _>("updated_at"),
        step_count: row.get::<i64, _>("step_count"),
    })
}

fn map_workflow_step(row: sqlx::sqlite::SqliteRow) -> Result<WorkflowStep> {
    let depends_on: Option<Vec<String>> = row
        .get::<Option<String>, _>("depends_on")
        .and_then(|json| serde_json::from_str(&json).ok());
    Ok(WorkflowStep {
        id: row.get::<String, _>("id"),
        workflow_id: row.get::<String, _>("workflow_id"),
        position: row.get::<i64, _>("position"),
        name: row.get::<String, _>("name"),
        instructions: row.get::<String, _>("instructions"),
        agent_id: row.get::<String, _>("agent_id"),
        created_at: row.get::<String, _>("created_at"),
        updated_at: row.get::<String, _>("updated_at"),
        depends_on,
        max_retries: u8::try_from(row.get::<i64, _>("max_retries")).unwrap_or(0),
        timeout_secs: row.get::<Option<i64>, _>("timeout_secs").map(|t| t as u64),
        condition: row.get::<Option<String>, _>("condition"),
    })
}

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

fn map_run_step_detail(row: sqlx::sqlite::SqliteRow) -> Result<WorkflowRunStepDetail> {
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

fn parse_source(value: &str) -> Result<WorkflowSource> {
    WorkflowSource::from_db(value)
        .ok_or_else(|| AppError::Validation(format!("invalid workflow source: {value}")))
}

fn parse_workflow_status(value: &str) -> Result<WorkflowStatus> {
    WorkflowStatus::from_db(value)
        .ok_or_else(|| AppError::Validation(format!("invalid workflow status: {value}")))
}

fn parse_run_status(value: &str) -> Result<WorkflowRunStatus> {
    WorkflowRunStatus::from_db(value)
        .ok_or_else(|| AppError::Validation(format!("invalid workflow run status: {value}")))
}

fn parse_run_step_status(value: &str) -> Result<WorkflowRunStepStatus> {
    WorkflowRunStepStatus::from_db(value)
        .ok_or_else(|| AppError::Validation(format!("invalid workflow run step status: {value}")))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workflow_types::{CreateWorkflowInput, WorkflowStatus, WorkflowStepInput};

    async fn create_manager() -> WorkflowManager {
        let pool = SqlitePool::connect(":memory:")
            .await
            .expect("memory sqlite");
        for statement in include_str!("../../common/migrations/004_workflows.sql").split(';') {
            let sql = statement.trim();
            if sql.is_empty() {
                continue;
            }
            sqlx::query(sql)
                .execute(&pool)
                .await
                .expect("run migration statement");
        }
        WorkflowManager::new(Arc::new(pool))
    }

    #[tokio::test]
    async fn creates_and_lists_workflow() {
        let manager = create_manager().await;
        let workflow = manager
            .create_workflow(
                CreateWorkflowInput {
                    name: "Daily Triage".to_owned(),
                    description: "Triage incoming tasks".to_owned(),
                    status: WorkflowStatus::Active,
                    steps: vec![WorkflowStepInput {
                        name: "Classify".to_owned(),
                        instructions: "Classify input".to_owned(),
                        agent_id: "general-assistant".to_owned(),
                        ..Default::default()
                    }],
                },
                WorkflowSource::Manual,
                "user",
            )
            .await
            .expect("create workflow");

        assert_eq!(workflow.name, "Daily Triage");
        assert_eq!(workflow.steps.len(), 1);

        let items = manager.list_workflows().await.expect("list workflows");
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].step_count, 1);
    }

    #[tokio::test]
    async fn rejects_run_when_workflow_is_draft() {
        let manager = create_manager().await;
        let workflow = manager
            .create_workflow(
                CreateWorkflowInput {
                    name: "Draft Pipeline".to_owned(),
                    description: "Draft".to_owned(),
                    status: WorkflowStatus::Draft,
                    steps: vec![WorkflowStepInput {
                        name: "Step".to_owned(),
                        instructions: "Do work".to_owned(),
                        agent_id: "general-assistant".to_owned(),
                        ..Default::default()
                    }],
                },
                WorkflowSource::Manual,
                "user",
            )
            .await
            .expect("create draft workflow");

        let err = manager
            .create_run(&workflow.id, "user", "")
            .await
            .expect_err("run must fail for draft");
        assert!(err.to_string().contains("draft"));
    }

    #[tokio::test]
    async fn rejects_concurrent_active_runs_for_same_workflow() {
        let manager = create_manager().await;
        let workflow = manager
            .create_workflow(
                CreateWorkflowInput {
                    name: "Concurrent".to_owned(),
                    description: String::new(),
                    status: WorkflowStatus::Active,
                    steps: vec![WorkflowStepInput {
                        name: "Step 1".to_owned(),
                        instructions: "Do task".to_owned(),
                        agent_id: "general-assistant".to_owned(),
                        ..Default::default()
                    }],
                },
                WorkflowSource::Manual,
                "user",
            )
            .await
            .expect("create workflow");

        let first = manager
            .create_run(&workflow.id, "user", "input")
            .await
            .expect("start first run");
        assert_eq!(first.status, WorkflowRunStatus::Queued);

        let err = manager
            .create_run(&workflow.id, "user", "input")
            .await
            .expect_err("second concurrent run should fail");
        assert!(err.to_string().contains("active run"));
    }

    #[tokio::test]
    async fn delete_workflow_cascades_steps_and_runs() {
        let manager = create_manager().await;
        let workflow = manager
            .create_workflow(
                CreateWorkflowInput {
                    name: "Delete Cascade".to_owned(),
                    description: String::new(),
                    status: WorkflowStatus::Active,
                    steps: vec![WorkflowStepInput {
                        name: "Step 1".to_owned(),
                        instructions: "Do task".to_owned(),
                        agent_id: "general-assistant".to_owned(),
                        ..Default::default()
                    }],
                },
                WorkflowSource::Manual,
                "user",
            )
            .await
            .expect("create workflow");

        let run = manager
            .create_run(&workflow.id, "user", "")
            .await
            .expect("create run");

        manager
            .delete_workflow(&workflow.id)
            .await
            .expect("delete workflow");

        let missing_workflow = manager
            .get_workflow(&workflow.id)
            .await
            .expect_err("workflow should be deleted");
        assert!(missing_workflow.to_string().contains("not found"));

        let missing_run = manager
            .get_run_detail(&run.run_id)
            .await
            .expect_err("run should be deleted via cascade");
        assert!(missing_run.to_string().contains("not found"));
    }
}
