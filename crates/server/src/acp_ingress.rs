use std::sync::Arc;

use async_trait::async_trait;

use rushdino_acp::{agent_registry::known_agents, CodingAgentManager};
use rushdino_common::{Result, RichContent};
use rushdino_gateway::{
    GatewayIngressPolicy, IncomingMessage, IngressBlockResponse, IngressDecision,
};

use crate::chat_broadcast::ChatBroadcastHub;

/// Chains two ingress policies: evaluates `first`, then `second` if the first allows.
pub struct CompositeIngressPolicy {
    first: Arc<dyn GatewayIngressPolicy>,
    second: Arc<dyn GatewayIngressPolicy>,
}

impl CompositeIngressPolicy {
    pub fn new(
        first: Arc<dyn GatewayIngressPolicy>,
        second: Arc<dyn GatewayIngressPolicy>,
    ) -> Self {
        Self { first, second }
    }
}

#[async_trait]
impl GatewayIngressPolicy for CompositeIngressPolicy {
    async fn evaluate(&self, msg: &IncomingMessage) -> Result<IngressDecision> {
        match self.first.evaluate(msg).await? {
            IngressDecision::Allow => self.second.evaluate(msg).await,
            block => Ok(block),
        }
    }
}

/// Intercepts slash commands like `/claude <task>`, `/codex <task>`, `/gemini <task>`
/// and routes them directly to the `CodingAgentManager`, streaming token events through
/// the `ChatBroadcastHub` instead of the normal agent engine.
pub struct AcpSlashCommandPolicy {
    manager: Arc<CodingAgentManager>,
    chat_broadcast: Arc<ChatBroadcastHub>,
}

impl AcpSlashCommandPolicy {
    pub fn new(manager: Arc<CodingAgentManager>, chat_broadcast: Arc<ChatBroadcastHub>) -> Self {
        Self {
            manager,
            chat_broadcast,
        }
    }
}

#[async_trait]
impl GatewayIngressPolicy for AcpSlashCommandPolicy {
    async fn evaluate(&self, msg: &IncomingMessage) -> Result<IngressDecision> {
        let text = msg.text.trim();

        // Try to match any registered slash command prefix.
        let matched = known_agents().iter().find_map(|desc| {
            let prefix = desc.slash_command; // e.g. "/claude"
            let with_space = format!("{prefix} ");
            if text.starts_with(with_space.as_str()) {
                let task = text[with_space.len()..].trim().to_owned();
                if !task.is_empty() {
                    return Some((desc.id, task));
                }
            }
            None
        });

        let Some((agent_id, task)) = matched else {
            return Ok(IngressDecision::Allow);
        };

        // Spawn the ACP session in the background; return an immediate "working on it" reply.
        let manager = self.manager.clone();
        let chat_broadcast = self.chat_broadcast.clone();
        let conversation_id = msg.sender_id.clone();
        let agent_id_owned = agent_id.to_owned();

        tokio::spawn(async move {
            let result = async {
                let session = manager
                    .spawn_session(&agent_id_owned, &conversation_id, None)
                    .await?;
                manager.send_prompt(&session.id, &task, true).await
            }
            .await;

            match result {
                Ok(final_text) => {
                    // Broadcast final message so the WS chat and gateway pick it up.
                    chat_broadcast.broadcast_assistant_message(
                        &format!("acp-{agent_id_owned}"),
                        &conversation_id,
                        &final_text,
                        None,
                    );
                }
                Err(e) => {
                    tracing::warn!("ACP slash-command session error: {e}");
                    chat_broadcast.broadcast_assistant_message(
                        &format!("acp-{agent_id_owned}"),
                        &conversation_id,
                        &format!("❌ ACP error: {e}"),
                        None,
                    );
                }
            }
        });

        Ok(IngressDecision::Block {
            reason: format!("acp slash command intercepted for agent {agent_id}"),
            response: Some(IngressBlockResponse {
                recipient: msg.reply_target.clone(),
                message: RichContent::plain_text(format!(
                    "Working on it with {agent_id}..."
                )),
            }),
        })
    }
}
