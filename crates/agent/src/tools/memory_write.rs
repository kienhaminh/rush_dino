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
        "Write text content to a memory file. \
         You MUST supply the full text as the 'content' parameter. \
         Use 'file' to target a specific file (e.g. SOUL.md, IDENTITY.md, USER.md, AGENTS.md, TOOLS.md); \
         omit 'file' to append to MEMORY.md. \
         Use 'daily: true' to append to today's daily log (memory/daily/YYYY-MM-DD.md) — \
         call this after completing any non-trivial task to log what was done and key findings. \
         Example: {\"content\": \"# Identity\\n\\nMy name is Aria.\", \"file\": \"IDENTITY.md\"}"
    }

    fn parameters(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "content": {
                    "type": "string",
                    "description": "Content to write"
                },
                "file": {
                    "type": "string",
                    "description": "Named soul file to write (e.g. SOUL.md, IDENTITY.md, USER.md). \
                                    Omit to write to MEMORY.md."
                },
                "daily": {
                    "type": "boolean",
                    "description": "If true and no `file` is given, writes to today's daily summary instead of MEMORY.md"
                }
            },
            "required": ["content"]
        })
    }

    async fn execute(&self, args: Value) -> Result<String> {
        let content = args
            .get("content")
            .and_then(Value::as_str)
            .ok_or_else(|| AppError::Validation(
                "missing required parameter 'content'. \
                 Call as: memory_write({\"content\": \"<the text to write>\", \"file\": \"SOUL.md\"})".to_owned()
            ))?;

        // If a specific soul file is requested, write there directly.
        if let Some(file) = args.get("file").and_then(Value::as_str) {
            let path = self.memory.write_named(file, content)?;
            if let Some(graph) = &self.graph {
                graph
                    .ingest_text("memory", &path.display().to_string(), content)
                    .await?;
            }
            return Ok(format!("written: {}", path.display()));
        }

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
