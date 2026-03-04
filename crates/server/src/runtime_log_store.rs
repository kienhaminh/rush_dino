use std::sync::Arc;

use chrono::Utc;
use serde_json::Value;
use sqlx::{Row, SqlitePool};
use uuid::Uuid;

use rushdino_common::Result;

#[derive(Debug, Clone)]
pub struct RuntimeLogRow {
    pub id: String,
    pub level: String,
    pub target: String,
    pub message: String,
    pub fields: Option<String>,
    pub created_at: String,
}

pub struct RuntimeLogStore {
    pool: Arc<SqlitePool>,
}

impl RuntimeLogStore {
    pub fn new(pool: Arc<SqlitePool>) -> Self {
        Self { pool }
    }

    pub async fn insert(
        &self,
        level: &str,
        target: &str,
        message: &str,
        fields: Option<Value>,
    ) -> Result<()> {
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        let fields_json = fields.map(|value| value.to_string());
        sqlx::query(
            "INSERT INTO runtime_logs (id, level, target, message, fields, created_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        )
        .bind(id)
        .bind(level)
        .bind(target)
        .bind(message)
        .bind(fields_json)
        .bind(now)
        .execute(self.pool.as_ref())
        .await?;
        Ok(())
    }

    pub async fn list(
        &self,
        level_csv: Option<&str>,
        query: Option<&str>,
        cursor_ts: Option<&str>,
        cursor_id: Option<&str>,
        limit: i64,
    ) -> Result<Vec<RuntimeLogRow>> {
        let rows = sqlx::query(
            "SELECT id, level, target, message, fields, created_at \
             FROM runtime_logs \
             WHERE (?1 IS NULL OR instr(',' || ?1 || ',', ',' || level || ',') > 0) \
               AND (?2 IS NULL OR lower(target) LIKE '%' || lower(?2) || '%' OR lower(message) LIKE '%' || lower(?2) || '%' OR lower(ifnull(fields, '')) LIKE '%' || lower(?2) || '%') \
               AND (?3 IS NULL OR created_at < ?3 OR (created_at = ?3 AND id < ?4)) \
             ORDER BY created_at DESC, id DESC \
             LIMIT ?5",
        )
        .bind(level_csv)
        .bind(query)
        .bind(cursor_ts)
        .bind(cursor_id)
        .bind(limit)
        .fetch_all(self.pool.as_ref())
        .await?;

        Ok(rows
            .into_iter()
            .map(|row| RuntimeLogRow {
                id: row.get("id"),
                level: row.get("level"),
                target: row.get("target"),
                message: row.get("message"),
                fields: row.get("fields"),
                created_at: row.get("created_at"),
            })
            .collect())
    }
}
