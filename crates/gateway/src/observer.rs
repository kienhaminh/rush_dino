use async_trait::async_trait;

use rushdino_common::RichContent;

#[async_trait]
pub trait GatewayEventObserver: Send + Sync + 'static {
    async fn on_user_message(&self, conversation_id: &str, channel_id: &str, content: &str);

    async fn on_assistant_message(
        &self,
        run_id: &str,
        conversation_id: &str,
        channel_id: &str,
        content: &str,
        rich_content: Option<RichContent>,
    );
}
