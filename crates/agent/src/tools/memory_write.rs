use std::sync::Arc;

use async_trait::async_trait;
use serde_json::{json, Value};

use rushdino_common::{AppError, Result};

use crate::{knowledge_graph::KnowledgeGraphAccess, memory::MemoryManager, tool_registry::Tool};

pub struct MemoryWriteTool {
    memory: Arc<MemoryManager>,
    graph: Option<Arc<dyn KnowledgeGraphAccess>>,
}

impl MemoryWriteTool {
    pub fn new(memory: Arc<MemoryManager>, graph: Option<Arc<dyn KnowledgeGraphAccess>>) -> Self {
        Self { memory, graph }
    }
}

#[async_trait]
impl Tool for MemoryWriteTool {
    fn name(&self) -> &str {
        "memory_write"
    }

    fn description(&self) -> &str {
        "Write memory to MEMORY.md or daily summary"
    }

    fn parameters(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "content": {"type": "string"},
                "daily": {"type": "boolean"}
            },
            "required": ["content"]
        })
    }

    async fn execute(&self, args: Value) -> Result<String> {
        let content = args
            .get("content")
            .and_then(Value::as_str)
            .ok_or_else(|| AppError::Validation("content is required".to_owned()))?;
        let daily = args.get("daily").and_then(Value::as_bool).unwrap_or(false);
        let path = self.memory.write_memory(content, daily)?;
        if let Some(graph) = &self.graph {
            graph
                .ingest_text("memory", &path.display().to_string(), content)
                .await?;
        }
        Ok(format!("written: {}", path.display()))
    }
}
