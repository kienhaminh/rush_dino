//! Workflow CRUD operations: list, get, create, update, delete.
//! Also contains row-mapping and validation helpers specific to workflows.

use chrono::Utc;
use sqlx::Row;
use uuid::Uuid;

use rushdino_common::{AppError, Result};

use crate::workflow_types::{
    CreateWorkflowInput, StepType, UpdateWorkflowInput, WorkflowDetail, WorkflowListItem,
    WorkflowSource, WorkflowStep,
};

use super::{
    parse_source, parse_workflow_status, validate_steps, validate_workflow_name, WorkflowManager,
};

impl WorkflowManager {
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
            SELECT id, workflow_id, position, name, instructions, agent_id, step_type,
                   created_at, updated_at, depends_on, max_retries, timeout_secs, condition
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
                  (id, workflow_id, position, name, instructions, agent_id, step_type,
                   created_at, updated_at, depends_on, max_retries, timeout_secs, condition)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
                "#,
            )
            .bind(Uuid::new_v4().to_string())
            .bind(&id)
            .bind((index + 1) as i64)
            .bind(step.name.trim())
            .bind(step.instructions.trim())
            .bind(step.agent_id.trim())
            .bind(step.step_type.as_str())
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

        sqlx::query(
            "UPDATE workflows SET name = ?1, description = ?2, status = ?3, updated_at = ?4 WHERE id = ?5",
        )
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
                      (id, workflow_id, position, name, instructions, agent_id, step_type,
                       created_at, updated_at, depends_on, max_retries, timeout_secs, condition)
                    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
                    "#,
                )
                .bind(Uuid::new_v4().to_string())
                .bind(id)
                .bind((index + 1) as i64)
                .bind(step.name.trim())
                .bind(step.instructions.trim())
                .bind(step.agent_id.trim())
                .bind(step.step_type.as_str())
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
}

// ---------------------------------------------------------------------------
// Row-mapping helpers local to workflow CRUD
// ---------------------------------------------------------------------------

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
    let step_type = StepType::from_str_loose(&row.get::<String, _>("step_type"));
    Ok(WorkflowStep {
        id: row.get::<String, _>("id"),
        workflow_id: row.get::<String, _>("workflow_id"),
        position: row.get::<i64, _>("position"),
        name: row.get::<String, _>("name"),
        instructions: row.get::<String, _>("instructions"),
        agent_id: row.get::<String, _>("agent_id"),
        step_type,
        created_at: row.get::<String, _>("created_at"),
        updated_at: row.get::<String, _>("updated_at"),
        depends_on,
        max_retries: u8::try_from(row.get::<i64, _>("max_retries")).unwrap_or(0),
        timeout_secs: row.get::<Option<i64>, _>("timeout_secs").map(|t| t as u64),
        condition: row.get::<Option<String>, _>("condition"),
    })
}
