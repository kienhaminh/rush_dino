use std::{
    collections::HashMap,
    sync::{Arc, RwLock},
};

use tokio::sync::{mpsc, oneshot, Mutex};

use rushdino_common::{config::AuthMethod, models::Message, models::Role, Result, RichContent};
use rushdino_providers::{types::ChatChunk, types::ChatResponse, types::ThinkingLevel, Provider};
use serde_json::Value;
use uuid::Uuid;

use crate::{
    agent_manager::AgentManager,
    conversation::ConversationManager,
    cron_manager::CronManager,
    engine_deps::build_engine_deps,
    knowledge_graph::KnowledgeGraphAccess,
    memory::MemoryManager,
    react_loop::StreamingEvent,
    runtime::{AgentRuntime, RunSnapshot},
    tool_registry::{SessionToolContext, ToolRegistry},
    usage_metrics_store::UsageMetricsStore,
    workflow_manager::WorkflowManager,
    workflow_runner::WorkflowRunner,
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
    /// Delay in milliseconds between react loop iterations (after tool execution,
    /// before the next LLM call). Prevents rapid-fire tool cycling.
    pub turn_delay_ms: u64,
}

impl Default for AgentConfig {
    fn default() -> Self {
        Self {
            max_iterations: 10,
            max_context_tokens: 200_000,
            tool_timeout_secs: 30,
            model_override: None,
            system_prompt: "You are RushDino, a local-first AI agent.".to_owned(),
            thinking_level: ThinkingLevel::Medium,
            bootstrap_max_chars: crate::memory_bootstrap::DEFAULT_BOOTSTRAP_MAX_CHARS,
            bootstrap_total_max_chars: crate::memory_bootstrap::DEFAULT_BOOTSTRAP_TOTAL_MAX_CHARS,
            turn_delay_ms: 500,
        }
    }
}

pub struct AgentEngine {
    pub(crate) provider: Arc<Provider>,
    pub(crate) conversation: Arc<ConversationManager>,
    pub tool_registry: Arc<ToolRegistry>,
    pub(crate) memory: Arc<MemoryManager>,
    pub(crate) skill_manager: Arc<crate::skill_manager::SkillManager>,
    pub(crate) agent_manager: Arc<AgentManager>,
    pub(crate) workflow_manager: Arc<WorkflowManager>,
    pub(crate) kanban_store: Arc<crate::kanban_store::KanbanStore>,
    pub(crate) cron_manager: Arc<CronManager>,
    pub(crate) workflow_runner: Arc<WorkflowRunner>,
    pub(crate) usage_metrics: Arc<UsageMetricsStore>,
    pub(crate) provider_name: String,
    pub(crate) auth_method: AuthMethod,
    pub(crate) knowledge_graph: Option<Arc<dyn KnowledgeGraphAccess>>,
    pub(crate) session_ctx: Arc<SessionToolContext>,
    pub(crate) health_store: Arc<crate::agent_health_store::AgentHealthStore>,
    pub(crate) message_store: Arc<crate::agent_message_store::AgentMessageStore>,
    pub(crate) config: AgentConfig,
    /// Shared runtime override — same Arc as RuntimeState.thinking_level_override.
    pub(crate) thinking_level_override: Arc<RwLock<Option<ThinkingLevel>>>,
    pub(crate) runtime: Arc<AgentRuntime>,
    pub(crate) pending_assistant_runs: Arc<Mutex<HashMap<String, AssistantRunJob>>>,
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
    /// Wraps an inner event from a delegated agent, carrying metadata so the
    /// frontend can route it to the correct nested timeline.
    DelegateEvent {
        delegate_conversation_id: String,
        agent_name: String,
        delegation_depth: u8,
        inner: Box<WsStreamEvent>,
    },
}

pub(crate) struct AssistantRunJob {
    pub(crate) run_id: String,
    pub(crate) session_id: String,
    pub(crate) conversation_id: String,
    pub(crate) user_input: String,
    pub(crate) ws_event_tx: Option<mpsc::Sender<WsStreamEvent>>,
    pub(crate) gateway_event_tx: Option<mpsc::Sender<StreamingEvent>>,
    pub(crate) completion_tx: Option<oneshot::Sender<std::result::Result<ChatResponse, String>>>,
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
    fn default_thinking_level_is_medium() {
        let config = AgentConfig::default();
        assert_eq!(config.thinking_level, ThinkingLevel::Medium);
    }

