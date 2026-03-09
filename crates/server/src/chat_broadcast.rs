use std::sync::Arc;

use tokio::sync::broadcast;

use rushdino_common::RichContent;
use rushdino_gateway::GatewayEventObserver;

#[derive(Clone)]
pub struct ChatBroadcastHub {
    tx: broadcast::Sender<serde_json::Value>,
}

impl ChatBroadcastHub {
    pub fn new() -> Self {
        let (tx, _) = broadcast::channel(256);
        Self { tx }
    }

    pub fn subscribe(&self) -> broadcast::Receiver<serde_json::Value> {
        self.tx.subscribe()
    }

    pub fn broadcast_user_message(&self, conversation_id: &str, channel: &str, content: &str) {
        let _ = self.tx.send(serde_json::json!({
            "type": "user_message",
            "conversation_id": conversation_id,
            "channel": channel,
            "content": content,
        }));
    }

    pub fn broadcast_assistant_message(
        &self,
        run_id: &str,
        conversation_id: &str,
        content: &str,
        rich_content: Option<&RichContent>,
    ) {
        let _ = self.tx.send(serde_json::json!({
            "type": "assistant_message",
            "run_id": run_id,
            "conversation_id": conversation_id,
            "content": content,
            "rich_content": rich_content,
        }));
    }

    pub fn broadcast_runtime_log_error(
        &self,
        id: &str,
        level: &str,
        target: &str,
        message: &str,
        fields: Option<&serde_json::Value>,
        created_at: &str,
    ) {
        let _ = self.tx.send(serde_json::json!({
            "type": "runtime_log_error",
            "id": id,
            "level": level,
            "target": target,
            "message": message,
            "fields": fields,
            "created_at": created_at,
        }));
    }
}

pub struct GatewayChatObserver {
    hub: Arc<ChatBroadcastHub>,
}

impl GatewayChatObserver {
    pub fn new(hub: Arc<ChatBroadcastHub>) -> Self {
        Self { hub }
    }
}

#[async_trait::async_trait]
impl GatewayEventObserver for GatewayChatObserver {
    async fn on_user_message(&self, conversation_id: &str, channel_id: &str, content: &str) {
        self.hub
            .broadcast_user_message(conversation_id, channel_id, content);
    }

    async fn on_assistant_message(
        &self,
        run_id: &str,
        conversation_id: &str,
        _channel_id: &str,
        content: &str,
        rich_content: Option<RichContent>,
    ) {
        self.hub.broadcast_assistant_message(
            run_id,
            conversation_id,
            content,
            rich_content.as_ref(),
        );
    }
}
