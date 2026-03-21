use std::sync::{Arc, Weak};

use async_trait::async_trait;
use chrono::Utc;
use serde_json::{json, Value};
use uuid::Uuid;

use rushdino_common::{models::Message, models::Role, AppError, Result};
use rushdino_providers::Provider;

use crate::{
    agent_manager::AgentManager,
    conversation::ConversationManager,
    cron_manager::{
        CreateCronJobInput, CronManager, CronRunStatus, CronTargetInput, UpdateCronJobInput,
    },
    engine::AgentConfig,
    engine_bootstrap::system_message,
    memory::MemoryManager,
    react_loop::run_react_loop,
    runtime::AgentRuntime,
    skill_manager::SkillManager,
    tool_registry::{SessionToolContext, Tool, ToolRegistry},
    tools::shell_exec::{
        current_tool_execution_context, with_tool_execution_context, ToolExecutionContext,
    },
    workflow_manager::WorkflowManager,
    workflow_runner::WorkflowRunner,
};

#[allow(clippy::too_many_arguments)]
async fn run_agent_turn(
    conversation: Arc<ConversationManager>,
    provider: Arc<Provider>,
    registry: Weak<ToolRegistry>,
    session_ctx: Weak<SessionToolContext>,
    memory: Arc<MemoryManager>,
    skill_manager: Arc<SkillManager>,
    agent_manager: Arc<AgentManager>,
    config: AgentConfig,
    conversation_id: &str,
    input: &str,
) -> Result<String> {
    let registry = registry
        .upgrade()
        .ok_or_else(|| AppError::Agent("tool registry unavailable".to_owned()))?;
    let session_ctx = session_ctx
        .upgrade()
        .ok_or_else(|| AppError::Agent("session context unavailable".to_owned()))?;
    let mut messages = conversation
        .get_messages(conversation_id)
        .await
        .unwrap_or_default();
    if messages.is_empty() {
        let _ = conversation
            .create_conversation_with_id(conversation_id, input)
            .await?;
    }
    messages.insert(
        0,
        system_message(
            &config,
            memory.as_ref(),
            agent_manager.as_ref(),
            skill_manager.as_ref(),
            session_ctx.as_ref(),
        ),
    );
    let old_len = messages.len();
    let user_message = Message {
        id: Uuid::new_v4().to_string(),
        role: Role::User,
        content: input.to_owned(),
        tool_calls: None,
        rich_content: None,
        created_at: Utc::now(),
    };
    conversation
        .save_message(conversation_id, &user_message)
        .await?;
    messages.push(user_message);
    let parent_ctx = current_tool_execution_context().unwrap_or(ToolExecutionContext {
        session_id: None,
        conversation_id: None,
        run_id: None,
        delegation_depth: 0,
    });
    let tool_ctx = ToolExecutionContext {
        conversation_id: Some(conversation_id.to_owned()),
        delegation_depth: parent_ctx.delegation_depth.saturating_add(1),
        ..parent_ctx
    };
    let (response, all_messages) = with_tool_execution_context(
        tool_ctx,
        run_react_loop(provider, registry, session_ctx, messages, &config, None),
    )
    .await?;
    for message in all_messages.iter().skip(old_len + 1) {
        conversation.save_message(conversation_id, message).await?;
    }
    Ok(response.content)
}

macro_rules! json_tool {
    // 5-argument form: name, description, schema, keywords, body
    ($name:expr, $desc:expr, $schema:expr, $kw:expr, $body:expr) => {{
        struct ToolImpl<F>(F, Value);
        #[async_trait]
        impl<F, Fut> Tool for ToolImpl<F>
        where
            F: Send + Sync + Fn(Value) -> Fut,
            Fut: std::future::Future<Output = Result<String>> + Send,
        {
            fn name(&self) -> &str { $name }
            fn description(&self) -> &str { $desc }
            fn parameters(&self) -> Value { self.1.clone() }
            fn keywords(&self) -> Vec<&str> { $kw.to_vec() }
            async fn execute(&self, args: Value) -> Result<String> { (self.0)(args).await }
        }
        ToolImpl($body, $schema)
    }};
    // 4-argument form: name, description, schema, body (no keywords)
    ($name:expr, $desc:expr, $schema:expr, $body:expr) => {{
        struct ToolImpl<F>(F, Value);
        #[async_trait]
        impl<F, Fut> Tool for ToolImpl<F>
        where
            F: Send + Sync + Fn(Value) -> Fut,
            Fut: std::future::Future<Output = Result<String>> + Send,
        {
            fn name(&self) -> &str { $name }
            fn description(&self) -> &str { $desc }
            fn parameters(&self) -> Value { self.1.clone() }
            async fn execute(&self, args: Value) -> Result<String> { (self.0)(args).await }
        }
        ToolImpl($body, $schema)
    }};
    // Convenience form for tools with no parameters.
    ($name:expr, $desc:expr, $body:expr) => {
        json_tool!($name, $desc, json!({"type": "object", "properties": {}}), $body)
    };
}

