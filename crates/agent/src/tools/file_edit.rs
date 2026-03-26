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

pub struct FileEditTool {
    /// The workspace root. All edits are restricted to this directory.
    workspace: PathBuf,
}

impl FileEditTool {
    pub fn new(workspace: PathBuf) -> Self {
        Self { workspace }
    }
}

#[async_trait]
impl Tool for FileEditTool {
    fn name(&self) -> &str {
        "edit"
    }

    fn description(&self) -> &str {
        "Edit a file by replacing exact text. The oldText must match exactly (including whitespace). \
         Use this for precise, surgical edits. \
         Paths are relative to the workspace root or absolute paths under it."
    }

    fn parameters(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Path to the file to edit. Relative paths are resolved from the workspace root."
                },
                "oldText": {
                    "type": "string",
                    "description": "Exact text to find and replace (must match exactly including whitespace)"
                },
                "newText": {
                    "type": "string",
                    "description": "New text to replace the old text with"
                }
            },
            "required": ["path", "oldText", "newText"]
        })
    }

    async fn execute(&self, args: Value) -> Result<String> {
        let path_str = args
            .get("path")
            .and_then(Value::as_str)
            .ok_or_else(|| AppError::Validation("path is required".to_owned()))?;

        let old_text = args
            .get("oldText")
            .and_then(Value::as_str)
            .ok_or_else(|| AppError::Validation("oldText is required".to_owned()))?;

        let new_text = args
            .get("newText")
            .and_then(Value::as_str)
            .ok_or_else(|| AppError::Validation("newText is required".to_owned()))?;

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

        let content = fs::read_to_string(&target).await.map_err(AppError::Io)?;

        if !content.contains(old_text) {
            return Err(AppError::Validation(format!(
                "oldText not found in file '{}'. The text must match exactly (including whitespace).",
                target.display()
            )));
        }

        let occurrences = content.matches(old_text).count();
        if occurrences > 1 {
            return Err(AppError::Validation(format!(
                "oldText appears {} times in file '{}'. Use a more specific oldText that matches exactly once.",
                occurrences,
                target.display()
            )));
        }

        let new_content = content.replace(old_text, new_text);
        fs::write(&target, new_content)
            .await
            .map_err(AppError::Io)?;

        Ok(format!(
            "Successfully edited file '{}'. Replaced {} occurrence(s).",
            target.display(),
            occurrences
        ))
    }
}
