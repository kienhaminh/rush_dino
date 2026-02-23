use std::{fs, path::PathBuf};

use async_trait::async_trait;
use serde_json::{json, Value};

use rushdino_common::{AppError, Result};

use crate::tool_registry::Tool;

pub struct FileReadTool {
    docs_dir: PathBuf,
}

impl FileReadTool {
    pub fn new(docs_dir: PathBuf) -> Self {
        Self { docs_dir }
    }
}

#[async_trait]
impl Tool for FileReadTool {
    fn name(&self) -> &str {
        "file_read"
    }

    fn description(&self) -> &str {
        "Read file from ~/.rushdino/documents"
    }

    fn parameters(&self) -> Value {
        json!({
            "type": "object",
            "properties": {"path": {"type": "string"}},
            "required": ["path"]
        })
    }

    async fn execute(&self, args: Value) -> Result<String> {
        let path = args
            .get("path")
            .and_then(Value::as_str)
            .ok_or_else(|| AppError::Validation("path is required".to_owned()))?;

        let cleaned = path.replace("..", "").replace('\\', "/");
        let target = self.docs_dir.join(cleaned.trim_start_matches('/'));
        if !target.starts_with(&self.docs_dir) {
            return Err(AppError::Validation("invalid path".to_owned()));
        }

        Ok(fs::read_to_string(target)?)
    }
}
