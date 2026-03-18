use std::sync::Arc;

use async_trait::async_trait;
use serde_json::{json, Value};

use rushdino_common::{AppError, Result};
use rushdino_data_sources::DataSourceRegistry;

use crate::tool_registry::Tool;

pub struct KnowledgeGraphWriteTool {
    registry: Arc<DataSourceRegistry>,
}

impl KnowledgeGraphWriteTool {
    pub fn new(registry: Arc<DataSourceRegistry>) -> Self {
        Self { registry }
    }
}

#[async_trait]
impl Tool for KnowledgeGraphWriteTool {
    fn name(&self) -> &str {
        "kg_write"
    }

    fn description(&self) -> &str {
        "Ingest free-form text into a knowledge graph so facts can be retrieved later"
    }

    fn parameters(&self) -> Value {
        let graphs: Vec<String> = self
            .registry
            .kg_summary()
            .into_iter()
            .map(|(name, desc)| format!("{name}: {desc}"))
            .collect();
        let graph_hint = if graphs.is_empty() {
            "local".to_owned()
        } else {
            graphs.join(", ")
        };

        json!({
            "type": "object",
            "properties": {
                "text": {
                    "type": "string",
                    "description": "Text content to ingest and extract facts from"
                },
                "source_ref": {
                    "type": "string",
                    "description": "Unique identifier for this content (e.g. document name, URL)"
                },
                "graph": {
                    "type": "string",
                    "description": format!("Target knowledge graph. Available: {graph_hint}"),
                    "default": "local"
                }
            },
            "required": ["text", "source_ref"]
        })
    }

    async fn execute(&self, args: Value) -> Result<String> {
        let text = args
            .get("text")
            .and_then(Value::as_str)
            .ok_or_else(|| AppError::Validation("text is required".to_owned()))?;
        let source_ref = args
            .get("source_ref")
            .and_then(Value::as_str)
            .ok_or_else(|| AppError::Validation("source_ref is required".to_owned()))?;
        let graph_name = args
            .get("graph")
            .and_then(Value::as_str)
            .unwrap_or("local");

        let source = self
            .registry
            .kg_source(graph_name)
            .ok_or_else(|| {
                AppError::Validation(format!("unknown knowledge graph: '{graph_name}'"))
            })?;

        source.backend.ingest_text("api", source_ref, text).await?;
        Ok(format!(
            "Text ingested into knowledge graph '{graph_name}' (source_ref: {source_ref})"
        ))
    }
}
