use std::{collections::HashSet, path::PathBuf, sync::Arc};

use async_trait::async_trait;
use chrono::{Duration, Utc};
use serde::Serialize;
use serde_json::json;
use sqlx::{Row, SqlitePool};
use uuid::Uuid;

use rushdino_common::{AppConfig, AppError, DmPolicy, Result};
use rushdino_gateway::{
    rich_message::markdown_message, GatewayIngressPolicy, IncomingMessage, IngressBlockResponse,
    IngressDecision,
};

use crate::runtime_log_store::RuntimeLogStore;

const PAIRING_TTL_DAYS: i64 = 7;
const PAIRING_CODE_ALPHABET: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const PAIRING_CODE_LEN: usize = 6;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PairingPendingRequest {
    pub id: String,
    pub channel_id: String,
    pub sender_id: String,
    pub sender_display: Option<String>,
    pub reply_target: String,
    pub code: String,
    pub created_at: String,
    pub last_seen_at: String,
    pub expires_at: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PairedSender {
    pub id: String,
    pub channel_id: String,
    pub sender_id: String,
    pub sender_display: Option<String>,
    pub approved_at: String,
    pub last_seen_at: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ChannelPairingState {
    pub channel_id: String,
    pub pending: Vec<PairingPendingRequest>,
    pub paired: Vec<PairedSender>,
}

pub struct ChannelPairingService {
    pool: SqlitePool,
}

impl ChannelPairingService {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn get_state(&self, channel_id: &str) -> Result<ChannelPairingState> {
        self.prune_expired(channel_id).await?;
        Ok(ChannelPairingState {
            channel_id: channel_id.to_owned(),
            pending: self.list_pending(channel_id).await?,
            paired: self.list_paired(channel_id).await?,
        })
    }

    pub async fn list_pending(&self, channel_id: &str) -> Result<Vec<PairingPendingRequest>> {
        self.prune_expired(channel_id).await?;
        let rows = sqlx::query(
            "SELECT id, channel_id, sender_id, sender_display, reply_target, code, created_at, last_seen_at, expires_at
             FROM channel_pairing_requests
             WHERE channel_id = ?1 AND status = 'pending'
             ORDER BY last_seen_at DESC, created_at DESC",
        )
        .bind(channel_id)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows.into_iter().map(map_pending_request).collect())
    }

    pub async fn list_paired(&self, channel_id: &str) -> Result<Vec<PairedSender>> {
        let rows = sqlx::query(
            "SELECT id, channel_id, sender_id, sender_display, approved_at, last_seen_at
             FROM channel_pairing_approvals
             WHERE channel_id = ?1
             ORDER BY last_seen_at DESC, approved_at DESC",
        )
        .bind(channel_id)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows.into_iter().map(map_paired_sender).collect())
    }

    pub async fn create_or_refresh_request(
        &self,
        channel_id: &str,
        sender_id: &str,
        sender_display: Option<&str>,
        reply_target: &str,
    ) -> Result<PairingPendingRequest> {
        self.prune_expired(channel_id).await?;

        if let Some(existing) = self.find_pending_by_sender(channel_id, sender_id).await? {
            let now = Utc::now();
            let expires_at = (now + Duration::days(PAIRING_TTL_DAYS)).to_rfc3339();
            sqlx::query(
                "UPDATE channel_pairing_requests
                 SET sender_display = ?3, reply_target = ?4, last_seen_at = ?5, expires_at = ?6
                 WHERE id = ?1 AND channel_id = ?2",
            )
            .bind(&existing.id)
            .bind(channel_id)
            .bind(
                sender_display
                    .map(str::trim)
                    .filter(|value| !value.is_empty()),
            )
            .bind(reply_target.trim())
            .bind(now.to_rfc3339())
            .bind(expires_at)
            .execute(&self.pool)
            .await?;

            return self
                .find_pending_by_sender(channel_id, sender_id)
                .await?
                .ok_or_else(|| {
                    AppError::Agent("pairing request disappeared after refresh".to_owned())
                });
        }

        let now = Utc::now();
        let created_at = now.to_rfc3339();
        let expires_at = (now + Duration::days(PAIRING_TTL_DAYS)).to_rfc3339();
        let code = self.generate_unique_code(channel_id).await?;
        let id = Uuid::new_v4().to_string();

        sqlx::query(
            "INSERT INTO channel_pairing_requests
             (id, channel_id, sender_id, sender_display, reply_target, code, status, created_at, last_seen_at, expires_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'pending', ?7, ?7, ?8)",
        )
        .bind(&id)
        .bind(channel_id)
        .bind(normalize_sender_id(sender_id))
        .bind(sender_display.map(str::trim).filter(|value| !value.is_empty()))
        .bind(reply_target.trim())
        .bind(&code)
        .bind(created_at)
        .bind(expires_at)
        .execute(&self.pool)
        .await?;

        self.find_pending_by_sender(channel_id, sender_id)
            .await?
            .ok_or_else(|| AppError::Agent("pairing request insert failed".to_owned()))
    }

    pub async fn decide_request(
        &self,
        channel_id: &str,
        request_id: &str,
        approved: bool,
    ) -> Result<Option<PairedSender>> {
        self.prune_expired(channel_id).await?;
        let Some(request) = self.find_pending_by_id(channel_id, request_id).await? else {
            return Err(AppError::NotFound(format!(
                "pairing request '{request_id}' not found"
            )));
        };

        let status = if approved { "approved" } else { "denied" };
        sqlx::query(
            "UPDATE channel_pairing_requests
             SET status = ?3, last_seen_at = ?4
             WHERE id = ?1 AND channel_id = ?2",
        )
        .bind(request_id)
        .bind(channel_id)
        .bind(status)
        .bind(Utc::now().to_rfc3339())
        .execute(&self.pool)
        .await?;

        if !approved {
            return Ok(None);
        }

        let id = Uuid::new_v4().to_string();
        let approved_at = Utc::now().to_rfc3339();
        sqlx::query(
            "INSERT INTO channel_pairing_approvals
             (id, channel_id, sender_id, sender_display, approved_at, last_seen_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(channel_id, sender_id) DO UPDATE SET
               sender_display = excluded.sender_display,
               approved_at = excluded.approved_at,
               last_seen_at = excluded.last_seen_at",
        )
        .bind(id)
        .bind(channel_id)
        .bind(&request.sender_id)
        .bind(request.sender_display.as_deref())
        .bind(&approved_at)
        .bind(&request.last_seen_at)
        .execute(&self.pool)
        .await?;

        Ok(Some(
            self.find_paired_sender(channel_id, &request.sender_id)
                .await?
                .ok_or_else(|| AppError::Agent("paired sender insert failed".to_owned()))?,
        ))
    }

    pub async fn revoke_paired(&self, channel_id: &str, sender_id: &str) -> Result<bool> {
        let result = sqlx::query(
            "DELETE FROM channel_pairing_approvals
             WHERE channel_id = ?1 AND sender_id = ?2",
        )
        .bind(channel_id)
        .bind(normalize_sender_id(sender_id))
        .execute(&self.pool)
        .await?;

        Ok(result.rows_affected() > 0)
    }

    pub async fn is_paired(&self, channel_id: &str, sender_id: &str) -> Result<bool> {
        let row = sqlx::query(
            "SELECT 1
             FROM channel_pairing_approvals
             WHERE channel_id = ?1 AND sender_id = ?2",
        )
        .bind(channel_id)
        .bind(normalize_sender_id(sender_id))
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.is_some())
    }

    pub async fn note_paired_sender_seen(
        &self,
        channel_id: &str,
        sender_id: &str,
        sender_display: Option<&str>,
    ) -> Result<bool> {
        let now = Utc::now().to_rfc3339();
        let result = sqlx::query(
            "UPDATE channel_pairing_approvals
             SET sender_display = COALESCE(?3, sender_display),
                 last_seen_at = ?4
             WHERE channel_id = ?1 AND sender_id = ?2",
        )
        .bind(channel_id)
        .bind(normalize_sender_id(sender_id))
        .bind(
            sender_display
                .map(str::trim)
                .filter(|value| !value.is_empty()),
        )
        .bind(now)
        .execute(&self.pool)
        .await?;

        Ok(result.rows_affected() > 0)
    }

    async fn prune_expired(&self, channel_id: &str) -> Result<()> {
        let now = Utc::now().to_rfc3339();
        sqlx::query(
            "DELETE FROM channel_pairing_requests
             WHERE channel_id = ?1 AND status = 'pending' AND expires_at <= ?2",
        )
        .bind(channel_id)
        .bind(now)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    async fn find_pending_by_sender(
        &self,
        channel_id: &str,
        sender_id: &str,
    ) -> Result<Option<PairingPendingRequest>> {
        let row = sqlx::query(
            "SELECT id, channel_id, sender_id, sender_display, reply_target, code, created_at, last_seen_at, expires_at
             FROM channel_pairing_requests
             WHERE channel_id = ?1 AND sender_id = ?2 AND status = 'pending'",
        )
        .bind(channel_id)
        .bind(normalize_sender_id(sender_id))
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(map_pending_request))
    }

    async fn find_pending_by_id(
        &self,
        channel_id: &str,
        request_id: &str,
    ) -> Result<Option<PairingPendingRequest>> {
        let row = sqlx::query(
            "SELECT id, channel_id, sender_id, sender_display, reply_target, code, created_at, last_seen_at, expires_at
             FROM channel_pairing_requests
             WHERE channel_id = ?1 AND id = ?2 AND status = 'pending'",
        )
        .bind(channel_id)
        .bind(request_id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(map_pending_request))
    }

    async fn find_paired_sender(
        &self,
        channel_id: &str,
        sender_id: &str,
    ) -> Result<Option<PairedSender>> {
        let row = sqlx::query(
            "SELECT id, channel_id, sender_id, sender_display, approved_at, last_seen_at
             FROM channel_pairing_approvals
             WHERE channel_id = ?1 AND sender_id = ?2",
        )
        .bind(channel_id)
        .bind(normalize_sender_id(sender_id))
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(map_paired_sender))
    }

    async fn generate_unique_code(&self, channel_id: &str) -> Result<String> {
        let rows = sqlx::query(
            "SELECT code
             FROM channel_pairing_requests
             WHERE channel_id = ?1 AND status = 'pending'",
        )
        .bind(channel_id)
        .fetch_all(&self.pool)
        .await?;

        let existing = rows
            .into_iter()
            .map(|row| row.get::<String, _>("code"))
            .collect::<HashSet<_>>();

        for _ in 0..128 {
            let code = generate_code();
            if !existing.contains(&code) {
                return Ok(code);
            }
        }

        Err(AppError::Agent(
            "failed to generate unique pairing code".to_owned(),
        ))
    }
}

