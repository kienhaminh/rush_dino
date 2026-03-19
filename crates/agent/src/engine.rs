use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{Arc, RwLock},
    time::Duration,
};

use sqlx::SqlitePool;
use tokio::sync::{mpsc, oneshot, Mutex};

use chrono::Utc;
use rushdino_common::{models::Message, models::Role, Result, RichContent};
use rushdino_providers::{types::ChatChunk, types::ChatResponse, types::ThinkingLevel, Provider};
use serde_json::Value;
use uuid::Uuid;

use crate::{
    agent_manager::{AgentManager, AgentTemplate},
    agent_progress::{build_lanes_from_conversation_store, AgentProgressLane},
    conversation::ConversationManager,
    cron_manager::{
        CreateCronJobInput, CronJobRecord, CronManager, CronRunRecord, CronRunStatus,
        CronTargetInput, UpdateCronJobInput,
    },
    engine_bootstrap::{system_message, title_from, user_message},
    engine_deps::build_engine_deps,
    job_manager::{JobManager, JobResult},
    knowledge_graph::KnowledgeGraphAccess,
    memory::MemoryManager,
    orchestrator::Orchestrator,
    react_loop::{run_react_loop, run_react_loop_streaming, StreamingEvent},
    runtime::{AgentRuntime, RunCounts, RunDetail, RunListFilter, RunOriginMetadata, RunSnapshot},
    skill_manager::Skill,
    system_broker::SharedSystemBroker,
    tool_registry::{SessionToolContext, ToolRegistry},
    tools::shell_exec::{with_tool_execution_context, ToolExecutionContext},
    usage_metrics_store::UsageMetricsStore,
    workflow_manager::WorkflowManager,
    workflow_runner::WorkflowRunner,
    workflow_types::{
        CreateWorkflowInput, UpdateWorkflowInput, WorkflowDetail, WorkflowListItem,
        WorkflowRunDetail, WorkflowRunListItem, WorkflowRunStartResponse, WorkflowSource,
        WorkflowStatus, WorkflowStepInput,
    },
};

#[derive(Debug, Clone)]
pub struct AgentConfig {
    pub max_iterations: usize,
    pub max_context_tokens: usize,
    pub tool_timeout_secs: u64,
    pub system_prompt: String,
    /// Optional model override. When set, overrides the provider's default model for this agent's requests.
    pub model_override: Option<String>,
    pub thinking_level: ThinkingLevel,
    /// Max characters per bootstrap file injected into the system prompt.
    pub bootstrap_max_chars: usize,
    /// Max total characters for all bootstrap files combined.
    pub bootstrap_total_max_chars: usize,
}

impl Default for AgentConfig {
    fn default() -> Self {
        Self {
            max_iterations: 10,
            max_context_tokens: 8192,
            tool_timeout_secs: 30,
            model_override: None,
            system_prompt: "You are RushDino, a local-first AI agent.".to_owned(),
            thinking_level: ThinkingLevel::Low,
            bootstrap_max_chars: crate::memory_bootstrap::DEFAULT_BOOTSTRAP_MAX_CHARS,
            bootstrap_total_max_chars: crate::memory_bootstrap::DEFAULT_BOOTSTRAP_TOTAL_MAX_CHARS,
        }
    }
}

pub struct AgentEngine {
    provider: Arc<Provider>,
    conversation: Arc<ConversationManager>,
    pub tool_registry: Arc<ToolRegistry>,
    _job_manager: Arc<JobManager>,
    _orchestrator: Arc<Orchestrator>,
    memory: Arc<MemoryManager>,
    skill_manager: Arc<crate::skill_manager::SkillManager>,
    agent_manager: Arc<AgentManager>,
    workflow_manager: Arc<WorkflowManager>,
    cron_manager: Arc<CronManager>,
    workflow_runner: Arc<WorkflowRunner>,
    usage_metrics: Arc<UsageMetricsStore>,
    provider_name: String,
    knowledge_graph: Option<Arc<dyn KnowledgeGraphAccess>>,
    session_ctx: Arc<SessionToolContext>,
    config: AgentConfig,
    /// Shared runtime override — same Arc as RuntimeState.thinking_level_override.
    thinking_level_override: Arc<RwLock<Option<ThinkingLevel>>>,
    inbox_rx: Arc<Mutex<mpsc::Receiver<JobResult>>>,
    runtime: Arc<AgentRuntime>,
    pending_assistant_runs: Arc<Mutex<HashMap<String, AssistantRunJob>>>,
}

#[derive(Debug, Clone)]
pub enum WsStreamEvent {
    ChatChunk {
        run_id: String,
        conversation_id: String,
        chunk: ChatChunk,
    },
    AssistantReset {
        run_id: String,
        conversation_id: String,
    },
    ToolStart {
        run_id: String,
        conversation_id: String,
        tool_name: String,
        args: Value,
    },
    ToolEnd {
        run_id: String,
        conversation_id: String,
        tool_name: String,
        result: String,
        is_error: bool,
    },
    AssistantMessage {
        run_id: String,
        conversation_id: String,
        content: String,
        rich_content: Option<RichContent>,
    },
    Error {
        run_id: String,
        conversation_id: String,
        message: String,
    },
}