const CRON_KEYWORDS: &[&str] = &["cron", "schedule", "recurring", "job", "timer"];

pub fn cron_list_tool(manager: Arc<CronManager>) -> impl Tool {
    json_tool!(
        "cron_list",
        "List configured cron jobs.",
        json!({"type": "object", "properties": {}}),
        CRON_KEYWORDS,
        move |_args| {
            let manager = manager.clone();
            async move {
                serde_json::to_string_pretty(&json!({ "items": manager.list_jobs().await? }))
                    .map_err(|e| AppError::Agent(e.to_string()))
            }
        }
    )
}

pub fn cron_get_tool(manager: Arc<CronManager>) -> impl Tool {
    json_tool!(
        "cron_get",
        "Get a cron job and its recent runs by ID.",
        json!({"type": "object", "properties": {"jobId": {"type": "string", "description": "Cron job ID"}}, "required": ["jobId"]}),
        CRON_KEYWORDS,
        move |args: Value| {
            let manager = manager.clone();
            async move {
                let job_id = args
                    .get("jobId")
                    .and_then(Value::as_str)
                    .ok_or_else(|| AppError::Validation("jobId is required".to_owned()))?;
                serde_json::to_string_pretty(&json!({
                    "job": manager.get_job(job_id).await?,
                    "runs": manager.list_runs(job_id, 20).await?,
                }))
                .map_err(|e| AppError::Agent(e.to_string()))
            }
        }
    )
}

pub fn cron_create_tool(manager: Arc<CronManager>) -> impl Tool {
    json_tool!(
        "cron_create",
        "Create a cron job for an agent turn or workflow run.",
        json!({
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "schedule": {"type": "string", "description": "Cron expression, e.g. '0 9 * * 1'"},
                "enabled": {"type": "boolean"},
                "target": {
                    "type": "object",
                    "description": "Either {type:'agentTurn', message, conversationId?, title?} or {type:'workflowRun', workflowId, input?, triggeredBy?}"
                }
            },
            "required": ["name", "schedule", "target"]
        }),
        CRON_KEYWORDS,
        move |args| {
            let manager = manager.clone();
            async move {
                let payload: CreateCronJobInput = serde_json::from_value(args)
                    .map_err(|e| AppError::Validation(e.to_string()))?;
                serde_json::to_string_pretty(&manager.create_job(payload).await?)
                    .map_err(|e| AppError::Agent(e.to_string()))
            }
        }
    )
}

pub fn cron_update_tool(manager: Arc<CronManager>) -> impl Tool {
    json_tool!(
        "cron_update",
        "Update an existing cron job.",
        json!({"type": "object", "properties": {"jobId": {"type": "string"}, "name": {"type": "string"}, "schedule": {"type": "string"}, "enabled": {"type": "boolean"}}, "required": ["jobId"]}),
        CRON_KEYWORDS,
        move |args: Value| {
            let manager = manager.clone();
            async move {
                let job_id = args
                    .get("jobId")
                    .and_then(Value::as_str)
                    .ok_or_else(|| AppError::Validation("jobId is required".to_owned()))?
                    .to_owned();
                let payload: UpdateCronJobInput = serde_json::from_value(args)
                    .map_err(|e| AppError::Validation(e.to_string()))?;
                serde_json::to_string_pretty(&manager.update_job(&job_id, payload).await?)
                    .map_err(|e| AppError::Agent(e.to_string()))
            }
        }
    )
}

pub fn cron_pause_tool(manager: Arc<CronManager>) -> impl Tool {
    json_tool!(
        "cron_pause",
        "Pause a cron job.",
        json!({"type": "object", "properties": {"jobId": {"type": "string"}}, "required": ["jobId"]}),
        CRON_KEYWORDS,
        move |args: Value| {
            let manager = manager.clone();
            async move {
                let job_id = args
                    .get("jobId")
                    .and_then(Value::as_str)
                    .ok_or_else(|| AppError::Validation("jobId is required".to_owned()))?;
                serde_json::to_string_pretty(&manager.pause_job(job_id).await?)
                    .map_err(|e| AppError::Agent(e.to_string()))
            }
        }
    )
}

pub fn cron_resume_tool(manager: Arc<CronManager>) -> impl Tool {
    json_tool!(
        "cron_resume",
        "Resume a paused cron job.",
        json!({"type": "object", "properties": {"jobId": {"type": "string"}}, "required": ["jobId"]}),
        CRON_KEYWORDS,
        move |args: Value| {
            let manager = manager.clone();
            async move {
                let job_id = args
                    .get("jobId")
                    .and_then(Value::as_str)
                    .ok_or_else(|| AppError::Validation("jobId is required".to_owned()))?;
                serde_json::to_string_pretty(&manager.resume_job(job_id).await?)
                    .map_err(|e| AppError::Agent(e.to_string()))
            }
        }
    )
}

