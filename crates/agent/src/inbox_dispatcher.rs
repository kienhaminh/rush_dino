//! Background worker that auto-processes pending inter-agent inbox messages.

use std::{
    path::PathBuf,
    sync::{Arc, Weak},
    time::Duration,
};

use chrono::Utc;
use tokio::time;
use uuid::Uuid;

use rushdino_common::{
    models::{Message, Role},
    AppError, Result,
};
use rushdino_providers::Provider;

use crate::{
    agent_manager::AgentManager,
    agent_message_store::{AgentMessage, AgentMessageState, AgentMessageStore},
    agent_task_memory::AgentTaskMemory,
    conversation::ConversationManager,
    engine::AgentConfig,
    react_loop::run_react_loop,
    tool_registry::{SessionToolContext, ToolRegistry},
    tools::{
        bash::{with_tool_execution_context, ToolExecutionContext},
        delegate_to_agent::parse_tool_list,
    },
};

pub const HEARTBEAT_INTERVAL_SECS: u64 = 15;

pub struct InboxDispatcher {
    pub store: Arc<AgentMessageStore>,
    pub agent_manager: Arc<AgentManager>,
    pub provider: Arc<Provider>,
    pub config: AgentConfig,
    pub registry: Weak<ToolRegistry>,
    pub session_ctx: Weak<SessionToolContext>,
    pub conversation: Arc<ConversationManager>,
    pub task_memory: Arc<AgentTaskMemory>,
    pub home_dir: PathBuf,
    pub message_notify: Arc<tokio::sync::Notify>,
}

