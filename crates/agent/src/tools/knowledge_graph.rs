use std::sync::Arc;

use async_trait::async_trait;
use serde_json::{json, Value};

use rushdino_common::{AppError, Result};

use crate::{knowledge_graph::KnowledgeGraphAccess, tool_registry::Tool};

pub struct KnowledgeGraphTool {
    graph: Arc<dyn KnowledgeGraphAccess>,
}

impl KnowledgeGraphTool {
    pub fn new(graph: Arc<dyn KnowledgeGraphAccess>) -> Self {
        Self { graph }
    }
}

#[async_trait]
impl Tool for KnowledgeGraphTool {
    fn name(&self) -> &str {
        "knowledge_graph"
    }

    fn description(&self) -> &str {
        "Query local knowledge graph facts by entity or relation phrase"
    }

    fn parameters(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "query": {"type": "string"},
                "limit": {"type": "integer", "minimum": 1, "maximum": 50}
            },
            "required": ["query"]
        })
    }

    async fn execute(&self, args: Value) -> Result<String> {
        let query = args
            .get("query")
            .and_then(Value::as_str)
            .ok_or_else(|| AppError::Validation("query is required".to_owned()))?;
        let limit = args
            .get("limit")
            .and_then(Value::as_u64)
            .map(|n| n.clamp(1, 50) as usize)
            .unwrap_or(10);

        let payload = self.graph.facts_as_json(query, limit).await?;
        serde_json::to_string_pretty(&payload)
            .map_err(|e| AppError::Validation(format!("failed to encode graph facts JSON: {e}")))
    }
}
