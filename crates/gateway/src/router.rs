use std::{collections::HashMap, sync::Arc};

use tokio::sync::mpsc;

use rushdino_agent::AgentEngine;

use crate::{
    adapter::ChannelAdapter,
    message::{IncomingMessage, OutgoingMessage},
    session::SessionManager,
};

/// Receives IncomingMessages from all channel adapters, resolves or creates
/// a session, forwards the message to the AgentEngine, and sends the response
/// back via the originating channel adapter.
pub struct Router {
    session_manager: Arc<SessionManager>,
    engine: Arc<AgentEngine>,
    adapters: Arc<HashMap<String, Arc<dyn ChannelAdapter>>>,
}

impl Router {
    pub fn new(
        session_manager: Arc<SessionManager>,
        engine: Arc<AgentEngine>,
        adapters: Arc<HashMap<String, Arc<dyn ChannelAdapter>>>,
    ) -> Self {
        Self { session_manager, engine, adapters }
    }

    /// Route one message: session lookup → agent call → adapter reply.
    async fn route(&self, msg: IncomingMessage) {
        let conversation_id = match self
            .session_manager
            .get_or_create(&msg.channel_id, &msg.sender_id)
            .await
        {
            Ok(id) => id,
            Err(err) => {
                tracing::error!("session error for {}/{}: {err}", msg.channel_id, msg.sender_id);
                return;
            }
        };

        let response = match self.engine.chat(&conversation_id, &msg.text).await {
            Ok(r) => r,
            Err(err) => {
                tracing::error!("agent error for conversation {conversation_id}: {err}");
                return;
            }
        };

        if let Some(adapter) = self.adapters.get(&msg.channel_id) {
            let out = OutgoingMessage { text: response.content };
            if let Err(err) = adapter.send_message(&msg.sender_id, out).await {
                tracing::error!("send error on {}: {err}", msg.channel_id);
            }
        }
    }

    /// Drain `rx` forever, spawning a task per message for concurrent routing.
    pub async fn run(self: Arc<Self>, mut rx: mpsc::Receiver<IncomingMessage>) {
        while let Some(msg) = rx.recv().await {
            let router = self.clone();
            tokio::spawn(async move { router.route(msg).await });
        }
    }
}
