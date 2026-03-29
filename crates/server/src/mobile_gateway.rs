use std::{collections::HashMap, sync::Arc};

use async_trait::async_trait;
use chrono::Utc;
use serde::Serialize;
use serde_json::json;
use sha2::{Digest, Sha256};
use sqlx::{Row, SqlitePool};
use tokio::sync::{mpsc, Mutex};
use uuid::Uuid;

use rushdino_common::{AppError, Result};
use rushdino_gateway::{
    AdapterContext, ChannelAdapter, GatewayAdapterCapabilities, GatewayRichDeliveryMode,
    IncomingMessage, OutgoingMessage, PreviewUpdateOutcome,
};

type ResponseTx = mpsc::UnboundedSender<String>;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MobileGatewayKeyRecord {
    pub id: String,
    pub sender_id: String,
    pub label: Option<String>,
    pub created_at: String,
    pub last_seen_at: Option<String>,
    pub revoked_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct IssuedMobileGatewayKey {
    pub id: String,
    pub sender_id: String,
    pub label: Option<String>,
    pub api_key: String,
    pub created_at: String,
    pub qr_payload: serde_json::Value,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AuthenticatedMobileGatewayKey {
    pub id: String,
    pub sender_id: String,
    pub label: Option<String>,
}

pub struct MobileGatewayService {
    pool: SqlitePool,
}

impl MobileGatewayService {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn issue_key(
        &self,
        label: Option<&str>,
        publish_host: &str,
    ) -> Result<IssuedMobileGatewayKey> {
        let publish_host = publish_host.trim();
        if publish_host.is_empty() {
            return Err(AppError::Validation(
                "mobile gateway publish_host is required before issuing keys".to_owned(),
            ));
        }

        let id = Uuid::new_v4().to_string();
        let sender_id = format!("mobile-{}", Uuid::new_v4().simple());
        let created_at = Utc::now().to_rfc3339();
        let api_key = format!("mobile_{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple());
        let label = label.map(str::trim).filter(|value| !value.is_empty());

        sqlx::query(
            "INSERT INTO mobile_gateway_api_keys
             (id, key_hash, sender_id, label, created_at, last_seen_at, revoked_at)
             VALUES (?1, ?2, ?3, ?4, ?5, NULL, NULL)",
        )
        .bind(&id)
        .bind(hash_secret(&api_key))
        .bind(&sender_id)
        .bind(label)
        .bind(&created_at)
        .execute(&self.pool)
        .await?;

        Ok(IssuedMobileGatewayKey {
            id,
            sender_id,
            label: label.map(str::to_owned),
            api_key: api_key.clone(),
            created_at,
            qr_payload: json!({
                "kind": "rushdino_mobile_connect",
                "version": 1,
                "host": publish_host,
                "apiKey": api_key,
            }),
        })
    }

    pub async fn list_keys(&self) -> Result<Vec<MobileGatewayKeyRecord>> {
        let rows = sqlx::query(
            "SELECT id, sender_id, label, created_at, last_seen_at, revoked_at
             FROM mobile_gateway_api_keys
             ORDER BY created_at DESC",
        )
        .fetch_all(&self.pool)
        .await?;

        Ok(rows.into_iter().map(map_key_row).collect())
    }

    pub async fn validate_key(
        &self,
        api_key: &str,
    ) -> Result<Option<AuthenticatedMobileGatewayKey>> {
        let row = sqlx::query(
            "SELECT id, sender_id, label
             FROM mobile_gateway_api_keys
             WHERE key_hash = ?1 AND revoked_at IS NULL",
        )
        .bind(hash_secret(api_key))
        .fetch_optional(&self.pool)
        .await?;

        let Some(row) = row else {
            return Ok(None);
        };

        let id: String = row.get("id");
        let now = Utc::now().to_rfc3339();
        sqlx::query(
            "UPDATE mobile_gateway_api_keys
             SET last_seen_at = ?2
             WHERE id = ?1",
        )
        .bind(&id)
        .bind(now)
        .execute(&self.pool)
        .await?;

        Ok(Some(AuthenticatedMobileGatewayKey {
            id,
            sender_id: row.get("sender_id"),
            label: row.get("label"),
        }))
    }

    pub async fn revoke_key(&self, id: &str) -> Result<Option<MobileGatewayKeyRecord>> {
        let row = sqlx::query(
            "SELECT id, sender_id, label, created_at, last_seen_at
             FROM mobile_gateway_api_keys
             WHERE id = ?1 AND revoked_at IS NULL",
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await?;

        let Some(row) = row else {
            return Ok(None);
        };

        let revoked_at = Utc::now().to_rfc3339();
        sqlx::query(
            "UPDATE mobile_gateway_api_keys
             SET revoked_at = ?2
             WHERE id = ?1",
        )
        .bind(id)
        .bind(&revoked_at)
        .execute(&self.pool)
        .await?;

        Ok(Some(MobileGatewayKeyRecord {
            id: row.get("id"),
            sender_id: row.get("sender_id"),
            label: row.get("label"),
            created_at: row.get("created_at"),
            last_seen_at: row.get("last_seen_at"),
            revoked_at: Some(revoked_at),
        }))
    }
}

#[derive(Clone)]
pub struct MobileGatewayAdapter {
    response_channels: Arc<Mutex<HashMap<String, ResponseTx>>>,
    preview_snapshots: Arc<Mutex<HashMap<String, String>>>,
    gateway_tx: Arc<std::sync::OnceLock<mpsc::Sender<IncomingMessage>>>,
}

impl MobileGatewayAdapter {
    pub fn new() -> Self {
        Self {
            response_channels: Arc::new(Mutex::new(HashMap::new())),
            preview_snapshots: Arc::new(Mutex::new(HashMap::new())),
            gateway_tx: Arc::new(std::sync::OnceLock::new()),
        }
    }

    pub async fn connect(&self, sender_id: String) -> mpsc::UnboundedReceiver<String> {
        let (tx, rx) = mpsc::unbounded_channel();
        self.response_channels.lock().await.insert(sender_id, tx);
        rx
    }

    pub async fn disconnect(&self, sender_id: &str) {
        self.response_channels.lock().await.remove(sender_id);
        self.preview_snapshots
            .lock()
            .await
            .retain(|key, _| !key.starts_with(&format!("{sender_id}:")));
    }

    pub async fn handle_incoming(&self, sender_id: String, text: String) {
        if let Some(tx) = self.gateway_tx.get() {
            let incoming = IncomingMessage {
                channel_id: "mobile".to_owned(),
                sender_id: sender_id.clone(),
                actor_id: sender_id.clone(),
                actor_display: None,
                reply_target: sender_id,
                is_direct_message: true,
                enable_streaming_preview: true,
                external_message_id: None,
                text,
                timestamp: Utc::now(),
            };
            let _ = tx.send(incoming).await;
        }
    }

    async fn send_event(&self, recipient: &str, payload: serde_json::Value) -> Result<()> {
        let channels = self.response_channels.lock().await;
        if let Some(tx) = channels.get(recipient) {
            let _ = tx.send(payload.to_string());
        }
        Ok(())
    }
}

impl Default for MobileGatewayAdapter {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl ChannelAdapter for MobileGatewayAdapter {
    fn channel_id(&self) -> &str {
        "mobile"
    }

    fn capabilities(&self) -> GatewayAdapterCapabilities {
        GatewayAdapterCapabilities {
            plain_text: true,
            markdown: true,
            code_blocks: true,
            images: GatewayRichDeliveryMode::Degraded,
            link_buttons: GatewayRichDeliveryMode::Degraded,
        }
    }

    async fn start(&self, context: AdapterContext) -> Result<()> {
        self.gateway_tx.set(context.inbound_tx).ok();
        context.lifecycle.connected().await;
        let mut shutdown_rx = context.shutdown_rx.clone();
        if *shutdown_rx.borrow() {
            return Ok(());
        }
        let _ = shutdown_rx.changed().await;
        Ok(())
    }

    async fn send_message(&self, recipient: &str, msg: OutgoingMessage) -> Result<()> {
        self.send_event(
            recipient,
            json!({
                "type": "assistant_message",
                "content": msg.fallback_text,
                "rich_content": msg,
            }),
        )
        .await
    }

    async fn update_preview(
        &self,
        run_id: &str,
        recipient: &str,
        text: &str,
    ) -> Result<PreviewUpdateOutcome> {
        let key = preview_key(recipient, run_id);
        let mut previews = self.preview_snapshots.lock().await;
        let previous = previews.insert(key, text.to_owned()).unwrap_or_default();
        drop(previews);

        let delta = if let Some(delta) = text.strip_prefix(&previous) {
            delta.to_owned()
        } else {
            self.send_event(recipient, json!({ "type": "assistant_reset", "run_id": run_id }))
                .await?;
            text.to_owned()
        };

        self.send_event(
            recipient,
            json!({
                "type": "chat_chunk",
                "run_id": run_id,
                "delta": delta,
                "tool_calls": [],
                "done": false,
            }),
        )
        .await?;

        Ok(PreviewUpdateOutcome {
            started: previous.is_empty(),
            fallback_reason: None,
        })
    }

    async fn finalize_preview(&self, run_id: &str, recipient: &str) -> Result<()> {
        self.preview_snapshots
            .lock()
            .await
            .remove(&preview_key(recipient, run_id));
        self.send_event(
            recipient,
            json!({
                "type": "chat_chunk",
                "run_id": run_id,
                "delta": "",
                "tool_calls": [],
                "done": true,
            }),
        )
        .await
    }

    async fn clear_preview(&self, run_id: &str, recipient: &str) -> Result<()> {
        self.preview_snapshots
            .lock()
            .await
            .remove(&preview_key(recipient, run_id));
        self.send_event(recipient, json!({ "type": "assistant_reset", "run_id": run_id }))
            .await
    }
}

fn preview_key(recipient: &str, run_id: &str) -> String {
    format!("{recipient}:{run_id}")
}

fn hash_secret(secret: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(secret.as_bytes());
    hex::encode(hasher.finalize())
}

fn map_key_row(row: sqlx::sqlite::SqliteRow) -> MobileGatewayKeyRecord {
    MobileGatewayKeyRecord {
        id: row.get("id"),
        sender_id: row.get("sender_id"),
        label: row.get("label"),
        created_at: row.get("created_at"),
        last_seen_at: row.get("last_seen_at"),
        revoked_at: row.get("revoked_at"),
    }
}