pub struct ChannelPairingIngressPolicy {
    config_path: PathBuf,
    pairing: Arc<ChannelPairingService>,
    runtime_logs: Arc<RuntimeLogStore>,
}

impl ChannelPairingIngressPolicy {
    pub fn new(
        config_path: PathBuf,
        pairing: Arc<ChannelPairingService>,
        runtime_logs: Arc<RuntimeLogStore>,
    ) -> Self {
        Self {
            config_path,
            pairing,
            runtime_logs,
        }
    }

    async fn log_pairing_event(&self, message: &str, fields: serde_json::Value) -> Result<()> {
        let _ = self
            .runtime_logs
            .insert("info", "pairing", message, Some(fields))
            .await;
        Ok(())
    }
}

#[async_trait]
impl GatewayIngressPolicy for ChannelPairingIngressPolicy {
    async fn evaluate(&self, msg: &IncomingMessage) -> Result<IngressDecision> {
        let Some(access) = load_channel_access(&self.config_path, &msg.channel_id)? else {
            return Ok(IngressDecision::Allow);
        };

        if !msg.is_direct_message {
            return Ok(IngressDecision::Allow);
        }

        if self
            .pairing
            .note_paired_sender_seen(&msg.channel_id, &msg.actor_id, msg.actor_display.as_deref())
            .await?
        {
            return Ok(IngressDecision::Allow);
        }

        if allowlist_allows(&access.allow_from, &msg.actor_id) {
            return Ok(IngressDecision::Allow);
        }

        match access.dm_policy {
            DmPolicy::Open => Ok(IngressDecision::Allow),
            DmPolicy::Disabled => {
                self.log_pairing_event(
                    "direct message blocked by disabled dm policy",
                    json!({
                        "channelId": msg.channel_id,
                        "senderId": msg.actor_id,
                        "senderDisplay": msg.actor_display,
                        "reason": "disabled",
                    }),
                )
                .await?;
                Ok(IngressDecision::Block {
                    reason: "dm disabled".to_owned(),
                    response: Some(IngressBlockResponse {
                        recipient: msg.reply_target.clone(),
                        message: markdown_message(
                            "RushDino is not accepting direct messages on this channel.".to_owned(),
                        ),
                    }),
                })
            }
            DmPolicy::Allowlist => {
                self.log_pairing_event(
                    "direct message blocked by allowlist policy",
                    json!({
                        "channelId": msg.channel_id,
                        "senderId": msg.actor_id,
                        "senderDisplay": msg.actor_display,
                        "reason": "allowlist",
                    }),
                )
                .await?;
                Ok(IngressDecision::Block {
                    reason: "sender not allowlisted".to_owned(),
                    response: None,
                })
            }
            DmPolicy::Pairing => {
                let request = self
                    .pairing
                    .create_or_refresh_request(
                        &msg.channel_id,
                        &msg.actor_id,
                        msg.actor_display.as_deref(),
                        &msg.reply_target,
                    )
                    .await?;
                self.log_pairing_event(
                    "pairing request emitted",
                    json!({
                        "channelId": msg.channel_id,
                        "senderId": msg.actor_id,
                        "senderDisplay": msg.actor_display,
                        "requestId": request.id,
                        "code": request.code,
                    }),
                )
                .await?;
                Ok(IngressDecision::Block {
                    reason: "pairing required".to_owned(),
                    response: Some(IngressBlockResponse {
                        recipient: msg.reply_target.clone(),
                        message: markdown_message(build_pairing_message(
                            &msg.channel_id,
                            &msg.actor_id,
                            msg.actor_display.as_deref(),
                            &request.code,
                        )),
                    }),
                })
            }
        }
    }
}

