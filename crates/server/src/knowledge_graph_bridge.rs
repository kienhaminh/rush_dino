use std::sync::Arc;

use async_trait::async_trait;

use rushdino_agent::KnowledgeGraphAccess;
use rushdino_common::Result;
use rushdino_knowledge_graph::KnowledgeGraphService;

pub struct KnowledgeGraphBridge {
    service: Arc<KnowledgeGraphService>,
}

impl KnowledgeGraphBridge {
    pub fn new(service: Arc<KnowledgeGraphService>) -> Self {
        Self { service }
    }
}

#[async_trait]
impl KnowledgeGraphAccess for KnowledgeGraphBridge {
    async fn ingest_text(&self, source_type: &str, source_ref: &str, text: &str) -> Result<()> {
        let _ = self
            .service
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
        let configured = self.service.config().max_context_facts as usize;
        let limit = max_facts.min(configured).max(1);
        self.service
            .facts_for_prompt(query, conversation_id, limit)
            .await
    }

    async fn facts_as_json(&self, query: &str, limit: usize) -> Result<serde_json::Value> {
        self.service.facts_as_json(query, limit).await
    }
}
