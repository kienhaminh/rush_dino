use std::{path::PathBuf, sync::Arc};

use sqlx::SqlitePool;
use tokio::sync::{mpsc, Mutex};

use chrono::Utc;
use rushdino_common::{models::Message, models::Role, Result};
use rushdino_providers::{types::ChatChunk, types::ChatResponse, Provider};
use uuid::Uuid;

use crate::{
    agent_manager::{AgentManager, AgentTemplate},
    agent_progress::{build_lanes_from_conversation_store, AgentProgressLane},
    conversation::ConversationManager,
    engine_bootstrap::{build_engine_deps, system_message, title_from, user_message},
    job_manager::{JobManager, JobResult},
    knowledge_graph::KnowledgeGraphAccess,
    memory::MemoryManager,
    orchestrator::Orchestrator,
    react_loop::{run_react_loop, run_react_loop_streaming, StreamingEvent},
    tool_registry::ToolRegistry,
    tools::shell_exec::{with_tool_execution_context, ToolApproval, ToolExecutionContext},
    workflow_manager::WorkflowManager,
    workflow_runner::WorkflowRunner,
    workflow_types::{
        CreateWorkflowInput, UpdateWorkflowInput, WorkflowDetail, WorkflowListItem, WorkflowRunDetail,
        WorkflowRunListItem, WorkflowRunStartResponse, WorkflowSource, WorkflowStepInput,
    },
};

#[derive(Debug, Clone)]
pub struct AgentConfig {
    pub max_iterations: usize,
    pub max_context_tokens: usize,
    pub tool_timeout_secs: u64,
    pub system_prompt: String,
}