fn normalize_sender_id(sender_id: &str) -> String {
    sender_id.trim().to_owned()
}

fn allowlist_allows(allow_from: &[String], sender_id: &str) -> bool {
    let normalized_sender = normalize_sender_id(sender_id);
    allow_from.iter().any(|entry| {
        let normalized = entry.trim();
        normalized == "*" || normalized == normalized_sender
    })
}

fn build_pairing_message(
    channel_id: &str,
    sender_id: &str,
    sender_display: Option<&str>,
    code: &str,
) -> String {
    let label = match channel_id {
        "telegram" => "Telegram",
        "discord" => "Discord",
        other => other,
    };
    let mut lines = vec![
        format!("RushDino requires pairing approval for {label} direct messages."),
        format!("Your {label} sender id: {}", sender_id.trim()),
        format!("Pairing code: {code}"),
        "Ask an operator to approve this request in the RushDino control UI.".to_owned(),
    ];
    if let Some(display) = sender_display
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        lines.insert(1, format!("Sender: {display}"));
    }
    lines.join("\n")
}

fn load_channel_access(
    config_path: &PathBuf,
    channel_id: &str,
) -> Result<Option<rushdino_common::ChannelAccessConfig>> {
    let config = AppConfig::load_from_path(config_path)?;
    let access = match channel_id {
        "telegram" => Some(config.gateway.telegram.access),
        "discord" => Some(config.gateway.discord.access),
        _ => None,
    };
    Ok(access)
}

