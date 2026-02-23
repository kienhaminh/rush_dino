use std::sync::Arc;

use chrono::Utc;
use sqlx::SqlitePool;
use tokio::sync::mpsc;
use uuid::Uuid;

use rushdino_common::{models::Message, models::Role, Result};
use rushdino_providers::{types::ChatRequest, Provider};

use crate::{job_manager::JobResult, memory::MemoryManager};

#[derive(Clone)]
pub struct Orchestrator {
    provider: Arc<Provider>,
    _pool: Arc<SqlitePool>,
    _memory: Arc<MemoryManager>,
    inbox_tx: mpsc::Sender<JobResult>,
}

impl Orchestrator {
    pub fn new(
        provider: Arc<Provider>,
        pool: Arc<SqlitePool>,
        memory: Arc<MemoryManager>,
        inbox_tx: mpsc::Sender<JobResult>,
    ) -> Self {
        Self {
            provider,
            _pool: pool,
            _memory: memory,
            inbox_tx,
        }
    }

    pub async fn spawn_sub_agent(&self, instructions: String) -> Result<String> {
        let task_id = Uuid::new_v4().to_string();
        let content = self
            .provider
            .chat(ChatRequest {
                messages: vec![Message {
                    id: Uuid::new_v4().to_string(),
                    role: Role::User,
                    content: instructions.clone(),
                    tool_calls: None,
                    created_at: Utc::now(),
                }],
                tools: None,
                temperature: Some(0.2),
                max_tokens: Some(800),
                model: None,
            })
            .await
            .map(|res| res.content)
            .unwrap_or_else(|_| "sub-agent execution failed".to_owned());

        let _ = self
            .inbox_tx
            .send(JobResult {
                job_id: task_id.clone(),
                content,
                is_error: false,
            })
            .await;

        Ok(task_id)
    }
}
