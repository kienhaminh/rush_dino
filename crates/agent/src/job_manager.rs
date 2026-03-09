use std::sync::Arc;

use chrono::Utc;
use sqlx::SqlitePool;
use tokio::{sync::mpsc, time::Duration};
use uuid::Uuid;

use rushdino_common::Result;

#[derive(Debug, Clone)]
pub struct JobResult {
    pub job_id: String,
    pub content: String,
    pub is_error: bool,
}

#[derive(Clone)]
pub struct JobManager {
    pool: Arc<SqlitePool>,
    inbox_tx: mpsc::Sender<JobResult>,
}

impl JobManager {
    pub fn new(pool: Arc<SqlitePool>, inbox_tx: mpsc::Sender<JobResult>) -> Self {
        Self { pool, inbox_tx }
    }

    pub async fn create_job(&self, instructions: String) -> Result<String> {
        let id = Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO jobs (id, instructions, status, result, created_at, completed_at) VALUES (?1, ?2, ?3, NULL, ?4, NULL)",
        )
        .bind(&id)
        .bind(&instructions)
        .bind("pending")
        .bind(Utc::now().to_rfc3339())
        .execute(self.pool.as_ref())
        .await?;

        let pool = self.pool.clone();
        let inbox = self.inbox_tx.clone();
        let job_id = id.clone();
        tokio::spawn(async move {
            let _ = sqlx::query("UPDATE jobs SET status = ?1 WHERE id = ?2")
                .bind("running")
                .bind(&job_id)
                .execute(pool.as_ref())
                .await;

            tokio::time::sleep(Duration::from_secs(1)).await;

            let result = format!("job completed: {instructions}");
            let _ = sqlx::query(
                "UPDATE jobs SET status = ?1, result = ?2, completed_at = ?3 WHERE id = ?4",
            )
            .bind("done")
            .bind(&result)
            .bind(Utc::now().to_rfc3339())
            .bind(&job_id)
            .execute(pool.as_ref())
            .await;

            let _ = inbox
                .send(JobResult {
                    job_id,
                    content: result,
                    is_error: false,
                })
                .await;
        });

        Ok(id)
    }
}
