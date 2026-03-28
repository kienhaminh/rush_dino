use std::sync::Arc;

use async_trait::async_trait;

use rushdino_agent::KnowledgeGraphAccess;
use rushdino_common::Result;
use rushdino_knowledge_graph::KgGateway;

/// Adapts [`KgGateway`] to the [`KnowledgeGraphAccess`] trait expected by the
/// agent engine. The bridge lives in the server crate because it depends on
/// both `rushdino-agent` and `rushdino-knowledge-graph`.
pub struct KnowledgeGraphBridge {
    gateway: Arc<KgGateway>,
}

impl KnowledgeGraphBridge {
    pub fn new(gateway: Arc<KgGateway>) -> Self {
        Self { gateway }
    }
}

#[async_trait]
impl KnowledgeGraphAccess for KnowledgeGraphBridge {
    async fn ingest_text(&self, source_type: &str, source_ref: &str, text: &str) -> Result<()> {
        let _ = self
            .gateway
            .ingest_text(source_type, source_ref, text)
            .await?;
        Ok(())
    }

    async fn facts_for_prompt(
        &self,
        query: &str,
        conversation_id: Option<&str>,
        max_facts: usize,
    ) -> Result<Vec<String>> {
        let configured = self.gateway.config().max_context_facts as usize;
        let limit = max_facts.min(configured).max(1);
        self.gateway
            .facts_for_prompt(query, conversation_id, limit)
            .await
    }

    async fn facts_as_json(&self, query: &str, limit: usize) -> Result<serde_json::Value> {
        self.gateway.facts_as_json(query, limit).await
    }
}
