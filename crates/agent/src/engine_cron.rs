use chrono::Utc;
use rushdino_common::Result;

use crate::cron_manager::{
    CompleteRunParams, CreateCronJobInput, CronJobRecord, CronRunRecord, CronRunStatus,
    CronTargetInput, UpdateCronJobInput,
};

impl crate::engine::AgentEngine {
    pub async fn list_cron_jobs(&self) -> Result<Vec<CronJobRecord>> {
        self.cron_manager.list_jobs().await
    }

    pub async fn get_cron_job(&self, id: &str) -> Result<CronJobRecord> {
        self.cron_manager.get_job(id).await
    }

    pub async fn create_cron_job(&self, input: CreateCronJobInput) -> Result<CronJobRecord> {
        if let CronTargetInput::WorkflowRun { workflow_id, .. } = &input.target {
            let _ = self.get_workflow(workflow_id).await?;
        }
        self.cron_manager.create_job(input).await
    }

    pub async fn update_cron_job(
        &self,
        id: &str,
        input: UpdateCronJobInput,
    ) -> Result<CronJobRecord> {
        if let Some(CronTargetInput::WorkflowRun { workflow_id, .. }) = input.target.as_ref() {
            let _ = self.get_workflow(workflow_id).await?;
        }
        self.cron_manager.update_job(id, input).await
    }

    pub async fn pause_cron_job(&self, id: &str) -> Result<CronJobRecord> {
        self.cron_manager.pause_job(id).await
    }

    pub async fn resume_cron_job(&self, id: &str) -> Result<CronJobRecord> {
        self.cron_manager.resume_job(id).await
    }

    pub async fn delete_cron_job(&self, id: &str) -> Result<()> {
        self.cron_manager.delete_job(id).await
    }

    pub async fn list_cron_runs(&self, id: &str, limit: i64) -> Result<Vec<CronRunRecord>> {
        self.cron_manager.list_runs(id, limit).await
    }

    pub async fn claim_due_cron_jobs(&self, limit: i64) -> Result<Vec<CronJobRecord>> {
        self.cron_manager.claim_due_jobs(limit, Utc::now()).await
    }

    pub async fn run_cron_job(
        &self,
        job_id: &str,
        trigger_kind: &str,
    ) -> Result<(CronJobRecord, Option<String>, Option<String>)> {
        let job = self.cron_manager.get_job(job_id).await?;
        let run_id = self
            .cron_manager
            .begin_run(job_id, trigger_kind, Utc::now())
            .await?;
        let result: Result<(CronJobRecord, Option<String>, Option<String>)> = match &job.target {
            CronTargetInput::WorkflowRun {
                workflow_id,
                input,
                triggered_by,
            } => {
                let workflow_run = self
                    .start_workflow_run(
                        workflow_id,
                        triggered_by.as_deref().unwrap_or("cron"),
                        input.as_deref().unwrap_or(""),
                    )
                    .await?;
                let updated = self
                    .cron_manager
                    .complete_run(CompleteRunParams {
                        job_id,
                        run_id: &run_id,
                        status: CronRunStatus::Ok,
                        summary: Some("workflow run started"),
                        error: None,
                        session_id: None,
                        workflow_run_id: Some(&workflow_run.run_id),
                        now: Utc::now(),
                    })
                    .await?;
                Ok((updated, None, Some(workflow_run.run_id)))
            }
            CronTargetInput::AgentTurn {
                message,
                conversation_id,
                title,
                ..
            } => {
                let conversation = if let Some(existing_id) = conversation_id.clone() {
                    existing_id
                } else {
                    self.create_session(title.as_deref().unwrap_or("Scheduled task"))
                        .await?
                        .id
                };
                let _ = self.chat(&conversation, message).await?;
                let updated = self
                    .cron_manager
                    .complete_run(CompleteRunParams {
                        job_id,
                        run_id: &run_id,
                        status: CronRunStatus::Ok,
                        summary: Some("agent turn completed"),
                        error: None,
                        session_id: Some(&conversation),
                        workflow_run_id: None,
                        now: Utc::now(),
                    })
                    .await?;
                Ok((updated, Some(conversation), None))
            }
        };

        if let Err(err) = &result {
            let _ = self
                .cron_manager
                .complete_run(CompleteRunParams {
                    job_id,
                    run_id: &run_id,
                    status: CronRunStatus::Error,
                    summary: None,
                    error: Some(&err.to_string()),
                    session_id: None,
                    workflow_run_id: None,
                    now: Utc::now(),
                })
                .await;
        }

        result
    }
}
