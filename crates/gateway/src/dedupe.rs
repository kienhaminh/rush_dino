use std::{
    collections::HashMap,
    time::{Duration, Instant},
};

use tokio::sync::Mutex;

use crate::message::IncomingMessage;

const DEFAULT_DEDUPE_WINDOW: Duration = Duration::from_secs(60 * 5);

pub struct GatewayMessageDedupe {
    ttl: Duration,
    seen: Mutex<HashMap<String, Instant>>,
}

impl GatewayMessageDedupe {
    pub fn new(ttl: Duration) -> Self {
        Self {
            ttl,
            seen: Mutex::new(HashMap::new()),
        }
    }

    pub async fn should_process(&self, message: &IncomingMessage) -> bool {
        let Some(external_message_id) = message.external_message_id.as_deref() else {
            return true;
        };

        let now = Instant::now();
        let key = format!(
            "{}:{}:{}",
            message.channel_id, message.sender_id, external_message_id
        );

        let mut seen = self.seen.lock().await;
        seen.retain(|_, seen_at| now.duration_since(*seen_at) <= self.ttl);
        if let Some(previous) = seen.get(&key) {
            if now.duration_since(*previous) <= self.ttl {
                return false;
            }
        }
        seen.insert(key, now);
        true
    }
}

impl Default for GatewayMessageDedupe {
    fn default() -> Self {
        Self::new(DEFAULT_DEDUPE_WINDOW)
    }
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use chrono::Utc;

    use super::GatewayMessageDedupe;
    use crate::message::IncomingMessage;

    fn sample_message(external_message_id: Option<&str>) -> IncomingMessage {
        IncomingMessage {
            channel_id: "slack".to_owned(),
            sender_id: "C123".to_owned(),
            actor_id: "U123".to_owned(),
            actor_display: Some("Alice".to_owned()),
            reply_target: "C123".to_owned(),
            is_direct_message: true,
            enable_streaming_preview: false,
            external_message_id: external_message_id.map(ToOwned::to_owned),
            text: "hi".to_owned(),
            timestamp: Utc::now(),
        }
    }

    #[tokio::test]
    async fn duplicate_message_is_suppressed_within_window() {
        let dedupe = GatewayMessageDedupe::new(Duration::from_millis(50));
        let message = sample_message(Some("abc"));

        assert!(dedupe.should_process(&message).await);
        assert!(!dedupe.should_process(&message).await);
    }

    #[tokio::test]
    async fn messages_without_external_id_are_not_deduped() {
        let dedupe = GatewayMessageDedupe::default();
        let message = sample_message(None);

        assert!(dedupe.should_process(&message).await);
        assert!(dedupe.should_process(&message).await);
    }
}
