use std::{collections::HashMap, sync::Arc};

use chrono::Utc;
use serde::Serialize;
use tokio::sync::Mutex;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum GatewayAdapterStatus {
    Disabled,
    Starting,
    Connected,
    Degraded,
    Disconnected,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GatewayAdapterCapabilities {
    pub plain_text: bool,
    pub markdown: bool,
    pub code_blocks: bool,
    pub images: GatewayRichDeliveryMode,
    pub link_buttons: GatewayRichDeliveryMode,
}

impl GatewayAdapterCapabilities {
    pub const fn plain_text_only() -> Self {
        Self {
            plain_text: true,
            markdown: false,
            code_blocks: false,
            images: GatewayRichDeliveryMode::Unsupported,
            link_buttons: GatewayRichDeliveryMode::Unsupported,
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum GatewayRichDeliveryMode {
    Native,
    Degraded,
    Unsupported,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GatewayAdapterState {
    pub channel_id: String,
    pub status: GatewayAdapterStatus,
    pub last_event_at: Option<String>,
    pub last_error: Option<String>,
    pub reconnect_count: u32,
    pub capabilities: GatewayAdapterCapabilities,
}

pub struct GatewayStateStore {
    adapters: Mutex<HashMap<String, GatewayAdapterState>>,
}

impl GatewayStateStore {
    pub fn new() -> Self {
        Self {
            adapters: Mutex::new(HashMap::new()),
        }
    }

    pub async fn seed_channel(
        &self,
        channel_id: &str,
        enabled: bool,
        capabilities: GatewayAdapterCapabilities,
    ) {
        self.upsert_state(
            channel_id,
            if enabled {
                GatewayAdapterStatus::Disconnected
            } else {
                GatewayAdapterStatus::Disabled
            },
            None,
            false,
            Some(capabilities),
        )
        .await;
    }

    pub async fn list_adapters(&self) -> Vec<GatewayAdapterState> {
        let mut items = self
            .adapters
            .lock()
            .await
            .values()
            .cloned()
            .collect::<Vec<_>>();
        items.sort_by(|left, right| left.channel_id.cmp(&right.channel_id));
        items
    }

    pub fn reporter(self: &Arc<Self>, channel_id: impl Into<String>) -> AdapterLifecycleHandle {
        AdapterLifecycleHandle {
            channel_id: channel_id.into(),
            store: self.clone(),
        }
    }

    async fn upsert_state(
        &self,
        channel_id: &str,
        status: GatewayAdapterStatus,
        error: Option<String>,
        increment_reconnect: bool,
        capabilities: Option<GatewayAdapterCapabilities>,
    ) {
        let mut adapters = self.adapters.lock().await;
        let entry = adapters
            .entry(channel_id.to_owned())
            .or_insert_with(|| GatewayAdapterState {
                channel_id: channel_id.to_owned(),
                status: GatewayAdapterStatus::Disconnected,
                last_event_at: None,
                last_error: None,
                reconnect_count: 0,
                capabilities: GatewayAdapterCapabilities::plain_text_only(),
            });
        entry.status = status;
        entry.last_event_at = Some(Utc::now().to_rfc3339());
        entry.last_error = error;
        if increment_reconnect {
            entry.reconnect_count += 1;
        }
        if let Some(capabilities) = capabilities {
            entry.capabilities = capabilities;
        }
    }
}

impl Default for GatewayStateStore {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Clone)]
pub struct AdapterLifecycleHandle {
    channel_id: String,
    store: Arc<GatewayStateStore>,
}

impl AdapterLifecycleHandle {
    pub async fn starting(&self) {
        self.store
            .upsert_state(
                &self.channel_id,
                GatewayAdapterStatus::Starting,
                None,
                false,
                None,
            )
            .await;
    }

    pub async fn connected(&self) {
        self.store
            .upsert_state(
                &self.channel_id,
                GatewayAdapterStatus::Connected,
                None,
                false,
                None,
            )
            .await;
    }

    pub async fn degraded(&self, error: impl Into<String>) {
        self.store
            .upsert_state(
                &self.channel_id,
                GatewayAdapterStatus::Degraded,
                Some(error.into()),
                false,
                None,
            )
            .await;
    }

    pub async fn disconnected(&self, error: Option<String>) {
        self.store
            .upsert_state(
                &self.channel_id,
                GatewayAdapterStatus::Disconnected,
                error,
                false,
                None,
            )
            .await;
    }

    pub async fn disabled(&self) {
        self.store
            .upsert_state(
                &self.channel_id,
                GatewayAdapterStatus::Disabled,
                None,
                false,
                None,
            )
            .await;
    }

    pub async fn note_reconnect(&self) {
        self.store
            .upsert_state(
                &self.channel_id,
                GatewayAdapterStatus::Starting,
                None,
                true,
                None,
            )
            .await;
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::{GatewayAdapterCapabilities, GatewayRichDeliveryMode};

    #[test]
    fn serializes_rich_delivery_modes_as_strings() {
        let capabilities = GatewayAdapterCapabilities {
            plain_text: true,
            markdown: true,
            code_blocks: true,
            images: GatewayRichDeliveryMode::Native,
            link_buttons: GatewayRichDeliveryMode::Degraded,
        };

        let value = serde_json::to_value(&capabilities).expect("capabilities should serialize");
        assert_eq!(
            value,
            json!({
                "plainText": true,
                "markdown": true,
                "codeBlocks": true,
                "images": "native",
                "linkButtons": "degraded",
            })
        );
    }
}