    #[test]
    fn default_context_budget_is_large_enough_for_longer_conversations() {
        let config = AgentConfig::default();
        assert_eq!(config.max_context_tokens, 200_000);
    }

    // Note: constructing AgentEngine in a unit test requires the full dependency graph
    // (provider, DB pool, etc.), which is impractical here. This test verifies the
    // override→fallback logic pattern that effective_thinking_level() implements.
    #[test]
    fn thinking_level_override_logic_prefers_override_over_config() {
        let config = AgentConfig::default(); // default is ThinkingLevel::Medium
        let override_arc: Arc<RwLock<Option<ThinkingLevel>>> = Arc::new(RwLock::new(None));

        // No override → falls back to config
        let effective = override_arc
            .read()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
            .unwrap_or_else(|| config.thinking_level.clone());
        assert_eq!(effective, ThinkingLevel::Medium);

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
        assert_eq!(effective, ThinkingLevel::Medium);
    }
}

impl AgentEngine {
    pub fn new(
        input: crate::engine_deps::EngineBuildInput,
        provider_name: String,
        auth_method: AuthMethod,
    ) -> Result<Self> {
        let provider = input.provider.clone();
        let knowledge_graph = input.knowledge_graph.clone();
        let config = input.config.clone();
        let runtime = input.runtime.clone();
        let deps = build_engine_deps(input)?;

        let usage_metrics = Arc::new(UsageMetricsStore::new(deps.pool.clone()));

        // Start the kanban dispatcher background loop. It polls the backlog and
        // auto-executes matched tasks using isolated react loops.
        let dispatcher = Arc::new(crate::kanban_dispatcher::KanbanDispatcher {
            store: deps.kanban_store.clone(),
            agent_manager: deps.agent_manager.clone(),
            provider: provider.clone(),
            config: config.clone(),
            registry: Arc::downgrade(&deps.tool_registry),
            session_ctx: Arc::downgrade(&deps.session_ctx),
            memory: deps.memory.clone(),
            skill_manager: deps.skill_manager.clone(),
            conversation: deps.conversation.clone(),
            task_memory: deps.task_memory.clone(),
            health_store: deps.health_store.clone(),
            home_dir: deps.home_dir.clone(),
            broadcast_tx: deps.broadcast_tx.clone(),
            task_notify: deps.task_notify.clone(),
        });
        dispatcher.start();

        Ok(Self {
            provider,
            conversation: deps.conversation,
            tool_registry: deps.tool_registry,
            memory: deps.memory,
            skill_manager: deps.skill_manager,
            agent_manager: deps.agent_manager,
            workflow_manager: deps.workflow_manager,
            kanban_store: deps.kanban_store,
            cron_manager: deps.cron_manager,
            workflow_runner: deps.workflow_runner,
            usage_metrics,
            provider_name,
            auth_method,
            knowledge_graph,
            session_ctx: deps.session_ctx,
            health_store: deps.health_store,
            message_store: deps.message_store,
            config,
            thinking_level_override: Arc::new(RwLock::new(None)),
            runtime,
            pending_assistant_runs: Arc::new(Mutex::new(HashMap::new())),
        })
    }

    pub(crate) async fn maybe_ingest_message(&self, source_type: &str, message: &Message) {
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

    pub(crate) async fn persist_usage_metric(&self, conversation_id: &str, response: &ChatResponse) {
        let Some(usage) = response.usage.as_ref() else {
            return;
        };

        let auth_method_db = match self.auth_method {
            AuthMethod::ApiKey => "apikey",
            AuthMethod::OAuth => "oauth",
            AuthMethod::None => "none",
        };

        if let Err(err) = self
            .usage_metrics
            .insert_usage(
                conversation_id,
                &self.provider_name,
                self.provider.model(),
                auth_method_db,
                usage,
            )
            .await
        {
            tracing::warn!("failed to persist usage metric: {err}");
        }
    }

    pub(crate) async fn build_graph_context_message(
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
        Some(Message::new(
            Uuid::new_v4().to_string(),
            Role::System,
            format!(
                "Local knowledge graph facts (do not reveal raw internals unless asked):\n{}",
                facts
                    .iter()
                    .map(|fact| format!("- {fact}"))
                    .collect::<Vec<_>>()
                    .join("\n")
            ),
        ))
    }

}