struct AssistantRunJob {
    run_id: String,
    session_id: String,
    conversation_id: String,
    user_input: String,
    ws_event_tx: Option<mpsc::Sender<WsStreamEvent>>,
    gateway_event_tx: Option<mpsc::Sender<StreamingEvent>>,
    completion_tx: Option<oneshot::Sender<std::result::Result<ChatResponse, String>>>,
}

pub struct GatewayRunHandle {
    pub snapshot: RunSnapshot,
    pub result_rx: oneshot::Receiver<std::result::Result<ChatResponse, String>>,
    pub stream_rx: Option<mpsc::Receiver<StreamingEvent>>,
}

#[cfg(test)]
mod config_tests {
    use super::AgentConfig;
    use rushdino_providers::types::ThinkingLevel;
    use std::sync::{Arc, RwLock};

    #[test]
    fn default_context_budget_is_large_enough_for_longer_conversations() {
        let config = AgentConfig::default();
        assert_eq!(config.max_context_tokens, 8192);
    }

    // Note: constructing AgentEngine in a unit test requires the full dependency graph
    // (provider, DB pool, etc.), which is impractical here. This test verifies the
    // override→fallback logic pattern that effective_thinking_level() implements.
    #[test]
    fn thinking_level_override_logic_prefers_override_over_config() {
        let config = AgentConfig::default(); // default is ThinkingLevel::Low
        let override_arc: Arc<RwLock<Option<ThinkingLevel>>> = Arc::new(RwLock::new(None));

        // No override → falls back to config
        let effective = override_arc
            .read()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
            .unwrap_or_else(|| config.thinking_level.clone());
        assert_eq!(effective, ThinkingLevel::Low);

        // With override
        *override_arc.write().unwrap_or_else(|e| e.into_inner()) = Some(ThinkingLevel::High);
        let effective = override_arc
            .read()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
            .unwrap_or_else(|| config.thinking_level.clone());
        assert_eq!(effective, ThinkingLevel::High);

        // Cleared override → falls back again
        *override_arc.write().unwrap_or_else(|e| e.into_inner()) = None;
        let effective = override_arc
            .read()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
            .unwrap_or_else(|| config.thinking_level.clone());
        assert_eq!(effective, ThinkingLevel::Low);
    }
}

