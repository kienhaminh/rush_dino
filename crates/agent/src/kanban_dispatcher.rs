//! Background polling loop that picks up kanban tasks, matches them to agents,
//! executes them in isolated react loops, writes daily memory, and notifies
//! the originating conversation.

use std::{path::PathBuf, sync::{Arc, Weak}, time::Duration};

use chrono::Utc;
use tokio::time;
use uuid::Uuid;

use rushdino_common::{
    models::{Message, Role},
    AppError, Result,
};
use rushdino_providers::Provider;

use crate::{
    agent_health_store::AgentHealthStore,
    agent_manager::AgentManager,
    agent_task_memory::AgentTaskMemory,
    conversation::ConversationManager,
    engine::AgentConfig,
    engine_bootstrap::title_from,
    kanban_matching_engine::find_best_match,
    kanban_store::{KanbanStore, TaskStatus, UpdateTaskInput},
    memory::MemoryManager,
    react_loop::run_react_loop,
    skill_manager::SkillManager,
    tool_registry::{SessionToolContext, ToolRegistry},
    tools::{
        delegate_to_agent::parse_tool_list,
        bash::{with_tool_execution_context, ToolExecutionContext},
    },
};

/// Heartbeat interval (in seconds) — fallback poll in case a notification is
/// missed. Much longer than the old 5-second poll since `Notify` handles the
/// hot path.
pub const HEARTBEAT_INTERVAL_SECS: u64 = 30;

/// Formats a completed task as a daily-note Markdown entry.
///
/// The entry is designed to be appended to the day's daily note so an agent
/// can review what was accomplished during the session.
pub fn format_task_completion_note(task_id: &str, title: &str, agent: &str, result: &str) -> String {
    let now = Utc::now().format("%Y-%m-%d %H:%M").to_string();
    // Trim result to keep daily notes from growing unbounded.
    let preview = if result.len() > 500 { &result[..500] } else { result };
    format!("## {title}\n\n- **Time**: {now}\n- **Agent**: {agent}\n- **Task ID**: {task_id}\n\n{preview}\n\n---\n\n")
}

// ---------------------------------------------------------------------------
// KanbanDispatcher
// ---------------------------------------------------------------------------

/// Background service that polls the kanban backlog and auto-executes tasks.
///
/// Each matching task is claimed, run in an isolated react loop (modelled on
/// `DelegateToAgentTool`), persisted, and marked as in-review.  A daily note
/// entry is written to `MemoryManager` and the originating conversation is
/// optified via `broadcast_tx`.
pub struct KanbanDispatcher {
    pub store: Arc<KanbanStore>,
    pub agent_manager: Arc<AgentManager>,
    pub provider: Arc<Provider>,
    pub config: AgentConfig,
    /// Weak refs prevent a retain-cycle: registry → tools → dispatcher → registry.
    pub registry: Weak<ToolRegistry>,
    pub session_ctx: Weak<SessionToolContext>,
    pub memory: Arc<MemoryManager>,
    pub skill_manager: Arc<SkillManager>,
    pub conversation: Arc<ConversationManager>,
    pub task_memory: Arc<AgentTaskMemory>,
    pub health_store: Arc<AgentHealthStore>,
    pub home_dir: PathBuf,
    pub broadcast_tx: tokio::sync::broadcast::Sender<serde_json::Value>,
    /// Shared with `KanbanStore` — woken when a task is created or sent back
    /// for revision, so the dispatcher reacts immediately instead of waiting
    /// for the next heartbeat tick.
    pub task_notify: Arc<tokio::sync::Notify>,
}

impl KanbanDispatcher {
    /// Spawns the background dispatch loop. The loop wakes immediately when
    /// `task_notify` fires (a task was created or sent back for revision) and
    /// also runs a heartbeat poll every [`HEARTBEAT_INTERVAL_SECS`] as a
    /// safety net.
    pub fn start(self: Arc<Self>) {
        tokio::spawn(async move {
            let mut heartbeat = time::interval(Duration::from_secs(HEARTBEAT_INTERVAL_SECS));
            loop {
                tokio::select! {
                    _ = self.task_notify.notified() => {
                        // Immediate wakeup — a task was just posted or returned.
                    }
                    _ = heartbeat.tick() => {
                        // Periodic fallback in case a notification was missed.
                    }
                }
                if let Err(e) = self.poll_once().await {
                    tracing::warn!(error = %e, "kanban dispatcher poll error");
                }
            }
        });
    }

