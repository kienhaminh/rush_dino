use std::{fs, path::PathBuf};

use async_trait::async_trait;
use serde_json::{json, Value};

use rushdino_common::{AppError, Result};
use rushdino_security::validation::validate_path;

use crate::tool_registry::Tool;

pub struct FileReadTool {
    /// The allowed root directory. Only files under this path may be read.
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
        "read"
    }

    fn description(&self) -> &str {
        "Read a file"
    }

    fn parameters(&self) -> Value {
        json!({
            "type": "object",
            "properties": {"path": {"type": "string"}},
            "required": ["path"]
        })
    }

    async fn execute(&self, args: Value) -> Result<String> {
        let path_str = args
            .get("path")
            .and_then(Value::as_str)
            .ok_or_else(|| AppError::Validation("path is required".to_owned()))?;

        // Canonicalize and verify the path is under the allowed root.
        // This replaces the old naive `.replace("..", "")` which was bypassable.
        let target = self.docs_dir.join(path_str.trim_start_matches('/'));
        let canonical = validate_path(&target, std::slice::from_ref(&self.docs_dir))
            .map_err(|e| AppError::Validation(format!("invalid path: {e}")))?;

        Ok(fs::read_to_string(canonical)?)
    }
}