impl AgentEngine {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        provider: Arc<Provider>,
        pool: Arc<SqlitePool>,
        home_dir: PathBuf,
        brave_api_key: Option<String>,
        gemini_api_key: Option<String>,
        provider_name: String,
        config: AgentConfig,
        runtime: Arc<AgentRuntime>,
        system_broker: SharedSystemBroker,
        knowledge_graph: Option<Arc<dyn KnowledgeGraphAccess>>,
        // Optional sandbox egress proxy — pass Some for sandboxed agents.
        egress_proxy: Option<Arc<rushdino_security::egress_proxy::EgressProxy>>,
    ) -> Result<Self> {
        let deps = build_engine_deps(
            provider.clone(),
            pool,
            home_dir,
            brave_api_key,
            gemini_api_key,
            &config,
            runtime.clone(),
            system_broker,
            knowledge_graph.clone(),
            egress_proxy,
        )?;

        let usage_metrics = Arc::new(UsageMetricsStore::new(deps.pool.clone()));

        Ok(Self {
            provider,
            conversation: deps.conversation,
            tool_registry: deps.tool_registry,
            _job_manager: deps.job_manager,
            _orchestrator: deps.orchestrator,
            memory: deps.memory,
            skill_manager: deps.skill_manager,
            agent_manager: deps.agent_manager,
            workflow_manager: deps.workflow_manager,
            cron_manager: deps.cron_manager,
            workflow_runner: deps.workflow_runner,
            usage_metrics,
            provider_name,
            knowledge_graph,
            session_ctx: deps.session_ctx,
            config,
            thinking_level_override: Arc::new(RwLock::new(None)),
            inbox_rx: Arc::new(Mutex::new(deps.inbox_rx)),
            runtime,
            pending_assistant_runs: Arc::new(Mutex::new(HashMap::new())),
        })
    }

    pub async fn chat_or_create(
        &self,
        conversation_id: Option<String>,
        user_input: &str,
    ) -> Result<(String, ChatResponse)> {
        let conversation_id = if let Some(id) = conversation_id {
            id
        } else {
            self.conversation
                .create_conversation(title_from(user_input))
                .await?
                .id
        };
        let response = self.chat(&conversation_id, user_input).await?;
        Ok((conversation_id, response))
    }

    pub async fn chat(&self, conversation_id: &str, user_input: &str) -> Result<ChatResponse> {
        let mut messages = self
            .conversation
            .get_messages(conversation_id)
            .await
            .unwrap_or_default();
        if messages.is_empty() {
            let _ = self
                .conversation
                .create_conversation_with_id(conversation_id, title_from(user_input))
                .await?;
        }

        // Always prepend the system message at position 0. It is never stored in
        // the DB (dynamic memory/soul files can change between turns), so it must
        // be reconstructed and injected fresh on every request.
        messages.insert(
            0,
            system_message(
                &self.config,
                self.memory.as_ref(),
                self.agent_manager.as_ref(),
                self.skill_manager.as_ref(),
                self.session_ctx.as_ref(),
            ),
        );

        let old_len = messages.len();
        let user_msg = user_message(user_input);
        self.conversation
            .save_message(conversation_id, &user_msg)
            .await?;
        self.maybe_ingest_message("conversation_message", &user_msg)
            .await;
        messages.push(user_msg);

        let mut injected_graph_context = false;
        if let Some(graph_message) = self
            .build_graph_context_message(user_input, Some(conversation_id))
            .await
        {
            messages.push(graph_message);
            injected_graph_context = true;
        }

        let context = ToolExecutionContext {
            session_id: None,
            conversation_id: Some(conversation_id.to_owned()),
            run_id: None,
            delegation_depth: 0,
        };

        let effective_config = AgentConfig {
            thinking_level: self.effective_thinking_level(),
            ..self.config.clone()
        };
        let (response, all_messages) = with_tool_execution_context(
            context,
            run_react_loop(
                self.provider.clone(),
                self.tool_registry.clone(),
                messages,
                &effective_config,
                None,
            ),
        )
        .await?;

        // Delete BOOTSTRAP.md once onboarding is complete, indicated by the presence
        // of IDENTITY.md (written by the agent during the onboarding ritual).
        // This keeps BOOTSTRAP.md injected across the full multi-turn onboarding
        // conversation rather than removing it after just the first response.
        if self.memory.read_named("IDENTITY.md").is_ok() {
            self.memory.delete_named("BOOTSTRAP.md");
        }

        let persist_offset = old_len + 1 + usize::from(injected_graph_context);
        for message in all_messages.iter().skip(persist_offset) {
            self.conversation
                .save_message(conversation_id, message)
                .await?;
            self.maybe_ingest_message("conversation_message", message)
                .await;
        }
        self.persist_usage_metric(conversation_id, &response).await;

        Ok(response)
    }

    pub async fn stream_chat(
        &self,
        conversation_id: Option<String>,
        user_input: &str,
    ) -> Result<(String, mpsc::Receiver<ChatChunk>)> {
        let (conv_id, response) = self.chat_or_create(conversation_id, user_input).await?;
        let (tx, rx) = mpsc::channel(8);
        tokio::spawn(async move {
            let _ = tx
                .send(ChatChunk {
                    delta: response.content,
                    tool_calls: response.tool_calls,
                    done: false,
                    usage: response.usage,
                    thinking_delta: None,
                })
                .await;
            let _ = tx
                .send(ChatChunk {
                    delta: String::new(),
                    tool_calls: Vec::new(),
                    done: true,
                    usage: None,
                    thinking_delta: None,
                })
                .await;
        });
        Ok((conv_id, rx))
    }

    pub async fn stream_chat_via_ws(
        &self,
        session_id: &str,
        conversation_id: Option<String>,
        user_input: &str,
        event_tx: mpsc::Sender<WsStreamEvent>,
    ) -> Result<String> {
        let conversation_id = if let Some(id) = conversation_id {
            id
        } else {
            self.conversation
                .create_conversation(title_from(user_input))
                .await?
                .id
        };

        let mut messages = self
            .conversation
            .get_messages(&conversation_id)
            .await
            .unwrap_or_default();
        if messages.is_empty() {
            let _ = self
                .conversation
                .create_conversation_with_id(&conversation_id, title_from(user_input))
                .await?;
        }

        // Always prepend the system message at position 0. It is never stored in
        // the DB (dynamic memory/soul files can change between turns), so it must
        // be reconstructed and injected fresh on every request.
        messages.insert(
            0,
            system_message(
                &self.config,
                self.memory.as_ref(),
                self.agent_manager.as_ref(),
                self.skill_manager.as_ref(),
                self.session_ctx.as_ref(),
            ),
        );

        let old_len = messages.len();
        let user_msg = user_message(user_input);
        self.conversation
            .save_message(&conversation_id, &user_msg)
            .await?;
        self.maybe_ingest_message("conversation_message", &user_msg)
            .await;
        messages.push(user_msg);
        let mut injected_graph_context = false;
        if let Some(graph_message) = self
            .build_graph_context_message(user_input, Some(&conversation_id))
            .await
        {
            messages.push(graph_message);
            injected_graph_context = true;
        }

        let (internal_tx, mut internal_rx) = mpsc::channel(128);
        let event_forward_tx = event_tx.clone();
        let conversation_id_for_events = conversation_id.clone();
        tokio::spawn(async move {
            while let Some(event) = internal_rx.recv().await {
                let ws_event = match event {
                    StreamingEvent::ChatChunk(chunk) => WsStreamEvent::ChatChunk {
                        run_id: "legacy-ws".to_owned(),
                        conversation_id: conversation_id_for_events.clone(),
                        chunk,
                    },
                    StreamingEvent::AssistantReset => WsStreamEvent::AssistantReset {
                        run_id: "legacy-ws".to_owned(),
                        conversation_id: conversation_id_for_events.clone(),
                    },
                    StreamingEvent::ToolStart { tool_name, args } => WsStreamEvent::ToolStart {
                        run_id: "legacy-ws".to_owned(),
                        conversation_id: conversation_id_for_events.clone(),
                        tool_name,
                        args,
                    },
                    StreamingEvent::ToolEnd {
                        tool_name,
                        result,
                        is_error,
                    } => WsStreamEvent::ToolEnd {
                        run_id: "legacy-ws".to_owned(),
                        conversation_id: conversation_id_for_events.clone(),
                        tool_name,
                        result,
                        is_error,
                    },
                };
                if event_forward_tx.send(ws_event).await.is_err() {
                    break;
                }
            }
        });

        let context = ToolExecutionContext {
            session_id: Some(session_id.to_owned()),
            conversation_id: Some(conversation_id.clone()),
            run_id: None,
            delegation_depth: 0,
        };

        let effective_config = AgentConfig {
            thinking_level: self.effective_thinking_level(),
            ..self.config.clone()
        };
        let (response, all_messages) = with_tool_execution_context(
            context,
            run_react_loop_streaming(
                self.provider.clone(),
                self.tool_registry.clone(),
                messages,
                &effective_config,
                internal_tx,
            ),
        )
        .await?;

        // Delete BOOTSTRAP.md once onboarding is complete, indicated by the presence
        // of IDENTITY.md (written by the agent during the onboarding ritual).
        // This keeps BOOTSTRAP.md injected across the full multi-turn onboarding
        // conversation rather than removing it after just the first response.
        if self.memory.read_named("IDENTITY.md").is_ok() {
            self.memory.delete_named("BOOTSTRAP.md");
        }

        let persist_offset = old_len + 1 + usize::from(injected_graph_context);
        for message in all_messages.iter().skip(persist_offset) {
            self.conversation
                .save_message(&conversation_id, message)
                .await?;
            self.maybe_ingest_message("conversation_message", message)
                .await;
        }
        self.persist_usage_metric(&conversation_id, &response).await;

        Ok(conversation_id)
    }

    pub async fn submit_http_run(
        self: &Arc<Self>,
        session_id: &str,
        conversation_id: Option<String>,
        user_input: &str,
    ) -> Result<(
        RunSnapshot,
        oneshot::Receiver<std::result::Result<ChatResponse, String>>,
    )> {
        let conversation_id = conversation_id.unwrap_or_else(|| Uuid::new_v4().to_string());
        let (snapshot, start_now) = self
            .runtime
            .submit_assistant_run(
                session_id,
                &conversation_id,
                title_from(user_input),
                user_input,
                &self.provider_name,
                self.provider.model(),
            )
            .await?;

        let (result_tx, result_rx) = oneshot::channel();
        self.pending_assistant_runs.lock().await.insert(
            snapshot.id.clone(),
            AssistantRunJob {
                run_id: snapshot.id.clone(),
                session_id: session_id.to_owned(),
                conversation_id,
                user_input: user_input.to_owned(),
                ws_event_tx: None,
                gateway_event_tx: None,
                completion_tx: Some(result_tx),
            },
        );

        if start_now {
            if let Some(job) = self
                .pending_assistant_runs
                .lock()
                .await
                .remove(&snapshot.id)
            {
                let engine = self.clone();
                tokio::spawn(async move {
                    engine.execute_assistant_run(job).await;
                });
            }
        }

        Ok((snapshot, result_rx))
    }

    pub async fn submit_gateway_run(
        self: &Arc<Self>,
        gateway_session_id: &str,
        conversation_id: &str,
        channel_id: &str,
        sender_id: &str,
        user_input: &str,
        stream_events: bool,
    ) -> Result<GatewayRunHandle> {
        let (snapshot, start_now) = self
            .runtime
            .submit_assistant_run_with_origin(
                gateway_session_id,
                conversation_id,
                title_from(user_input),
                user_input,
                &self.provider_name,
                self.provider.model(),
                RunOriginMetadata {
                    source: Some("gateway".to_owned()),
                    channel_id: Some(channel_id.to_owned()),
                    sender_id: Some(sender_id.to_owned()),
                    gateway_session_id: Some(gateway_session_id.to_owned()),
                },
            )
            .await?;

        let (result_tx, result_rx) = oneshot::channel();
        let (gateway_event_tx, stream_rx) = if stream_events {
            let (tx, rx) = mpsc::channel(128);
            (Some(tx), Some(rx))
        } else {
            (None, None)
        };
        self.pending_assistant_runs.lock().await.insert(
            snapshot.id.clone(),
            AssistantRunJob {
                run_id: snapshot.id.clone(),
                session_id: gateway_session_id.to_owned(),
                conversation_id: conversation_id.to_owned(),
                user_input: user_input.to_owned(),
                ws_event_tx: None,
                gateway_event_tx,
                completion_tx: Some(result_tx),
            },
        );

        if start_now {
            if let Some(job) = self
                .pending_assistant_runs
                .lock()
                .await
                .remove(&snapshot.id)
            {
                let engine = self.clone();
                tokio::spawn(async move {
                    engine.execute_assistant_run(job).await;
                });
            }
        }

        Ok(GatewayRunHandle {
            snapshot,
            result_rx,
            stream_rx,
        })
    }

    pub async fn submit_ws_run(
        self: &Arc<Self>,
        session_id: &str,
        conversation_id: Option<String>,
        user_input: &str,
        event_tx: mpsc::Sender<WsStreamEvent>,
    ) -> Result<RunSnapshot> {
        let conversation_id = conversation_id.unwrap_or_else(|| Uuid::new_v4().to_string());
        let (snapshot, start_now) = self
            .runtime
            .submit_assistant_run(
                session_id,
                &conversation_id,
                title_from(user_input),
                user_input,
                &self.provider_name,
                self.provider.model(),
            )
            .await?;

        self.pending_assistant_runs.lock().await.insert(
            snapshot.id.clone(),
            AssistantRunJob {
                run_id: snapshot.id.clone(),
                session_id: session_id.to_owned(),
                conversation_id,
                user_input: user_input.to_owned(),
                ws_event_tx: Some(event_tx),
                gateway_event_tx: None,
                completion_tx: None,
            },
        );

        if start_now {
            if let Some(job) = self
                .pending_assistant_runs
                .lock()
                .await
                .remove(&snapshot.id)
            {
                let engine = self.clone();
                tokio::spawn(async move {
                    engine.execute_assistant_run(job).await;
                });
            }
        }

        Ok(snapshot)
    }

    pub async fn list_runs(&self, filter: RunListFilter) -> Result<Vec<RunSnapshot>> {
        self.runtime.list_runs(filter).await
    }

    pub async fn get_run_detail(&self, run_id: &str, event_limit: i64) -> Result<RunDetail> {
        self.runtime.get_run_detail(run_id, event_limit).await
    }

    pub async fn get_run(&self, run_id: &str) -> Result<RunSnapshot> {
        self.runtime.get_run(run_id).await
    }

    pub async fn wait_for_run(
        &self,
        run_id: &str,
        timeout: Duration,
        require_terminal: bool,
    ) -> Result<RunSnapshot> {
        self.runtime
            .wait_for_run(run_id, timeout, require_terminal)
            .await
    }

    pub async fn abort_run(&self, run_id: &str) -> Result<RunSnapshot> {
        let outcome = self.runtime.abort_run(run_id).await?;
        if outcome.removed_from_queue {
            if let Some(job) = self.pending_assistant_runs.lock().await.remove(run_id) {
                if let Some(tx) = job.completion_tx {
                    let _ = tx.send(Err("run aborted before execution started".to_owned()));
                }
            }
        }
        Ok(outcome.snapshot)
    }

    pub async fn list_session_runs(
        &self,
        conversation_id: &str,
        limit: i64,
    ) -> Result<Vec<RunSnapshot>> {
        self.runtime.list_session_runs(conversation_id, limit).await
    }

    pub async fn run_counts(&self) -> Result<RunCounts> {
        self.runtime.counts().await
    }

    pub async fn record_approval_resolution(
        &self,
        run_id: &str,
        approved: bool,
        reason: Option<String>,
    ) -> Result<RunSnapshot> {
        self.runtime
            .record_approval_resolution(run_id, approved, reason)
            .await
    }

    pub async fn record_run_event(
        &self,
        run_id: &str,
        event_type: &str,
        message: impl Into<String>,
    ) -> Result<RunSnapshot> {
        self.runtime.record_event(run_id, event_type, message).await
    }

    async fn execute_assistant_run(self: Arc<Self>, mut job: AssistantRunJob) {
        loop {
            let run_id = job.run_id.clone();
            let session_id = job.session_id.clone();
            let conversation_id = job.conversation_id.clone();
            let user_input = job.user_input.clone();
            let ws_event_tx = job.ws_event_tx.clone();
            let gateway_event_tx = job.gateway_event_tx.clone();
            let result = self
                .execute_assistant_with_runtime(
                    &run_id,
                    &session_id,
                    &conversation_id,
                    &user_input,
                    ws_event_tx.clone(),
                    gateway_event_tx,
                )
                .await;
            let completion_tx = job.completion_tx.take();

            match result {
                Ok(response) => {
                    let snapshot = match self
                        .runtime
                        .mark_completed(&run_id, &response.content)
                        .await
                    {
                        Ok(snapshot) => snapshot,
                        Err(err) => {
                            tracing::error!(run_id = %run_id, error = %err, "failed to finalize completed run");
                            return;
                        }
                    };
                    if snapshot.state == crate::runtime::RunState::Completed {
                        if let Some(ws_event_tx) = ws_event_tx.as_ref() {
                            let _ = ws_event_tx
                                .send(WsStreamEvent::AssistantMessage {
                                    run_id: run_id.clone(),
                                    conversation_id: conversation_id.clone(),
                                    content: response.content.clone(),
                                    rich_content: response.rich_content.clone(),
                                })
                                .await;
                        }
                    }
                    if let Some(tx) = completion_tx {
                        let _ = tx.send(if snapshot.state == crate::runtime::RunState::Completed {
                            Ok(response)
                        } else {
                            Err(snapshot
                                .policy
                                .reason
                                .clone()
                                .unwrap_or_else(|| "run aborted".to_owned()))
                        });
                    }
                }
                Err(err) => {
                    let snapshot = match self.runtime.mark_failed(&run_id, &err.to_string()).await {
                        Ok(snapshot) => snapshot,
                        Err(persist_err) => {
                            tracing::error!(
                                run_id = %run_id,
                                error = %persist_err,
                                "failed to persist failed run state"
                            );
                            return;
                        }
                    };

                    if snapshot.state != crate::runtime::RunState::Aborted {
                        if let Some(ws_event_tx) = ws_event_tx.as_ref() {
                            let _ = ws_event_tx
                                .send(WsStreamEvent::Error {
                                    run_id: run_id.clone(),
                                    conversation_id: conversation_id.clone(),
                                    message: err.to_string(),
                                })
                                .await;
                        }
                    }

                    if let Some(tx) = completion_tx {
                        let message = if snapshot.state == crate::runtime::RunState::Aborted {
                            snapshot
                                .policy
                                .reason
                                .clone()
                                .unwrap_or_else(|| "run aborted".to_owned())
                        } else {
                            snapshot.error.clone().unwrap_or_else(|| err.to_string())
                        };
                        let _ = tx.send(Err(message));
                    }
                }
            }

            match self.runtime.finish_assistant_run(&run_id).await {
                Ok(Some(next_run_id)) => {
                    let Some(next_job) = self
                        .pending_assistant_runs
                        .lock()
                        .await
                        .remove(&next_run_id)
                    else {
                        return;
                    };
                    job = next_job;
                }
                Ok(None) => return,
                Err(err) => {
                    tracing::error!(run_id = %run_id, error = %err, "failed to advance session lane");
                    return;
                }
            }
        }
    }

    async fn execute_assistant_with_runtime(
        &self,
        run_id: &str,
        session_id: &str,
        conversation_id: &str,
        user_input: &str,
        ws_event_tx: Option<mpsc::Sender<WsStreamEvent>>,
        gateway_event_tx: Option<mpsc::Sender<StreamingEvent>>,
    ) -> Result<ChatResponse> {
        let (messages, persist_offset) = self
            .prepare_assistant_turn(conversation_id, user_input)
            .await?;

        let (internal_tx, internal_rx) = mpsc::channel(128);
        let runtime = self.runtime.clone();
        let run_id = run_id.to_owned();
        let conversation_id = conversation_id.to_owned();
        let run_id_for_events = run_id.clone();
        let conversation_id_for_events = conversation_id.clone();
        let ws_event_tx_clone = ws_event_tx.clone();
        let gateway_event_tx_clone = gateway_event_tx.clone();
        let forwarder = tokio::spawn(async move {
            forward_runtime_events(
                runtime,
                run_id_for_events,
                conversation_id_for_events,
                internal_rx,
                ws_event_tx_clone,
                gateway_event_tx_clone,
            )
            .await;
        });

        let tool_context = ToolExecutionContext {
            session_id: Some(session_id.to_owned()),
            conversation_id: Some(conversation_id.to_owned()),
            run_id: Some(run_id.clone()),
            delegation_depth: 0,
        };

        let effective_config = AgentConfig {
            thinking_level: self.effective_thinking_level(),
            ..self.config.clone()
        };
        let result = if ws_event_tx.is_some() || gateway_event_tx.is_some() {
            with_tool_execution_context(
                tool_context,
                run_react_loop_streaming(
                    self.provider.clone(),
                    self.tool_registry.clone(),
                    messages,
                    &effective_config,
                    internal_tx,
                ),
            )
            .await
        } else {
            with_tool_execution_context(
                tool_context,
                run_react_loop(
                    self.provider.clone(),
                    self.tool_registry.clone(),
                    messages,
                    &effective_config,
                    Some(internal_tx),
                ),
            )
            .await
        };

        let (response, all_messages) = result?;
        let _ = forwarder.await;
        self.persist_assistant_turn(
            conversation_id.as_str(),
            persist_offset,
            &all_messages,
            &response,
        )
        .await?;
        Ok(response)
    }

    async fn prepare_assistant_turn(
        &self,
        conversation_id: &str,
        user_input: &str,
    ) -> Result<(Vec<Message>, usize)> {
        let mut messages = self
            .conversation
            .get_messages(conversation_id)
            .await
            .unwrap_or_default();
        if messages.is_empty() {
            let _ = self
                .conversation
                .create_conversation_with_id(conversation_id, title_from(user_input))
                .await?;
        }

        // Always prepend the system message at position 0. It is never stored in
        // the DB (dynamic memory/soul files can change between turns), so it must
        // be reconstructed and injected fresh on every request.
        messages.insert(
            0,
            system_message(
                &self.config,
                self.memory.as_ref(),
                self.agent_manager.as_ref(),
                self.skill_manager.as_ref(),
                self.session_ctx.as_ref(),
            ),
        );

        let old_len = messages.len();
        let user_msg = user_message(user_input);
        self.conversation
            .save_message(conversation_id, &user_msg)
            .await?;
        self.maybe_ingest_message("conversation_message", &user_msg)
            .await;
        messages.push(user_msg);

        let mut injected_graph_context = false;
        if let Some(graph_message) = self
            .build_graph_context_message(user_input, Some(conversation_id))
            .await
        {
            messages.push(graph_message);
            injected_graph_context = true;
        }

        Ok((messages, old_len + 1 + usize::from(injected_graph_context)))
    }

    async fn persist_assistant_turn(
        &self,
        conversation_id: &str,
        persist_offset: usize,
        all_messages: &[Message],
        response: &ChatResponse,
    ) -> Result<()> {
        for message in all_messages.iter().skip(persist_offset) {
            self.conversation
                .save_message(conversation_id, message)
                .await?;
            self.maybe_ingest_message("conversation_message", message)
                .await;
        }
        self.persist_usage_metric(conversation_id, response).await;
        Ok(())
    }

    pub async fn poll_inbox(&self) -> Option<JobResult> {
        let mut rx = self.inbox_rx.lock().await;
        rx.try_recv().ok()
    }

    pub async fn list_conversations(&self) -> Result<Vec<rushdino_common::models::Conversation>> {
        self.conversation.list_conversations().await
    }

    pub async fn list_usage_metrics(
        &self,
        start: Option<&str>,
        end: Option<&str>,
        provider: Option<&str>,
        model: Option<&str>,
        conversation_id: Option<&str>,
        limit: i64,
    ) -> Result<Vec<crate::usage_metrics_store::UsageMetricRow>> {
        self.usage_metrics
            .list_usage(start, end, provider, model, conversation_id, limit)
            .await
    }

    pub async fn latest_usage_metric(
        &self,
        conversation_id: &str,
    ) -> Result<Option<crate::usage_metrics_store::UsageMetricSnapshot>> {
        self.usage_metrics
            .latest_usage_for_conversation(conversation_id)
            .await
    }

    pub async fn get_conversation_messages(&self, id: &str) -> Result<Vec<Message>> {
        self.conversation.get_messages(id).await
    }

    pub async fn delete_conversation(&self, id: &str) -> Result<()> {
        self.conversation.delete_conversation(id).await
    }

    pub async fn create_session(
        &self,
        title: &str,
    ) -> Result<rushdino_common::models::Conversation> {
        self.conversation.create_conversation(title).await
    }

    pub async fn get_session_record(
        &self,
        id: &str,
    ) -> Result<crate::conversation::ConversationRecord> {
        self.conversation.get_conversation_record(id).await
    }

    pub async fn archive_session(
        &self,
        id: &str,
    ) -> Result<crate::conversation::ConversationRecord> {
        self.conversation.archive_conversation(id).await
    }

    pub async fn reset_session(&self, id: &str) -> Result<()> {
        self.conversation.reset_conversation(id).await
    }

    pub fn config(&self) -> &AgentConfig {
        &self.config
    }

    /// Effective thinking level: override if set, otherwise static config.
    pub fn effective_thinking_level(&self) -> ThinkingLevel {
        self.thinking_level_override
            .read()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
            .unwrap_or_else(|| self.config.thinking_level.clone())
    }

    /// Expose the override Arc so it can be shared with RuntimeState.
    pub fn thinking_level_override_arc(&self) -> Arc<RwLock<Option<ThinkingLevel>>> {
        self.thinking_level_override.clone()
    }

    /// Replace the override Arc with an externally-managed shared one.
    /// Call immediately after construction to link the engine to RuntimeState.
    pub fn set_thinking_level_override_arc(&mut self, arc: Arc<RwLock<Option<ThinkingLevel>>>) {
        self.thinking_level_override = arc;
    }

    pub fn memory(&self) -> &MemoryManager {
        &self.memory
    }

    pub fn agent_manager(&self) -> &AgentManager {
        &self.agent_manager
    }

    pub fn skill_manager(&self) -> &crate::skill_manager::SkillManager {
        &self.skill_manager
    }

    pub fn tool_registry(&self) -> &ToolRegistry {
        &self.tool_registry
    }

    pub fn list_agent_templates(&self) -> Vec<AgentTemplate> {
        self.agent_manager.list()
    }

    pub fn get_agent_template(&self, name: &str) -> Option<AgentTemplate> {
        self.agent_manager.get(name)
    }

    pub fn delete_agent_template(&self, name: &str) -> Result<()> {
        self.agent_manager.delete(name)
    }

    pub fn list_skills(&self) -> Result<Vec<Skill>> {
        self.skill_manager.list()
    }

    pub fn save_skill(&self, skill: &Skill) -> Result<PathBuf> {
        self.skill_manager.save(skill)
    }

    pub fn delete_skill(&self, name: &str) -> Result<()> {
        self.skill_manager.delete(name)
    }

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
                    .complete_run(
                        job_id,
                        &run_id,
                        CronRunStatus::Ok,
                        Some("workflow run started"),
                        None,
                        None,
                        Some(&workflow_run.run_id),
                        Utc::now(),
                    )
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
                    .complete_run(
                        job_id,
                        &run_id,
                        CronRunStatus::Ok,
                        Some("agent turn completed"),
                        None,
                        Some(&conversation),
                        None,
                        Utc::now(),
                    )
                    .await?;
                Ok((updated, Some(conversation), None))
            }
        };

        if let Err(err) = &result {
            let _ = self
                .cron_manager
                .complete_run(
                    job_id,
                    &run_id,
                    CronRunStatus::Error,
                    None,
                    Some(&err.to_string()),
                    None,
                    None,
                    Utc::now(),
                )
                .await;
        }

        result
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
            Utc::now(),
        )
        .await
    }

    async fn maybe_ingest_message(&self, source_type: &str, message: &Message) {
        let Some(graph) = &self.knowledge_graph else {
            return;
        };
        if let Err(err) = graph
            .ingest_text(source_type, &message.id, &message.content)
            .await
        {
            tracing::debug!("knowledge graph ingest failed for {}: {err}", message.id);
        }
    }

    async fn persist_usage_metric(&self, conversation_id: &str, response: &ChatResponse) {
        let Some(usage) = response.usage.as_ref() else {
            return;
        };

        if let Err(err) = self
            .usage_metrics
            .insert_usage(
                conversation_id,
                &self.provider_name,
                self.provider.model(),
                usage,
            )
            .await
        {
            tracing::warn!("failed to persist usage metric: {err}");
        }
    }

    async fn build_graph_context_message(
        &self,
        user_input: &str,
        conversation_id: Option<&str>,
    ) -> Option<Message> {
        let graph = self.knowledge_graph.as_ref()?;
        let facts = graph
            .facts_for_prompt(user_input, conversation_id, 12)
            .await
            .ok()?;
        if facts.is_empty() {
            return None;
        }
        Some(Message {
            id: Uuid::new_v4().to_string(),
            role: Role::System,
            content: format!(
                "Local knowledge graph facts (do not reveal raw internals unless asked):\n{}",
                facts
                    .iter()
                    .map(|fact| format!("- {fact}"))
                    .collect::<Vec<_>>()
                    .join("\n")
            ),
            tool_calls: None,
            rich_content: None,
            created_at: Utc::now(),
        })
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

async fn forward_runtime_events(
    runtime: Arc<AgentRuntime>,
    run_id: String,
    conversation_id: String,
    mut internal_rx: mpsc::Receiver<StreamingEvent>,
    ws_event_tx: Option<mpsc::Sender<WsStreamEvent>>,
    gateway_event_tx: Option<mpsc::Sender<StreamingEvent>>,
) {
    while let Some(event) = internal_rx.recv().await {
        if let Some(gateway_event_tx) = gateway_event_tx.as_ref() {
            let _ = gateway_event_tx.send(event.clone()).await;
        }
        match event {
            StreamingEvent::ChatChunk(chunk) => {
                if let Some(ws_event_tx) = ws_event_tx.as_ref() {
                    let _ = ws_event_tx
                        .send(WsStreamEvent::ChatChunk {
                            run_id: run_id.clone(),
                            conversation_id: conversation_id.clone(),
                            chunk,
                        })
                        .await;
                }
            }
            StreamingEvent::AssistantReset => {
                if let Some(ws_event_tx) = ws_event_tx.as_ref() {
                    let _ = ws_event_tx
                        .send(WsStreamEvent::AssistantReset {
                            run_id: run_id.clone(),
                            conversation_id: conversation_id.clone(),
                        })
                        .await;
                }
            }
            StreamingEvent::ToolStart { tool_name, args } => {
                let _ = runtime
                    .mark_tool_started(
                        &run_id,
                        &tool_name,
                        Some(format!("Tool `{tool_name}` started execution.")),
                    )
                    .await;
                if let Some(ws_event_tx) = ws_event_tx.as_ref() {
                    let _ = ws_event_tx
                        .send(WsStreamEvent::ToolStart {
                            run_id: run_id.clone(),
                            conversation_id: conversation_id.clone(),
                            tool_name,
                            args,
                        })
                        .await;
                }
            }
            StreamingEvent::ToolEnd {
                tool_name,
                result,
                is_error,
            } => {
                let _ = runtime
                    .mark_tool_finished(
                        &run_id,
                        &tool_name,
                        is_error,
                        if is_error {
                            format!("Tool `{tool_name}` returned an error.")
                        } else {
                            format!("Tool `{tool_name}` completed.")
                        },
                    )
                    .await;
                if let Some(ws_event_tx) = ws_event_tx.as_ref() {
                    let _ = ws_event_tx
                        .send(WsStreamEvent::ToolEnd {
                            run_id: run_id.clone(),
                            conversation_id: conversation_id.clone(),
                            tool_name,
                            result,
                            is_error,
                        })
                        .await;
                }
            }
        }
    }
}