fn generate_code() -> String {
    let bytes = *Uuid::new_v4().as_bytes();
    let mut code = String::with_capacity(PAIRING_CODE_LEN);
    for index in 0..PAIRING_CODE_LEN {
        let value = bytes[index] as usize % PAIRING_CODE_ALPHABET.len();
        code.push(PAIRING_CODE_ALPHABET[value] as char);
    }
    code
}

fn map_pending_request(row: sqlx::sqlite::SqliteRow) -> PairingPendingRequest {
    PairingPendingRequest {
        id: row.get("id"),
        channel_id: row.get("channel_id"),
        sender_id: row.get("sender_id"),
        sender_display: row.get("sender_display"),
        reply_target: row.get("reply_target"),
        code: row.get("code"),
        created_at: row.get("created_at"),
        last_seen_at: row.get("last_seen_at"),
        expires_at: row.get("expires_at"),
    }
}

fn map_paired_sender(row: sqlx::sqlite::SqliteRow) -> PairedSender {
    PairedSender {
        id: row.get("id"),
        channel_id: row.get("channel_id"),
        sender_id: row.get("sender_id"),
        sender_display: row.get("sender_display"),
        approved_at: row.get("approved_at"),
        last_seen_at: row.get("last_seen_at"),
    }
}

#[cfg(test)]
mod tests {
    use std::{fs, sync::Arc};

