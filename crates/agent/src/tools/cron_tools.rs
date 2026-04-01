use std::sync::{Arc, Weak};

use async_trait::async_trait;
use chrono::Utc;
use serde_json::{json, Value};
use uuid::Uuid;

use rushdino_common::{models::Message, models::Role, AppError, Result};
use rushdino_providers::Provider;

use crate::{
    conversation::ConversationManager,
    cron_manager::{
        CompleteRunParams, CreateCronJobInput, CronManager, CronRunStatus, CronTargetInput,
        UpdateCronJobInput,
    },
    engine::AgentConfig,
    engine_bootstrap::system_message,
    memory::MemoryManager,
    react_loop::run_react_loop,
    runtime::AgentRuntime,
    skill_manager::SkillManager,
    system_prompt::SkillEntry,
    tool_registry::{SessionToolContext, Tool, ToolRegistry},
    tools::bash::{
        current_tool_execution_context, with_tool_execution_context, ToolExecutionContext,
    },
    workflow_manager::WorkflowManager,
    workflow_runner::WorkflowRunner,
};

/// Shared context for running an agent turn (cron or manual).
#[derive(Clone)]
pub struct AgentTurnCtx {
    pub conversation: Arc<ConversationManager>,
    pub provider: Arc<Provider>,
    pub registry: Weak<ToolRegistry>,
    pub session_ctx: Weak<SessionToolContext>,
    pub memory: Arc<MemoryManager>,
    pub skill_manager: Arc<SkillManager>,
    pub config: AgentConfig,
}

async fn run_agent_turn(ctx: AgentTurnCtx, conversation_id: &str, input: &str) -> Result<String> {
    let registry = ctx
        .registry
        .upgrade()
        .ok_or_else(|| AppError::Agent("tool registry unavailable".to_owned()))?;
    let session_ctx = ctx
        .session_ctx
        .upgrade()
        .ok_or_else(|| AppError::Agent("session context unavailable".to_owned()))?;
    let mut messages = ctx
        .conversation
        .get_messages(conversation_id)
        .await
        .unwrap_or_default();
    if messages.is_empty() {
        let _ = ctx
            .conversation
            .create_conversation_with_id(conversation_id, input)
            .await?;
    }
    let skills = ctx
        .skill_manager
        .list()
        .unwrap_or_default()
        .into_iter()
        .map(|s| SkillEntry {
            name: s.name,
            description: s.description,
        })
        .collect();
    messages.insert(
        0,
        system_message(
            &ctx.config,
            ctx.memory.as_ref(),
            skills,
            session_ctx.as_ref(),
            &[],
        ),
    );
    let old_len = messages.len();
    let user_message = Message::new(Uuid::new_v4().to_string(), Role::User, input.to_owned());
    ctx.conversation
        .save_message(conversation_id, &user_message)
        .await?;
    messages.push(user_message);
    let parent_ctx = current_tool_execution_context().unwrap_or(ToolExecutionContext {
        session_id: None,
        conversation_id: None,
        run_id: None,
        delegation_depth: 0,
        workspace_override: None,
        parent_context: None,
    });
    let tool_ctx = ToolExecutionContext {
        conversation_id: Some(conversation_id.to_owned()),
        delegation_depth: parent_ctx.delegation_depth.saturating_add(1),
        ..parent_ctx
    };
    let (response, all_messages) = with_tool_execution_context(
        tool_ctx,
        run_react_loop(ctx.provider, registry, session_ctx, messages, &ctx.config, None),
    )
    .await?;
    for message in all_messages.iter().skip(old_len + 1) {
        ctx.conversation
            .save_message(conversation_id, message)
            .await?;
    }
    Ok(response.content)
}

