use std::sync::Arc;

use async_trait::async_trait;
use serde_json::{json, Value};

use rushdino_common::{AppError, Result};

use crate::{memory::MemoryManager, tool_registry::Tool};

pub struct MemoryReadTool {
    memory: Arc<MemoryManager>,
}

impl MemoryReadTool {
    pub fn new(memory: Arc<MemoryManager>) -> Self {
        Self { memory }
    }
}

#[async_trait]
impl Tool for MemoryReadTool {
    fn name(&self) -> &str {
        "memory_read"
    }

    fn description(&self) -> &str {
        "Read a memory markdown file"
    }

    fn parameters(&self) -> Value {
        json!({
            "type": "object",
            "properties": {"file": {"type": "string"}},
            "required": ["file"]
        })
    }

    async fn execute(&self, args: Value) -> Result<String> {
        let file = args
            .get("file")
            .and_then(Value::as_str)
            .ok_or_else(|| AppError::Validation("file is required".to_owned()))?;
        self.memory.read_named(file)
    }
}
