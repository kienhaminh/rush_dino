//! Workflow run step state transitions: mark_run_step_* operations.

use chrono::Utc;

use rushdino_common::Result;

use crate::workflow_types::WorkflowRunStepStatus;

use super::WorkflowManager;

impl WorkflowManager {
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
        sqlx::query("UPDATE workflow_run_steps SET status = ?1, completed_at = ?2 WHERE id = ?3")
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
