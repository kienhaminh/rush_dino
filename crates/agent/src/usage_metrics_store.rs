use std::sync::Arc;

use chrono::Utc;
use sqlx::{Row, SqlitePool};
use uuid::Uuid;

use rushdino_common::Result;
use rushdino_providers::types::Usage;

#[derive(Debug, Clone)]
pub struct UsageMetricRow {
    pub id: String,
    pub conversation_id: String,
    pub provider: String,
    pub model: String,
    pub prompt_tokens: i64,
    pub completion_tokens: i64,
    pub total_tokens: i64,
    pub created_at: String,
}

#[derive(Debug, Clone)]
pub struct UsageMetricSnapshot {
    pub provider: String,
    pub model: String,
    pub prompt_tokens: i64,
    pub completion_tokens: i64,
    pub total_tokens: i64,
    pub created_at: String,
}

pub struct UsageMetricsStore {
    pool: Arc<SqlitePool>,
}

impl UsageMetricsStore {
    pub fn new(pool: Arc<SqlitePool>) -> Self {
        Self { pool }
    }

    pub async fn insert_usage(
        &self,
        conversation_id: &str,
        provider: &str,
        model: &str,
        usage: &Usage,
    ) -> Result<()> {
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        sqlx::query(
            "INSERT INTO usage_metrics \
             (id, conversation_id, provider, model, prompt_tokens, completion_tokens, total_tokens, created_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        )
        .bind(id)
        .bind(conversation_id)
        .bind(provider)
        .bind(model)
        .bind(i64::from(usage.prompt_tokens))
        .bind(i64::from(usage.completion_tokens))
        .bind(i64::from(usage.total_tokens))
        .bind(now)
        .execute(self.pool.as_ref())
        .await?;
        Ok(())
    }

    pub async fn list_usage(
        &self,
        start: Option<&str>,
        end: Option<&str>,
        provider: Option<&str>,
        model: Option<&str>,
        conversation_id: Option<&str>,
        limit: i64,
    ) -> Result<Vec<UsageMetricRow>> {
        let rows = sqlx::query(
            "SELECT id, conversation_id, provider, model, prompt_tokens, completion_tokens, total_tokens, created_at \
             FROM usage_metrics \
             WHERE (?1 IS NULL OR created_at >= ?1) \
               AND (?2 IS NULL OR created_at < ?2) \
               AND (?3 IS NULL OR provider = ?3) \
               AND (?4 IS NULL OR model = ?4) \
               AND (?5 IS NULL OR conversation_id = ?5) \
             ORDER BY created_at DESC \
             LIMIT ?6",
        )
        .bind(start)
        .bind(end)
        .bind(provider)
        .bind(model)
        .bind(conversation_id)
        .bind(limit)
        .fetch_all(self.pool.as_ref())
        .await?;

        Ok(rows
            .into_iter()
            .map(|row| UsageMetricRow {
                id: row.get("id"),
                conversation_id: row.get("conversation_id"),
                provider: row.get("provider"),
                model: row.get("model"),
                prompt_tokens: row.get("prompt_tokens"),
                completion_tokens: row.get("completion_tokens"),
                total_tokens: row.get("total_tokens"),
                created_at: row.get("created_at"),
            })
            .collect())
    }

    pub async fn latest_usage_for_conversation(
        &self,
        conversation_id: &str,
    ) -> Result<Option<UsageMetricSnapshot>> {
        let row = sqlx::query(
            "SELECT provider, model, prompt_tokens, completion_tokens, total_tokens, created_at \
             FROM usage_metrics \
             WHERE conversation_id = ?1 \
             ORDER BY created_at DESC \
             LIMIT 1",
        )
        .bind(conversation_id)
        .fetch_optional(self.pool.as_ref())
        .await?;

        Ok(row.map(|row| UsageMetricSnapshot {
            provider: row.get("provider"),
            model: row.get("model"),
            prompt_tokens: row.get("prompt_tokens"),
            completion_tokens: row.get("completion_tokens"),
            total_tokens: row.get("total_tokens"),
            created_at: row.get("created_at"),
        }))
    }
}