    /// One poll cycle: fetch backlog, match each unassigned task, execute.
    async fn poll_once(&self) -> Result<()> {
        let backlog = self.store.list_backlog_tasks().await?;
        let agents = self.agent_manager.list();

        for task in backlog {
            // Skip if already claimed by a previous cycle that hasn't completed yet.
            if task.assigned_agent.is_some() {
                continue;
            }

            if let Some(matched) = find_best_match(&task, &agents, Some(&self.health_store)).await {
                if let Err(e) = self.execute_task(&task, &matched.agent_name).await {
                    tracing::warn!(
                        task_id = %task.id,
                        agent = %matched.agent_name,
                        error = %e,
                        "task execution failed"
                    );
                    // Record failure for circuit breaker / matching feedback.
                    let _ = self.health_store.record_outcome(
                        &matched.agent_name, &task.id, &task.tags, false,
                    ).await;
                    // Best-effort status update; ignore secondary failures.
                    let _ = self.store.update_task_status(&UpdateTaskInput {
                        task_id: task.id.clone(),
                        status: TaskStatus::Failed,
                        result: Some(format!("Execution error: {e}")),
                        block_reason: None,
                    }).await;
                }
            }
        }
        Ok(())
    }

    /// Claim, execute, persist, and notify for a single task.
    ///
    /// Mirrors the pattern in `DelegateToAgentTool::execute` for isolated
    /// session creation and react-loop execution.
    async fn execute_task(&self, task: &crate::kanban_store::KanbanTask, agent_name: &str) -> Result<()> {
        // 1. Resolve the agent template.
        let template = self
            .agent_manager
            .get(agent_name)
            .ok_or_else(|| AppError::Agent(format!("unknown agent: {agent_name}")))?;

        // 2. Upgrade Weak refs — both must still be alive.
        let registry = self
            .registry
            .upgrade()
            .ok_or_else(|| AppError::Agent("tool registry unavailable".to_owned()))?;
        let session_ctx = self
            .session_ctx
            .upgrade()
            .ok_or_else(|| AppError::Agent("session context unavailable".to_owned()))?;

        // 3. Claim the task in the store.
        self.store.claim_task(&task.id, agent_name).await?;

        // 4. Create an isolated conversation for this task run.
        // Use agent name as the stable session ID so each team agent gets one persistent session.
        let conv_id = agent_name.to_lowercase().replace(' ', "-");
        let conv_title = format!("{agent_name}: {}", title_from(&task.title));
        self.conversation
            .create_agent_conversation(&conv_id, &conv_title)
            .await?;

        // Record the conversation ID against the task so it is traceable in the UI.
        let _ = self.store.set_conversation(&task.id, &conv_id).await;

        // 5. Build scoped tool context for the agent.
        let allowed = parse_tool_list(&template.tools);
        let scoped_ctx: Arc<SessionToolContext> = if allowed.is_empty() {
            session_ctx.clone()
        } else {
            let refs: Vec<&str> = allowed.iter().map(String::as_str).collect();
            Arc::new(SessionToolContext::scoped(session_ctx.pool_tools(), &refs))
        };

        // 6. Per-agent model override.
        let child_config = if template.model.is_some() {
            AgentConfig {
                model_override: template.model.clone(),
                ..self.config.clone()
            }
        } else {
            self.config.clone()
        };

        // 7. Agent workspace directory.
        let agent_workspace = self.home_dir.join("agents").join(agent_name).join("workspace");
        std::fs::create_dir_all(&agent_workspace).map_err(|e| {
            AppError::Agent(format!("failed to create agent workspace: {e}"))
        })?;

        // 8. Build system prompt, injecting workspace, tool list, and task history.
        let mut system_content = template.system_prompt.clone();
        system_content.push_str(&format!(
            "\n\n## Workspace\nYour working directory is: {}\n\
             Confine all file operations to this directory unless explicitly instructed otherwise.",
            agent_workspace.display()
        ));

        let tool_names: Vec<String> = scoped_ctx
            .active_definitions()
            .iter()
            .map(|d| d.name.clone())
            .collect();
        if !tool_names.is_empty() {
            system_content.push_str(&format!(
                "\n\n## Available Tools\nYou have access to: {}.\n\
                 Do not attempt to call tools not in this list.",
                tool_names.join(", ")
            ));
        }

        if let Some(log) = self.task_memory.load_task_log(agent_name) {
            system_content.push_str(&format!("\n\n## Your Task History\n\n{log}"));
        }

        // Inject parent task context if this is a subtask.
        if let Some(ref parent_id) = task.parent_task_id {
            if let Ok(parent) = self.store.get_task(parent_id).await {
                if let Some(ref result) = parent.result {
                    let preview = if result.len() > 500 { &result[..500] } else { result };
                    system_content.push_str(&format!(
                        "\n\n## Parent Task Result\n\nParent task \"{}\" produced:\n{}",
                        parent.title, preview
                    ));
                }
            }
        }

        // Inject review feedback for retry tasks.
        if let Some(ref feedback) = task.review_feedback {
            system_content.push_str(&format!(
                "\n\n## Previous Review Feedback\n\nYour previous attempt was rejected with this feedback:\n{}",
                feedback
            ));
        }

        // 9. Build initial messages.
        let task_description = format!(
            "**Task**: {}\n\n{}\n\n**Task ID**: {}",
            task.title, task.description, task.id
        );

        let sys_msg = Message::new(Uuid::new_v4().to_string(), Role::System, system_content);
        let user_msg = Message::new(Uuid::new_v4().to_string(), Role::User, task_description.clone());

        // Persist opening messages immediately so they are visible on error.
        self.conversation.save_message(&conv_id, &sys_msg).await?;
        self.conversation.save_message(&conv_id, &user_msg).await?;

        let messages = vec![sys_msg, user_msg];

        // 10. Execute in isolated react loop.
        let child_ctx = ToolExecutionContext {
            session_id: Some(conv_id.clone()),
            conversation_id: Some(conv_id.clone()),
            run_id: None,
            delegation_depth: 0,
            workspace_override: Some(agent_workspace),
            parent_context: None,
            ws_event_tx: None,
        };

        let (response, all_messages) = with_tool_execution_context(
            child_ctx,
            run_react_loop(
                self.provider.clone(),
                registry,
                scoped_ctx,
                messages,
                &child_config,
                None,
            ),
        )
        .await?;

        // 11. Persist remaining messages (skip first two already saved).
        for message in all_messages.iter().skip(2) {
            if let Err(e) = self.conversation.save_message(&conv_id, message).await {
                tracing::warn!(
                    agent = agent_name,
                    conv_id = %conv_id,
                    error = %e,
                    "failed to persist kanban task message"
                );
            }
        }

        // 12. Mark task as Done (store will promote to InReview automatically).
        self.store.update_task_status(&UpdateTaskInput {
            task_id: task.id.clone(),
            status: TaskStatus::Done,
            result: Some(response.content.clone()),
            block_reason: None,
        }).await?;

        // 13. Write daily note entry.
        let note = format_task_completion_note(&task.id, &task.title, agent_name, &response.content);
        if let Err(e) = self.memory.write_memory(&note, true) {
            tracing::warn!(task_id = %task.id, error = %e, "failed to write daily note for kanban task");
        }

        // 14. Log to per-agent task memory.
        if let Err(e) = self.task_memory.append_task(agent_name, &task_description, &response.content) {
            tracing::warn!(agent = agent_name, error = %e, "failed to write agent task log for kanban task");
        }

        // 15. Notify originating conversation if requested.
        if let Some(ref notify_conv_id) = task.notify_conversation_id {
            let notification = serde_json::json!({
                "type": "kanban_task_completed",
                "task_id": task.id,
                "task_title": task.title,
                "agent": agent_name,
                "conversation_id": notify_conv_id,
                "result_preview": if response.content.len() > 200 {
                    &response.content[..200]
                } else {
                    &response.content
                },
            });
            // Best-effort broadcast; ignore if no receivers.
            let _ = self.broadcast_tx.send(notification);
        }

        // 16. Record success for matching feedback / circuit breaker.
        if let Err(e) = self.health_store.record_outcome(agent_name, &task.id, &task.tags, true).await {
            tracing::warn!(task_id = %task.id, error = %e, "failed to record health outcome");
        }

        tracing::info!(
            task_id = %task.id,
            agent = agent_name,
            conv_id = %conv_id,
            "kanban task completed successfully"
        );

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn heartbeat_interval_is_reasonable() {
        assert!(HEARTBEAT_INTERVAL_SECS >= 10);
        assert!(HEARTBEAT_INTERVAL_SECS <= 120);
    }

    #[test]
    fn daily_note_entry_format() {
        let entry = format_task_completion_note(
            "task-1",
            "Research GPT-5.4",
            "researcher",
            "Found: GPT-5.4 released March 2026.",
        );
        assert!(entry.contains("Research GPT-5.4"));
        assert!(entry.contains("researcher"));
        assert!(entry.contains("Found: GPT-5.4"));
        assert!(entry.starts_with("## "));
    }
}