macro_rules! json_tool {
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


pub fn cron_list_tool(manager: Arc<CronManager>) -> impl Tool {
    json_tool!(
        "cron_list",
        "List configured cron jobs.",
        json!({"type": "object", "properties": {}}),
        move |_args| {
            let manager = manager.clone();
            async move {
                serde_json::to_string_pretty(&json!({ "items": manager.list_jobs().await? }))
                    .map_err(|e| AppError::Agent(e.to_string()))
            }
        }
    )
}

pub fn cron_manage_tool(
    manager: Arc<CronManager>,
    ctx: AgentTurnCtx,
    workflow_manager: Arc<WorkflowManager>,
    workflow_runner: Arc<WorkflowRunner>,
    runtime: Arc<AgentRuntime>,
    provider_name: String,
) -> impl Tool {
    json_tool!(
        "cron_manage",
        "Manage cron jobs: get, create, update, pause, resume, run_now, or delete.",
        {
            let schedule_schema = json!({
                "type": "object",
                "description": "Schedule definition. Use one of: {kind:'cron', expr:'0 8 * * *'} | {kind:'every', interval_seconds:3600} | {kind:'at', run_at:'2026-01-01T08:00:00Z'}",
                "properties": {
                    "kind": {"type": "string", "enum": ["cron", "every", "at"]},
                    "expr": {"type": "string", "description": "Cron expression (required when kind=cron)"},
                    "interval_seconds": {"type": "integer", "description": "Interval in seconds (required when kind=every)"},
                    "run_at": {"type": "string", "description": "ISO8601 datetime (required when kind=at)"}
                },
                "required": ["kind"]
            });
            let target_schema = json!({
                "type": "object",
                "description": "Target to execute. Use one of: {kind:'agent_turn', message:'...', conversation_id?:'...', title?:'...'} | {kind:'workflow_run', workflow_id:'...', input?:'...', triggered_by?:'...'}",
                "properties": {
                    "kind": {"type": "string", "enum": ["agent_turn", "workflow_run"]},
                    "message": {"type": "string", "description": "Message to send (required when kind=agent_turn)"},
                    "conversation_id": {"type": "string"},
                    "title": {"type": "string"},
                    "agent_id": {"type": "string"},
                    "workflow_id": {"type": "string", "description": "Workflow ID (required when kind=workflow_run)"},
                    "input": {"type": "string"},
                    "triggered_by": {"type": "string"}
                },
                "required": ["kind"]
            });
            json!({
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "enum": ["get", "create", "update", "pause", "resume", "run_now", "delete"],
                        "description": "The action to perform on a cron job."
                    },
                    "jobId": {"type": "string", "description": "Cron job ID (required for get, update, pause, resume, run_now, delete)"},
                    "name": {"type": "string", "description": "Job name (required for create)"},
                    "schedule": schedule_schema,
                    "enabled": {"type": "boolean", "description": "Whether the job is enabled (optional for create/update)"},
                    "target": target_schema
                },
                "required": ["action"]
            })
        },
        move |args: Value| {
            let manager = manager.clone();
            let ctx = ctx.clone();
            let workflow_manager = workflow_manager.clone();
            let workflow_runner = workflow_runner.clone();
            let runtime = runtime.clone();
            let provider_name = provider_name.clone();
            async move {
                let action = args
                    .get("action")
                    .and_then(Value::as_str)
                    .ok_or_else(|| AppError::Validation("action is required".to_owned()))?;

                match action {
                    "get" => {
                        let job_id = args
                            .get("jobId")
                            .and_then(Value::as_str)
                            .ok_or_else(|| AppError::Validation("jobId is required for get".to_owned()))?;
                        serde_json::to_string_pretty(&json!({
                            "job": manager.get_job(job_id).await?,
                            "runs": manager.list_runs(job_id, 20).await?,
                        }))
                        .map_err(|e| AppError::Agent(e.to_string()))
                    }
                    "create" => {
                        let payload: CreateCronJobInput = serde_json::from_value(args)
                            .map_err(|e| AppError::Validation(e.to_string()))?;
                        serde_json::to_string_pretty(&manager.create_job(payload).await?)
                            .map_err(|e| AppError::Agent(e.to_string()))
                    }
                    "update" => {
                        let job_id = args
                            .get("jobId")
                            .and_then(Value::as_str)
                            .ok_or_else(|| AppError::Validation("jobId is required for update".to_owned()))?
                            .to_owned();
                        let payload: UpdateCronJobInput = serde_json::from_value(args)
                            .map_err(|e| AppError::Validation(e.to_string()))?;
                        serde_json::to_string_pretty(&manager.update_job(&job_id, payload).await?)
                            .map_err(|e| AppError::Agent(e.to_string()))
                    }
                    "pause" => {
                        let job_id = args
                            .get("jobId")
                            .and_then(Value::as_str)
                            .ok_or_else(|| AppError::Validation("jobId is required for pause".to_owned()))?;
                        serde_json::to_string_pretty(&manager.pause_job(job_id).await?)
                            .map_err(|e| AppError::Agent(e.to_string()))
                    }
                    "resume" => {
                        let job_id = args
                            .get("jobId")
                            .and_then(Value::as_str)
                            .ok_or_else(|| AppError::Validation("jobId is required for resume".to_owned()))?;
                        serde_json::to_string_pretty(&manager.resume_job(job_id).await?)
                            .map_err(|e| AppError::Agent(e.to_string()))
                    }
                    "run_now" => {
                        let job_id = args
                            .get("jobId")
                            .and_then(Value::as_str)
                            .ok_or_else(|| AppError::Validation("jobId is required for run_now".to_owned()))?;
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
                                        ctx.provider.model(),
                                    )
                                    .await?;
                                workflow_runner.spawn_run(run.run_id.clone());
                                manager
                                    .complete_run(CompleteRunParams {
                                        job_id,
                                        run_id: &run_id,
                                        status: CronRunStatus::Ok,
                                        summary: Some("workflow run started"),
                                        error: None,
                                        session_id: None,
                                        workflow_run_id: Some(&run.run_id),
                                        now: Utc::now(),
                                    })
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
                                    ctx.conversation
                                        .create_conversation(title.as_deref().unwrap_or("Scheduled task"))
                                        .await?
                                        .id
                                };
                                let reply = run_agent_turn(ctx.clone(), &session_id, message).await?;
                                manager
                                    .complete_run(CompleteRunParams {
                                        job_id,
                                        run_id: &run_id,
                                        status: CronRunStatus::Ok,
                                        summary: Some("agent turn completed"),
                                        error: None,
                                        session_id: Some(&session_id),
                                        workflow_run_id: None,
                                        now: Utc::now(),
                                    })
                                    .await?;
                                json!({"sessionId": session_id, "reply": reply})
                            }
                        };
                        serde_json::to_string_pretty(&output).map_err(|e| AppError::Agent(e.to_string()))
                    }
                    "delete" => {
                        let job_id = args
                            .get("jobId")
                            .and_then(Value::as_str)
                            .ok_or_else(|| AppError::Validation("jobId is required for delete".to_owned()))?;
                        manager.delete_job(job_id).await?;
                        Ok(format!("cron job deleted: {job_id}"))
                    }
                    _ => Err(AppError::Validation(format!(
                        "unknown action: {action}. Expected one of: get, create, update, pause, resume, run_now, delete"
                    ))),
                }
            }
        }
    )
}
