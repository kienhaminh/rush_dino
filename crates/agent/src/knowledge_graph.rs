use async_trait::async_trait;
use serde_json::Value;

use rushdino_common::Result;

#[async_trait]
pub trait KnowledgeGraphAccess: Send + Sync {
    async fn ingest_text(&self, source_type: &str, source_ref: &str, text: &str) -> Result<()>;

    async fn facts_for_prompt(
        &self,
        query: &str,
        conversation_id: Option<&str>,
        max_facts: usize,
    ) -> Result<Vec<String>>;

    async fn facts_as_json(&self, query: &str, limit: usize) -> Result<Value>;
}