#[allow(clippy::too_many_arguments)]
pub fn cron_run_now_tool(
    manager: Arc<CronManager>,
    conversation: Arc<ConversationManager>,
    provider: Arc<Provider>,
    registry: Weak<ToolRegistry>,
    session_ctx: Weak<SessionToolContext>,
    memory: Arc<MemoryManager>,
    skill_manager: Arc<SkillManager>,
    agent_manager: Arc<AgentManager>,
    config: AgentConfig,
    workflow_manager: Arc<WorkflowManager>,
    workflow_runner: Arc<WorkflowRunner>,
    runtime: Arc<AgentRuntime>,
    provider_name: String,
) -> impl Tool {
    json_tool!(
        "cron_run_now",
        "Run a cron job immediately.",
        json!({"type": "object", "properties": {"jobId": {"type": "string"}}, "required": ["jobId"]}),
        CRON_KEYWORDS,
        move |args: Value| {
            let manager = manager.clone();
            let conversation = conversation.clone();
            let provider = provider.clone();
            let registry = registry.clone();
            let session_ctx = session_ctx.clone();
            let memory = memory.clone();
            let skill_manager = skill_manager.clone();
            let agent_manager = agent_manager.clone();
            let config = config.clone();
            let workflow_manager = workflow_manager.clone();
            let workflow_runner = workflow_runner.clone();
            let runtime = runtime.clone();
            let provider_name = provider_name.clone();
            async move {
                let job_id = args
                    .get("jobId")
                    .and_then(Value::as_str)
                    .ok_or_else(|| AppError::Validation("jobId is required".to_owned()))?;
                let job = manager.get_job(job_id).await?;
                let run_id = manager.begin_run(job_id, "manual", Utc::now()).await?;
                let output = match &job.target {
                    CronTargetInput::WorkflowRun {
                        workflow_id,
                        input,
                        triggered_by,
                    } => {
                        let workflow = workflow_manager.get_workflow(workflow_id).await?;
                        let run = workflow_manager
                            .create_run(
                                workflow_id,
                                triggered_by.as_deref().unwrap_or("cron"),
                                input.as_deref().unwrap_or(""),
                            )
                            .await?;
                        runtime
                            .register_workflow_run(
                                &run.run_id,
                                workflow_id,
                                &workflow.name,
                                input.as_deref(),
                                &provider_name,
                                provider.model(),
                            )
                            .await?;
                        workflow_runner.spawn_run(run.run_id.clone());
                        manager
                            .complete_run(
                                job_id,
                                &run_id,
                                CronRunStatus::Ok,
                                Some("workflow run started"),
                                None,
                                None,
                                Some(&run.run_id),
                                Utc::now(),
                            )
                            .await?;
                        json!({"workflowRunId": run.run_id})
                    }
                    CronTargetInput::AgentTurn {
                        message,
                        conversation_id,
                        title,
                        ..
                    } => {
                        let session_id = if let Some(existing_id) = conversation_id.clone() {
                            existing_id
                        } else {
                            conversation
                                .create_conversation(title.as_deref().unwrap_or("Scheduled task"))
                                .await?
                                .id
                        };
                        let reply = run_agent_turn(
                            conversation.clone(),
                            provider.clone(),
                            registry.clone(),
                            session_ctx.clone(),
                            memory.clone(),
                            skill_manager.clone(),
                            agent_manager.clone(),
                            config.clone(),
                            &session_id,
                            message,
                        )
                        .await?;
                        manager
                            .complete_run(
                                job_id,
                                &run_id,
                                CronRunStatus::Ok,
                                Some("agent turn completed"),
                                None,
                                Some(&session_id),
                                None,
                                Utc::now(),
                            )
                            .await?;
                        json!({"sessionId": session_id, "reply": reply})
                    }
                };
                serde_json::to_string_pretty(&output).map_err(|e| AppError::Agent(e.to_string()))
            }
        }
    )
}

pub fn cron_delete_tool(manager: Arc<CronManager>) -> impl Tool {
    json_tool!(
        "cron_delete",
        "Delete a cron job.",
        json!({"type": "object", "properties": {"jobId": {"type": "string"}}, "required": ["jobId"]}),
        CRON_KEYWORDS,
        move |args: Value| {
            let manager = manager.clone();
            async move {
                let job_id = args
                    .get("jobId")
                    .and_then(Value::as_str)
                    .ok_or_else(|| AppError::Validation("jobId is required".to_owned()))?;
                manager.delete_job(job_id).await?;
                Ok(format!("cron job deleted: {job_id}"))
            }
        }
    )
}
