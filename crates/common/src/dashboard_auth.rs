use chrono::{Duration, Utc};
use serde::Serialize;
use sha2::{Digest, Sha256};
use sqlx::{Row, SqlitePool};
use uuid::Uuid;

use crate::{AppError, Result};

const DASHBOARD_CODE_TTL_MINUTES: i64 = 5;
const DASHBOARD_SESSION_TTL_DAYS: i64 = 7;
const CODE_ALPHABET: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_GROUPS: usize = 3;
const CODE_GROUP_LEN: usize = 4;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DashboardIssuedCode {
    pub code: String,
    pub expires_at: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DashboardIssuedSession {
    pub token: String,
    pub expires_at: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DashboardSessionRecord {
    pub id: String,
    pub expires_at: String,
    pub last_seen_at: String,
}

pub struct DashboardAuthService {
    pool: SqlitePool,
}

impl DashboardAuthService {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn issue_code(&self) -> Result<DashboardIssuedCode> {
        self.ensure_schema().await?;

        let now = Utc::now().to_rfc3339();
        sqlx::query(
            "UPDATE dashboard_login_codes
             SET revoked_at = ?1
             WHERE consumed_at IS NULL AND revoked_at IS NULL",
        )
        .bind(&now)
        .execute(&self.pool)
        .await?;

        let code = generate_login_code();
        let expires_at = (Utc::now() + Duration::minutes(DASHBOARD_CODE_TTL_MINUTES)).to_rfc3339();
        sqlx::query(
            "INSERT INTO dashboard_login_codes
             (id, code_hash, created_at, expires_at, consumed_at, revoked_at)
             VALUES (?1, ?2, ?3, ?4, NULL, NULL)",
        )
        .bind(Uuid::new_v4().to_string())
        .bind(hash_secret(&code))
        .bind(&now)
        .bind(&expires_at)
        .execute(&self.pool)
        .await?;

        Ok(DashboardIssuedCode { code, expires_at })
    }

    pub async fn exchange_code(&self, code: &str) -> Result<DashboardIssuedSession> {
        self.ensure_schema().await?;

        let now = Utc::now();
        let now_rfc3339 = now.to_rfc3339();
        let code_hash = hash_secret(code);

        let mut tx = self.pool.begin().await?;
        let login_code = sqlx::query(
            "SELECT id, expires_at, consumed_at, revoked_at
             FROM dashboard_login_codes
             WHERE code_hash = ?1",
        )
        .bind(&code_hash)
        .fetch_optional(tx.as_mut())
        .await?;

        let Some(login_code) = login_code else {
            return Err(AppError::Validation(
                "dashboard login code is invalid or expired".to_owned(),
            ));
        };

        let expires_at = login_code.get::<String, _>("expires_at");
        let consumed_at = login_code.get::<Option<String>, _>("consumed_at");
        let revoked_at = login_code.get::<Option<String>, _>("revoked_at");
        if consumed_at.is_some() || revoked_at.is_some() || expires_at <= now_rfc3339 {
            return Err(AppError::Validation(
                "dashboard login code is invalid or expired".to_owned(),
            ));
        }

        let update_result = sqlx::query(
            "UPDATE dashboard_login_codes
             SET consumed_at = ?2
             WHERE id = ?1 AND consumed_at IS NULL AND revoked_at IS NULL",
        )
        .bind(login_code.get::<String, _>("id"))
        .bind(&now_rfc3339)
        .execute(tx.as_mut())
        .await?;
        if update_result.rows_affected() != 1 {
            return Err(AppError::Validation(
                "dashboard login code is invalid or expired".to_owned(),
            ));
        }

        sqlx::query(
            "UPDATE dashboard_sessions
             SET revoked_at = ?1
             WHERE revoked_at IS NULL",
        )
        .bind(&now_rfc3339)
        .execute(tx.as_mut())
        .await?;

        let token = format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple());
        let session_expires_at =
            (now + Duration::days(DASHBOARD_SESSION_TTL_DAYS)).to_rfc3339();
        sqlx::query(
            "INSERT INTO dashboard_sessions
             (id, session_hash, created_from_code_id, created_at, expires_at, last_seen_at, revoked_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?4, NULL)",
        )
        .bind(Uuid::new_v4().to_string())
        .bind(hash_secret(&token))
        .bind(login_code.get::<String, _>("id"))
        .bind(&now_rfc3339)
        .bind(&session_expires_at)
        .execute(tx.as_mut())
        .await?;

        tx.commit().await?;

        Ok(DashboardIssuedSession {
            token,
            expires_at: session_expires_at,
        })
    }

    pub async fn validate_session(&self, token: &str) -> Result<Option<DashboardSessionRecord>> {
        self.ensure_schema().await?;

        let now = Utc::now().to_rfc3339();
        let session_hash = hash_secret(token);
        let row = sqlx::query(
            "SELECT id, expires_at, last_seen_at
             FROM dashboard_sessions
             WHERE session_hash = ?1 AND revoked_at IS NULL",
        )
        .bind(&session_hash)
        .fetch_optional(&self.pool)
        .await?;

        let Some(row) = row else {
            return Ok(None);
        };

        let expires_at = row.get::<String, _>("expires_at");
        if expires_at <= now {
            sqlx::query(
                "UPDATE dashboard_sessions
                 SET revoked_at = ?2
                 WHERE id = ?1 AND revoked_at IS NULL",
            )
            .bind(row.get::<String, _>("id"))
            .bind(&now)
            .execute(&self.pool)
            .await?;
            return Ok(None);
        }

        sqlx::query(
            "UPDATE dashboard_sessions
             SET last_seen_at = ?2
             WHERE id = ?1",
        )
        .bind(row.get::<String, _>("id"))
        .bind(&now)
        .execute(&self.pool)
        .await?;

        Ok(Some(DashboardSessionRecord {
            id: row.get("id"),
            expires_at,
            last_seen_at: now,
        }))
    }

    pub async fn revoke_active_sessions(&self) -> Result<()> {
        self.ensure_schema().await?;
        sqlx::query(
            "UPDATE dashboard_sessions
             SET revoked_at = ?1
             WHERE revoked_at IS NULL",
        )
        .bind(Utc::now().to_rfc3339())
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn revoke_session(&self, token: &str) -> Result<()> {
        self.ensure_schema().await?;
        sqlx::query(
            "UPDATE dashboard_sessions
             SET revoked_at = ?1
             WHERE session_hash = ?2 AND revoked_at IS NULL",
        )
        .bind(Utc::now().to_rfc3339())
        .bind(hash_secret(token))
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    async fn ensure_schema(&self) -> Result<()> {
        sqlx::query(
            "CREATE TABLE IF NOT EXISTS dashboard_login_codes (
                id TEXT PRIMARY KEY,
                code_hash TEXT NOT NULL UNIQUE,
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                consumed_at TEXT,
                revoked_at TEXT
            )",
        )
        .execute(&self.pool)
        .await?;

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS dashboard_sessions (
                id TEXT PRIMARY KEY,
                session_hash TEXT NOT NULL UNIQUE,
                created_from_code_id TEXT,
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                last_seen_at TEXT NOT NULL,
                revoked_at TEXT,
                FOREIGN KEY(created_from_code_id) REFERENCES dashboard_login_codes(id) ON DELETE SET NULL
            )",
        )
        .execute(&self.pool)
        .await?;

        Ok(())
    }
}

fn hash_secret(value: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(value.as_bytes());
    hex::encode(hasher.finalize())
}

fn generate_login_code() -> String {
    let mut groups = Vec::with_capacity(CODE_GROUPS);
    for _ in 0..CODE_GROUPS {
        let mut group = String::with_capacity(CODE_GROUP_LEN);
        for _ in 0..CODE_GROUP_LEN {
            let idx = (rand::random::<u8>() as usize) % CODE_ALPHABET.len();
            group.push(CODE_ALPHABET[idx] as char);
        }
        groups.push(group);
    }
    groups.join("-")
}
