use std::sync::Arc;

use chrono::Utc;
use uuid::Uuid;

use rushdino_common::{models::Message, models::Role, AppError, Result};
use rushdino_providers::Provider;

use crate::{
    agent_manager::AgentManager,
    conversation::ConversationManager,
    engine::AgentConfig,
    memory::MemoryManager,
    react_loop::run_react_loop,
    tool_registry::ToolRegistry,
    tools::shell_exec::{with_tool_execution_context, ToolExecutionContext},
    workflow_manager::WorkflowManager,
};

#[derive(Clone)]
pub struct WorkflowRunner {
    provider: Arc<Provider>,
    tool_registry: Arc<ToolRegistry>,
    conversation: Arc<ConversationManager>,
    memory: Arc<MemoryManager>,
    agent_manager: Arc<AgentManager>,
    manager: Arc<WorkflowManager>,
    config: AgentConfig,
}

impl WorkflowRunner {
    pub fn new(
        provider: Arc<Provider>,
        tool_registry: Arc<ToolRegistry>,
        conversation: Arc<ConversationManager>,
        memory: Arc<MemoryManager>,
        agent_manager: Arc<AgentManager>,
        manager: Arc<WorkflowManager>,
        config: AgentConfig,
    ) -> Self {
        Self {
            provider,
            tool_registry,
            conversation,
            memory,
            agent_manager,
            manager,
            config,
        }
    }

    pub fn spawn_run(&self, run_id: String) {
        let this = self.clone();
        tokio::spawn(async move {
            if let Err(err) = this.execute_run(&run_id).await {
                tracing::error!(run_id = %run_id, error = %err, "workflow run execution failed");
                let _ = this
                    .manager
                    .mark_run_failed(&run_id, &format!("workflow execution error: {err}"))
                    .await;
            }
        });
    }

    async fn execute_run(&self, run_id: &str) -> Result<()> {
        let context = self.manager.load_execution_context(run_id).await?;
        self.manager.mark_run_running(run_id).await?;

        let mut previous_outputs: Vec<(String, String)> = Vec::new();

        for step in context.steps {
            let step_input = build_step_input(&context.run_input, &previous_outputs, &step.step_name, &step.instructions);
            self.manager
                .mark_run_step_running(&step.run_step_id, &step_input)
                .await?;

            let conversation_id = format!(
                "workflow:{}:run:{}:step:{}",
                context.workflow_id, context.run_id, step.position
            );

            let result = self
                .execute_step(
                    &step.agent_id,
                    &step_input,
                    &conversation_id,
                    step.position,
                    &step.step_name,
                )
                .await;

            match result {
                Ok(output) => {
                    self.manager
                        .mark_run_step_succeeded(&step.run_step_id, &output, &conversation_id)
                        .await?;
                    previous_outputs.push((step.step_name, output));
                }
                Err(err) => {
                    let error_text = err.to_string();
                    self.manager
                        .mark_run_step_failed(&step.run_step_id, &error_text, &conversation_id)
                        .await?;
                    self.manager
                        .mark_run_failed(
                            run_id,
                            &format!("step {} failed: {}", step.position, error_text),
                        )
                        .await?;
                    return Ok(());
                }
            }
        }

        self.manager.mark_run_succeeded(run_id).await
    }

    async fn execute_step(
        &self,
        agent_id: &str,
        step_input: &str,
        conversation_id: &str,
        position: i64,
        step_name: &str,
    ) -> Result<String> {
        let template = self
            .agent_manager
            .get(agent_id)
            .ok_or_else(|| AppError::Validation(format!("unknown agent id: {agent_id}")))?;

        let memory_context = self.memory.load_context().unwrap_or_default();
        let system_content = if memory_context.trim().is_empty() {
            template.system_prompt
        } else {
            format!("{}\n\n{}", template.system_prompt, memory_context)
        };

        let messages = vec![
            Message {
                id: Uuid::new_v4().to_string(),
                role: Role::System,
                content: system_content,
                tool_calls: None,
                created_at: Utc::now(),
            },
            Message {
                id: Uuid::new_v4().to_string(),
                role: Role::User,
                content: step_input.to_owned(),
                tool_calls: None,
                created_at: Utc::now(),
            },
        ];

        let tool_context = ToolExecutionContext {
            session_id: None,
            conversation_id: Some(conversation_id.to_owned()),
            delegation_depth: 0,
        };

        let (response, all_messages) = with_tool_execution_context(
            tool_context,
            run_react_loop(
                self.provider.clone(),
                self.tool_registry.clone(),
                messages,
                &self.config,
            ),
        )
        .await?;

        let title = format!("workflow step {}: {}", position, step_name);
        self.conversation
            .create_conversation_with_id(conversation_id, &title)
            .await?;

        for message in &all_messages {
            self.conversation.save_message(conversation_id, message).await?;
        }

        Ok(response.content)
    }
}

fn build_step_input(
    run_input: &str,
    previous_outputs: &[(String, String)],
    step_name: &str,
    instructions: &str,
) -> String {
    let mut lines = vec![
        format!("Workflow run input:\n{}", if run_input.is_empty() { "(none)" } else { run_input }),
        "".to_owned(),
        format!("Current step: {step_name}"),
        format!("Step instructions:\n{instructions}"),
    ];

    if previous_outputs.is_empty() {
        lines.push("".to_owned());
        lines.push("Previous step outputs: (none)".to_owned());
    } else {
        lines.push("".to_owned());
        lines.push("Previous step outputs:".to_owned());
        for (index, (name, output)) in previous_outputs.iter().enumerate() {
            lines.push(format!("{}. {}\n{}", index + 1, name, output));
        }
    }

    lines.join("\n")
}