impl InboxDispatcher {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        store: Arc<AgentMessageStore>,
        agent_manager: Arc<AgentManager>,
        provider: Arc<Provider>,
        config: AgentConfig,
        registry: Weak<ToolRegistry>,
        session_ctx: Weak<SessionToolContext>,
        conversation: Arc<ConversationManager>,
        task_memory: Arc<AgentTaskMemory>,
        home_dir: PathBuf,
        message_notify: Arc<tokio::sync::Notify>,
    ) -> Self {
        Self {
            store,
            agent_manager,
            provider,
            config,
            registry,
            session_ctx,
            conversation,
            task_memory,
            home_dir,
            message_notify,
        }
    }

    pub fn start(self: Arc<Self>) {
        tokio::spawn(async move {
            let mut heartbeat = time::interval(Duration::from_secs(HEARTBEAT_INTERVAL_SECS));
            loop {
                tokio::select! {
                    _ = self.message_notify.notified() => {}
                    _ = heartbeat.tick() => {}
                }
                if let Err(e) = self.poll_once().await {
                    tracing::warn!(error = %e, "inbox dispatcher poll error");
                }
            }
        });
    }

    async fn poll_once(&self) -> Result<()> {
        let inbox_agents: Vec<_> = self
            .agent_manager
            .list()
            .into_iter()
            .filter(|agent| agent.inbox_enabled)
            .collect();

        for agent in inbox_agents {
            while let Some(message) = self.store.claim_next_pending(&agent.name).await? {
                if let Err(err) = self.process_message(&agent.name, message.clone()).await {
                    self.store
                        .mark_failed(&message.id, &err.to_string())
                        .await?;
                    tracing::warn!(
                        agent = %agent.name,
                        message_id = %message.id,
                        error = %err,
                        "inbox message processing failed"
                    );
                }
            }
        }

        Ok(())
    }

    async fn process_message(&self, agent_name: &str, message: AgentMessage) -> Result<()> {
        let template = self
            .agent_manager
            .get(agent_name)
            .ok_or_else(|| AppError::Agent(format!("unknown agent: {agent_name}")))?;
        let registry = self
            .registry
            .upgrade()
            .ok_or_else(|| AppError::Agent("tool registry unavailable".to_owned()))?;
        let session_ctx = self
            .session_ctx
            .upgrade()
            .ok_or_else(|| AppError::Agent("session context unavailable".to_owned()))?;

        let allowed = parse_tool_list(&template.tools);
        let scoped_ctx: Arc<SessionToolContext> = if allowed.is_empty() {
            session_ctx.clone()
        } else {
            let refs: Vec<&str> = allowed.iter().map(String::as_str).collect();
            Arc::new(SessionToolContext::scoped(session_ctx.pool_tools(), &refs))
        };

        let child_config = if template.model.is_some() {
            AgentConfig {
                model_override: template.model.clone(),
                ..self.config.clone()
            }
        } else {
            self.config.clone()
        };

        let agent_workspace = self
            .home_dir
            .join("agents")
            .join(agent_name)
            .join("workspace");
        std::fs::create_dir_all(&agent_workspace)
            .map_err(|e| AppError::Agent(format!("failed to create agent workspace: {e}")))?;

        let conv_id = Uuid::new_v4().to_string();
        let conv_title = format!("{agent_name}: inbox reply");
        self.conversation
            .create_agent_conversation(&conv_id, &conv_title)
            .await?;

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

        let user_content = format!(
            "You received an inter-agent inbox message.\n\n\
             From: {}\n\
             Message ID: {}\n\
             Received At: {}\n\n\
             Message:\n{}\n\n\
             Reply directly to the sender. Be concise unless the message asks for detail.",
            message.from_agent, message.id, message.created_at, message.content
        );

        let sys_msg = Message {
            id: Uuid::new_v4().to_string(),
            role: Role::System,
            content: system_content,
            tool_calls: None,
            rich_content: None,
            thinking: None,
            created_at: Utc::now(),
        };
        let user_msg = Message {
            id: Uuid::new_v4().to_string(),
            role: Role::User,
            content: user_content.clone(),
            tool_calls: None,
            rich_content: None,
            thinking: None,
            created_at: Utc::now(),
        };

        self.conversation.save_message(&conv_id, &sys_msg).await?;
        self.conversation.save_message(&conv_id, &user_msg).await?;

        let child_ctx = ToolExecutionContext {
            session_id: Some(conv_id.clone()),
            conversation_id: Some(conv_id.clone()),
            run_id: None,
            delegation_depth: 0,
            workspace_override: Some(agent_workspace),
            parent_context: Some(format!(
                "Inbox message from {} ({})",
                message.from_agent, message.id
            )),
            ws_event_tx: None,
        };

        let (response, all_messages, _timing) = with_tool_execution_context(
            child_ctx,
            run_react_loop(
                self.provider.clone(),
                registry,
                scoped_ctx,
                vec![sys_msg, user_msg],
                &child_config,
                None,
                None,
            ),
        )
        .await?;

        for conversation_message in all_messages.iter().skip(2) {
            if let Err(e) = self
                .conversation
                .save_message(&conv_id, conversation_message)
                .await
            {
                tracing::warn!(
                    agent = agent_name,
                    conv_id = %conv_id,
                    error = %e,
                    "failed to persist inbox conversation message"
                );
            }
        }

        self.store.mark_processed(&message.id).await?;
        self.store
            .send(
                agent_name,
                &message.from_agent,
                &response.content,
                AgentMessageState::Processed,
                Some(&message.id),
            )
            .await?;

        if let Err(e) = self
            .task_memory
            .append_task(agent_name, &user_content, &response.content)
        {
            tracing::warn!(agent = agent_name, error = %e, "failed to write inbox task log");
        }

        if let Err(e) = self.conversation.archive_conversation(&conv_id).await {
            tracing::warn!(
                agent = agent_name,
                conv_id = %conv_id,
                error = %e,
                "failed to archive inbox conversation"
            );
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use std::{fs, str::FromStr, sync::Arc};

    use rushdino_providers::{CompletionsProvider, Provider};
    use sqlx::sqlite::SqliteConnectOptions;
    use sqlx::SqlitePool;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    use crate::{
        agent_manager::AgentManager,
        agent_message_store::{AgentMessageState, AgentMessageStore},
        agent_task_memory::AgentTaskMemory,
        conversation::ConversationManager,
        engine::AgentConfig,
        tool_registry::{SessionToolContext, ToolRegistry},
    };

    use super::InboxDispatcher;

    async fn spawn_sse_provider(response_text: &str) -> Arc<Provider> {
        let sse_body = format!(
            concat!(
                "data: {{\"id\":\"x\",\"object\":\"chat.completion.chunk\",\"choices\":[{{\"index\":0,\"delta\":{{\"content\":\"{}\"}},\"finish_reason\":null}}]}}\n\n",
                "data: {{\"id\":\"x\",\"object\":\"chat.completion.chunk\",\"choices\":[{{\"index\":0,\"delta\":{{}},\"finish_reason\":\"stop\"}}]}}\n\n",
                "data: [DONE]\n\n"
            ),
            response_text
        );
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        tokio::spawn(async move {
            let (mut stream, _) = listener.accept().await.unwrap();
            let mut buf = vec![0u8; 8192];
            let _ = stream.read(&mut buf).await;
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                sse_body.len(),
                sse_body
            );
            stream.write_all(response.as_bytes()).await.unwrap();
        });

        Arc::new(Provider::Ollama(CompletionsProvider::new(
            format!("http://127.0.0.1:{port}"),
            "mock-model".to_owned(),
            None,
            Some("ollama".to_owned()),
        )))
    }

    async fn make_pool() -> Arc<SqlitePool> {
        let opts = SqliteConnectOptions::from_str("sqlite::memory:")
            .unwrap()
            .foreign_keys(true);
        let pool = Arc::new(SqlitePool::connect_with(opts).await.unwrap());
        rushdino_common::db::run_migrations(&pool).await.unwrap();
        pool
    }

    fn write_agent(dir: &std::path::Path, name: &str, inbox_enabled: bool) {
        let content = format!(
            "---\nname: {name}\ndescription: test agent\ntools: read, write, agent_inbox\ninbox_enabled: {inbox_enabled}\n---\n\nYou are {name}. Reply briefly."
        );
        fs::write(dir.join(format!("{name}.md")), content).unwrap();
    }

    #[tokio::test]
    async fn poll_once_processes_pending_writer_message_and_creates_reply() {
        let pool = make_pool().await;
        let temp_dir =
            std::env::temp_dir().join(format!("inbox-dispatcher-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&temp_dir).unwrap();
        write_agent(&temp_dir, "writer", true);

        let store = Arc::new(AgentMessageStore::new(pool.clone()));
        let original = store
            .send(
                "main",
                "writer",
                "Reply with 'da nhan'.",
                AgentMessageState::Pending,
                None,
            )
            .await
            .unwrap();

        let registry = Arc::new(ToolRegistry::new());
        let session_ctx = Arc::new(SessionToolContext::new(vec![]));
        let dispatcher = InboxDispatcher::new(
            store.clone(),
            Arc::new(AgentManager::new(temp_dir.clone())),
            spawn_sse_provider("da nhan").await,
            AgentConfig::default(),
            Arc::downgrade(&registry),
            Arc::downgrade(&session_ctx),
            Arc::new(ConversationManager::new(pool.clone())),
            Arc::new(AgentTaskMemory::new(temp_dir.clone())),
            temp_dir.clone(),
            Arc::new(tokio::sync::Notify::new()),
        );

        dispatcher.poll_once().await.unwrap();

        let source = store.get(&original.id).await.unwrap().unwrap();
        assert_eq!(source.state, AgentMessageState::Processed);

        let all = store.list_all(10).await.unwrap();
        let reply = all
            .iter()
            .find(|message| message.reply_to_message_id.as_deref() == Some(original.id.as_str()))
            .expect("reply row should exist");
        assert_eq!(reply.from_agent, "writer");
        assert_eq!(reply.to_agent, "main");
        assert_eq!(reply.content, "da nhan");
        assert_eq!(reply.state, AgentMessageState::Processed);

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[tokio::test]
    async fn poll_once_marks_failures_without_duplicate_reply() {
        let pool = make_pool().await;
        let temp_dir =
            std::env::temp_dir().join(format!("inbox-dispatcher-fail-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&temp_dir).unwrap();
        write_agent(&temp_dir, "writer", true);

        let store = Arc::new(AgentMessageStore::new(pool.clone()));
        let original = store
            .send(
                "main",
                "writer",
                "Reply to this.",
                AgentMessageState::Pending,
                None,
            )
            .await
            .unwrap();

        let dispatcher = InboxDispatcher::new(
            store.clone(),
            Arc::new(AgentManager::new(temp_dir.clone())),
            Arc::new(Provider::Ollama(CompletionsProvider::new(
                "http://127.0.0.1:0".to_owned(),
                "mock-model".to_owned(),
                None,
                Some("ollama".to_owned()),
            ))),
            AgentConfig::default(),
            std::sync::Weak::new(),
            std::sync::Weak::new(),
            Arc::new(ConversationManager::new(pool.clone())),
            Arc::new(AgentTaskMemory::new(temp_dir.clone())),
            temp_dir.clone(),
            Arc::new(tokio::sync::Notify::new()),
        );

        dispatcher.poll_once().await.unwrap();

        let source = store.get(&original.id).await.unwrap().unwrap();
        assert_eq!(source.state, AgentMessageState::Failed);
        assert!(source.failure_reason.is_some());

        let replies: Vec<_> = store
            .list_all(10)
            .await
            .unwrap()
            .into_iter()
            .filter(|message| message.reply_to_message_id.as_deref() == Some(original.id.as_str()))
            .collect();
        assert!(
            replies.is_empty(),
            "failed processing should not emit a reply row"
        );

        let _ = fs::remove_dir_all(&temp_dir);
    }
}