    use chrono::{Duration, Utc};
    use rushdino_common::db::run_migrations;
    use rushdino_gateway::IncomingMessage;
    use sqlx::sqlite::SqlitePoolOptions;

    use super::*;

    async fn setup_pairing_service() -> ChannelPairingService {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("connect sqlite");
        run_migrations(&pool).await.expect("run migrations");
        ChannelPairingService::new(pool)
    }

    fn write_config(root: &std::path::Path, dm_policy: &str, allow_from: &[&str]) -> PathBuf {
        let path = root.join("config.toml");
        let allow_from = allow_from
            .iter()
            .map(|entry| format!("\"{entry}\""))
            .collect::<Vec<_>>()
            .join(", ");
        fs::write(
            &path,
            format!(
                r#"
host = "127.0.0.1"
port = 28847
log_level = "info"
active_provider = "ollama"
profiles = []
fallback_profile_ids = []
data_dir = "data"
db_path = "data.db"
brave_search_endpoint = "https://api.search.brave.com/res/v1/web/search"
allowed_chat_ids = []

[ollama]
base_url = "http://localhost:11434"
model = "llama3"

[openai]
model = "gpt-4.1"

[anthropic]
model = "claude-3-5-sonnet-latest"

[openai_codex]
model = "gpt-5-codex"

[gateway.telegram]
enabled = true

[gateway.telegram.access]
dm_policy = "{dm_policy}"
allow_from = [{allow_from}]

[gateway.discord]
enabled = false

[gateway.slack]
enabled = false

[gateway.webchat]
enabled = true
"#
            ),
        )
        .expect("write config");
        path
    }

    #[tokio::test]
    async fn pairing_requests_are_reused_for_repeated_sender() {
        let service = setup_pairing_service().await;
        let first = service
            .create_or_refresh_request("telegram", "42", Some("Alice"), "42")
            .await
            .expect("first request");
        let second = service
            .create_or_refresh_request("telegram", "42", Some("Alice B"), "42")
            .await
            .expect("second request");

        assert_eq!(first.id, second.id);
        assert_eq!(first.code, second.code);
        assert_eq!(second.sender_display.as_deref(), Some("Alice B"));
    }

