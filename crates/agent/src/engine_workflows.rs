use rushdino_common::Result;

use crate::{
    agent_progress::{build_lanes_from_conversation_store, AgentProgressLane},
    workflow_types::{
        CreateWorkflowInput, UpdateWorkflowInput, WorkflowDetail, WorkflowListItem,
        WorkflowRunDetail, WorkflowRunListItem, WorkflowRunStartResponse, WorkflowSource,
        WorkflowStatus, WorkflowStepInput,
    },
};

impl crate::engine::AgentEngine {
    pub async fn list_workflows(&self) -> Result<Vec<WorkflowListItem>> {
        self.workflow_manager.list_workflows().await
    }

    pub async fn get_workflow(&self, id: &str) -> Result<WorkflowDetail> {
        self.workflow_manager.get_workflow(id).await
    }

    pub async fn create_workflow(
        &self,
        payload: CreateWorkflowInput,
        source: WorkflowSource,
        created_by: &str,
    ) -> Result<WorkflowDetail> {
        self.validate_workflow_agents(&payload.steps)?;
        self.workflow_manager
            .create_workflow(payload, source, created_by)
            .await
    }

    pub async fn update_workflow(
        &self,
        id: &str,
        payload: UpdateWorkflowInput,
    ) -> Result<WorkflowDetail> {
        if let Some(steps) = payload.steps.as_ref() {
            self.validate_workflow_agents(steps)?;
        }
        self.workflow_manager.update_workflow(id, payload).await
    }

    pub async fn delete_workflow(&self, id: &str) -> Result<()> {
        self.workflow_manager.delete_workflow(id).await
    }

    /// Seeds bundled workflow templates as real workflows on first startup.
    /// Skips seeding if any workflows already exist in the database.
    pub async fn seed_initial_workflows(&self) {
        match self.workflow_manager.list_workflows().await {
            Ok(existing) if !existing.is_empty() => return,
            Err(err) => {
                tracing::warn!("seed_initial_workflows: failed to list workflows: {err}");
                return;
            }
            _ => {}
        }

        for template in rushdino_common::workflow_templates::get_bundled_templates() {
            let steps: Vec<WorkflowStepInput> = template
                .steps
                .into_iter()
                .map(|step| WorkflowStepInput {
                    name: step.name,
                    agent_id: step.agent_id,
                    instructions: step.instructions,
                    ..Default::default()
                })
                .collect();

            let input = CreateWorkflowInput {
                name: template.name.clone(),
                description: template.description,
                status: WorkflowStatus::Draft,
                steps,
            };

            match self.validate_workflow_agents(&input.steps) {
                Ok(()) => {}
                Err(err) => {
                    tracing::warn!(
                        "seed_initial_workflows: skipping '{}': {err}",
                        template.name
                    );
                    continue;
                }
            }

            if let Err(err) = self
                .workflow_manager
                .create_workflow(input, WorkflowSource::Manual, "system")
                .await
            {
                tracing::warn!(
                    "seed_initial_workflows: failed to create '{}': {err}",
                    template.name
                );
            }
        }
    }

    pub async fn start_workflow_run(
        &self,
        workflow_id: &str,
        triggered_by: &str,
        run_input: &str,
    ) -> Result<WorkflowRunStartResponse> {
        let workflow = self.workflow_manager.get_workflow(workflow_id).await?;
        let run = self
            .workflow_manager
            .create_run(workflow_id, triggered_by, run_input)
            .await?;
        self.runtime
            .register_workflow_run(
                &run.run_id,
                workflow_id,
                &workflow.name,
                Some(run_input),
                &self.provider_name,
                self.provider.model(),
            )
            .await?;
        self.workflow_runner.spawn_run(run.run_id.clone());
        Ok(run)
    }

    pub async fn list_workflow_runs(
        &self,
        workflow_id: &str,
        limit: i64,
    ) -> Result<Vec<WorkflowRunListItem>> {
        self.workflow_manager.list_runs(workflow_id, limit).await
    }

    pub async fn get_workflow_run(&self, run_id: &str) -> Result<WorkflowRunDetail> {
        self.workflow_manager.get_run_detail(run_id).await
    }

    pub async fn build_agent_progress_lanes(
        &self,
        lookback_minutes: u32,
        per_column: usize,
        active_window_seconds: u32,
    ) -> Result<Vec<AgentProgressLane>> {
        let templates = self.agent_manager.list();
        build_lanes_from_conversation_store(
            self.conversation.as_ref(),
            templates,
            lookback_minutes,
            per_column,
            active_window_seconds,
            chrono::Utc::now(),
        )
        .await
    }

    fn validate_workflow_agents(&self, steps: &[WorkflowStepInput]) -> Result<()> {
        for (index, step) in steps.iter().enumerate() {
            if self.agent_manager.get(&step.agent_id).is_none() {
                return Err(rushdino_common::AppError::Validation(format!(
                    "step {} references unknown agent '{}'",
                    index + 1,
                    step.agent_id
                )));
            }
        }
        Ok(())
    }
}
