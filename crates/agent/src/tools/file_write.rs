use std::path::PathBuf;

use async_trait::async_trait;
use serde_json::{json, Value};
use tokio::fs;

use rushdino_common::{AppError, Result};
use rushdino_security::validation::validate_path;

use crate::{
    tool_registry::Tool,
    tools::shell_exec::current_tool_execution_context,
};

pub struct FileWriteTool {
    /// The workspace root. All writes are restricted to this directory.
    workspace: PathBuf,
}

impl FileWriteTool {
    pub fn new(workspace: PathBuf) -> Self {
        Self { workspace }
    }
}

#[async_trait]
impl Tool for FileWriteTool {
    fn name(&self) -> &str {
        "write"
    }

    fn description(&self) -> &str {
        "Create or overwrite a file. \
        Path is relative to the workspace root."
    }

    fn parameters(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Path to the file to create or overwrite. \
                                    Relative paths are resolved from the workspace root."
                },
                "content": {
                    "type": "string",
                    "description": "Content to write to the file"
                }
            },
            "required": ["path", "content"]
        })
    }

    async fn execute(&self, args: Value) -> Result<String> {
        let path_str = args
            .get("path")
            .and_then(Value::as_str)
            .ok_or_else(|| AppError::Validation("missing required parameter 'path'".to_owned()))?;

        let content = args.get("content").and_then(Value::as_str).ok_or_else(|| {
            AppError::Validation("missing required parameter 'content'".to_owned())
        })?;

        // Use workspace_override from task-local context if set, otherwise self.workspace.
        let effective_workspace = current_tool_execution_context()
            .and_then(|ctx| ctx.workspace_override)
            .unwrap_or_else(|| self.workspace.clone());

        let raw = if std::path::Path::new(path_str).is_absolute() {
            PathBuf::from(path_str)
        } else {
            effective_workspace.join(path_str)
        };

        let target = validate_path(&raw, std::slice::from_ref(&effective_workspace))
            .map_err(|e| AppError::Validation(format!("invalid path: {e}")))?;

        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).await.map_err(AppError::Io)?;
        }

        fs::write(&target, content).await.map_err(AppError::Io)?;

        Ok(format!("written: {}", target.display()))
    }
}