impl Default for AgentConfig {
    fn default() -> Self {
        Self {
            max_iterations: 10,
            max_context_tokens: 4096,
            tool_timeout_secs: 30,
            system_prompt: "You are RushDino, a local-first AI agent.".to_owned(),
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
    agent_manager: Arc<AgentManager>,
    workflow_manager: Arc<WorkflowManager>,
    workflow_runner: Arc<WorkflowRunner>,
    knowledge_graph: Option<Arc<dyn KnowledgeGraphAccess>>,
    config: AgentConfig,
    inbox_rx: Arc<Mutex<mpsc::Receiver<JobResult>>>,
}

#[derive(Debug, Clone)]
pub enum WsStreamEvent {
    ChatChunk(ChatChunk),
    AssistantReset,
}

impl AgentEngine {
    pub fn new(
        provider: Arc<Provider>,
        pool: Arc<SqlitePool>,
        home_dir: PathBuf,
        brave_api_key: Option<String>,
        config: AgentConfig,
        approval: Option<Arc<dyn ToolApproval>>,
        knowledge_graph: Option<Arc<dyn KnowledgeGraphAccess>>,
    ) -> Result<Self> {
        let deps = build_engine_deps(
            provider.clone(),
            pool,
            home_dir,
            brave_api_key,
            &config,
            approval,
            knowledge_graph.clone(),
        )?;

        let workflow_runner = Arc::new(WorkflowRunner::new(
            provider.clone(),
            deps.tool_registry.clone(),
            deps.conversation.clone(),
            deps.memory.clone(),
            deps.agent_manager.clone(),
            deps.workflow_manager.clone(),
            config.clone(),
        ));

        Ok(Self {
            provider,
            conversation: deps.conversation,
            tool_registry: deps.tool_registry,
            _job_manager: deps.job_manager,
            _orchestrator: deps.orchestrator,
            memory: deps.memory,
            agent_manager: deps.agent_manager,
            workflow_manager: deps.workflow_manager,
            workflow_runner,
            knowledge_graph,
            config,
            inbox_rx: Arc::new(Mutex::new(deps.inbox_rx)),
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

        if messages.is_empty() {
            messages.push(system_message(&self.config, self.memory.as_ref(), self.agent_manager.as_ref()));
        }

        let old_len = messages.len();
        let user_msg = user_message(user_input);
        self.conversation
            .save_message(conversation_id, &user_msg)
            .await?;
        self.maybe_ingest_message("conversation_message", &user_msg).await;
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
            delegation_depth: 0,
        };
        let (response, all_messages) = with_tool_execution_context(
            context,
            run_react_loop(
                self.provider.clone(),
                self.tool_registry.clone(),
                messages,
                &self.config,
            ),
        )
        .await?;

        let persist_offset = old_len + 1 + usize::from(injected_graph_context);
        for message in all_messages.iter().skip(persist_offset) {
            self.conversation.save_message(conversation_id, message).await?;
            self.maybe_ingest_message("conversation_message", message).await;
        }

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
                })
                .await;
            let _ = tx
                .send(ChatChunk {
                    delta: String::new(),
                    tool_calls: Vec::new(),
                    done: true,
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

        if messages.is_empty() {
            messages.push(system_message(&self.config, self.memory.as_ref(), self.agent_manager.as_ref()));
        }

        let old_len = messages.len();
        let user_msg = user_message(user_input);
        self.conversation
            .save_message(&conversation_id, &user_msg)
            .await?;
        self.maybe_ingest_message("conversation_message", &user_msg).await;
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
        tokio::spawn(async move {
            while let Some(event) = internal_rx.recv().await {
                let ws_event = match event {
                    StreamingEvent::ChatChunk(chunk) => WsStreamEvent::ChatChunk(chunk),
                    StreamingEvent::AssistantReset => WsStreamEvent::AssistantReset,
                };
                if event_forward_tx.send(ws_event).await.is_err() {
                    break;
                }
            }
        });

        let context = ToolExecutionContext {
            session_id: Some(session_id.to_owned()),
            conversation_id: Some(conversation_id.clone()),
            delegation_depth: 0,
        };

        let (_, all_messages) = with_tool_execution_context(
            context,
            run_react_loop_streaming(
                self.provider.clone(),
                self.tool_registry.clone(),
                messages,
                &self.config,
                internal_tx,
            ),
        )
        .await?;

        let persist_offset = old_len + 1 + usize::from(injected_graph_context);
        for message in all_messages.iter().skip(persist_offset) {
            self.conversation
                .save_message(&conversation_id, message)
                .await?;
            self.maybe_ingest_message("conversation_message", message).await;
        }

        Ok(conversation_id)
    }

    pub async fn poll_inbox(&self) -> Option<JobResult> {
        let mut rx = self.inbox_rx.lock().await;
        rx.try_recv().ok()
    }

    pub async fn list_conversations(&self) -> Result<Vec<rushdino_common::models::Conversation>> {
        self.conversation.list_conversations().await
    }

    pub async fn get_conversation_messages(&self, id: &str) -> Result<Vec<Message>> {
        self.conversation.get_messages(id).await
    }

    pub async fn delete_conversation(&self, id: &str) -> Result<()> {
        self.conversation.delete_conversation(id).await
    }

    pub fn list_agent_templates(&self) -> Vec<AgentTemplate> {
        self.agent_manager.list()
    }

    pub fn get_agent_template(&self, name: &str) -> Option<AgentTemplate> {
        self.agent_manager.get(name)
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

    pub async fn update_workflow(&self, id: &str, payload: UpdateWorkflowInput) -> Result<WorkflowDetail> {
        if let Some(steps) = payload.steps.as_ref() {
            self.validate_workflow_agents(steps)?;
        }
        self.workflow_manager.update_workflow(id, payload).await
    }

    pub async fn delete_workflow(&self, id: &str) -> Result<()> {
        self.workflow_manager.delete_workflow(id).await
    }

    pub async fn start_workflow_run(
        &self,
        workflow_id: &str,
        triggered_by: &str,
        run_input: &str,
    ) -> Result<WorkflowRunStartResponse> {
        let run = self
            .workflow_manager
            .create_run(workflow_id, triggered_by, run_input)
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
        if let Err(err) = graph.ingest_text(source_type, &message.id, &message.content).await {
            tracing::debug!("knowledge graph ingest failed for {}: {err}", message.id);
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