    #[tokio::test]
    async fn approving_request_moves_sender_to_paired_list() {
        let service = setup_pairing_service().await;
        let request = service
            .create_or_refresh_request("telegram", "42", Some("Alice"), "42")
            .await
            .expect("request");
        let approved = service
            .decide_request("telegram", &request.id, true)
            .await
            .expect("approve")
            .expect("paired sender");

        assert_eq!(approved.sender_id, "42");
        let paired = service.list_paired("telegram").await.expect("paired");
        assert_eq!(paired.len(), 1);
        assert_eq!(paired[0].sender_id, "42");
        let pending = service.list_pending("telegram").await.expect("pending");
        assert!(pending.is_empty());
    }

    #[tokio::test]
    async fn expired_requests_are_pruned() {
        let service = setup_pairing_service().await;
        let request = service
            .create_or_refresh_request("telegram", "42", Some("Alice"), "42")
            .await
            .expect("request");
        let expired = (Utc::now() - Duration::days(1)).to_rfc3339();
        sqlx::query("UPDATE channel_pairing_requests SET expires_at = ?2 WHERE id = ?1")
            .bind(&request.id)
            .bind(expired)
            .execute(&service.pool)
            .await
            .expect("expire request");

        let pending = service.list_pending("telegram").await.expect("pending");
        assert!(pending.is_empty());
    }

    #[tokio::test]
    async fn ingress_policy_blocks_unpaired_direct_messages() {
        let service = Arc::new(setup_pairing_service().await);
        let root = std::env::temp_dir().join(format!("rushdino-pairing-{}", Uuid::new_v4()));
        fs::create_dir_all(&root).expect("temp dir");
        let config_path = write_config(&root, "pairing", &[]);
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("connect sqlite");
        run_migrations(&pool).await.expect("run migrations");
        let logs = Arc::new(RuntimeLogStore::new(Arc::new(pool), None));
        let policy = ChannelPairingIngressPolicy::new(config_path, service.clone(), logs);

        let decision = policy
            .evaluate(&IncomingMessage {
                channel_id: "telegram".to_owned(),
                sender_id: "chat-1".to_owned(),
                actor_id: "42".to_owned(),
                actor_display: Some("Alice".to_owned()),
                reply_target: "chat-1".to_owned(),
                is_direct_message: true,
                enable_streaming_preview: false,
                external_message_id: Some("msg-1".to_owned()),
                text: "hello".to_owned(),
                timestamp: Utc::now(),
            })
            .await
            .expect("evaluate");

        match decision {
            IngressDecision::Block {
                response: Some(response),
                ..
            } => {
                assert_eq!(response.recipient, "chat-1");
                assert!(response.message.fallback_text.contains("Pairing code"));
            }
            other => panic!("expected block with response, got {other:?}"),
        }

        let pending = service.list_pending("telegram").await.expect("pending");
        assert_eq!(pending.len(), 1);

        let _ = fs::remove_dir_all(root);
    }

    #[tokio::test]
    async fn ingress_policy_allows_manual_allowlist_sender() {
        let service = Arc::new(setup_pairing_service().await);
        let root = std::env::temp_dir().join(format!("rushdino-pairing-{}", Uuid::new_v4()));
        fs::create_dir_all(&root).expect("temp dir");
        let config_path = write_config(&root, "allowlist", &["42"]);
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("connect sqlite");
        run_migrations(&pool).await.expect("run migrations");
        let logs = Arc::new(RuntimeLogStore::new(Arc::new(pool), None));
        let policy = ChannelPairingIngressPolicy::new(config_path, service, logs);

        let decision = policy
            .evaluate(&IncomingMessage {
                channel_id: "telegram".to_owned(),
                sender_id: "chat-1".to_owned(),
                actor_id: "42".to_owned(),
                actor_display: Some("Alice".to_owned()),
                reply_target: "chat-1".to_owned(),
                is_direct_message: true,
                enable_streaming_preview: false,
                external_message_id: Some("msg-1".to_owned()),
                text: "hello".to_owned(),
                timestamp: Utc::now(),
            })
            .await
            .expect("evaluate");

        assert!(matches!(decision, IngressDecision::Allow));

        let _ = fs::remove_dir_all(root);
    }
}
