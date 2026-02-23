use std::{path::PathBuf, sync::Arc};

use sqlx::SqlitePool;
use tokio::sync::{mpsc, Mutex};

use rushdino_common::{models::Message, Result};
use rushdino_providers::{types::ChatChunk, types::ChatResponse, Provider};

use crate::{
    conversation::ConversationManager,
    engine_bootstrap::{build_engine_deps, system_message, title_from, user_message},
    job_manager::{JobManager, JobResult},
    memory::MemoryManager,
    orchestrator::Orchestrator,
    react_loop::run_react_loop,
    tool_registry::ToolRegistry,
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
    config: AgentConfig,
    inbox_rx: Arc<Mutex<mpsc::Receiver<JobResult>>>,
}

impl AgentEngine {
    pub fn new(
        provider: Arc<Provider>,
        pool: Arc<SqlitePool>,
        home_dir: PathBuf,
        brave_api_key: Option<String>,
        config: AgentConfig,
    ) -> Result<Self> {
        let deps = build_engine_deps(
            provider.clone(),
            pool,
            home_dir,
            brave_api_key,
            &config,
        )?;

        Ok(Self {
            provider,
            conversation: deps.conversation,
            tool_registry: deps.tool_registry,
            _job_manager: deps.job_manager,
            _orchestrator: deps.orchestrator,
            memory: deps.memory,
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
            messages.push(system_message(&self.config, self.memory.as_ref()));
        }

        let old_len = messages.len();
        let user_msg = user_message(user_input);
        self.conversation
            .save_message(conversation_id, &user_msg)
            .await?;
        messages.push(user_msg);

        let (response, all_messages) = run_react_loop(
            self.provider.clone(),
            self.tool_registry.clone(),
            messages,
            &self.config,
        )
        .await?;

        for message in all_messages.iter().skip(old_len + 1) {
            self.conversation.save_message(conversation_id, message).await?;
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
}
