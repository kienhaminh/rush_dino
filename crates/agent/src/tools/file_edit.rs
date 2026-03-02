use async_trait::async_trait;
use serde_json::{json, Value};
use std::path::Path;
use tokio::fs;

use rushdino_common::{AppError, Result};

use crate::tool_registry::Tool;

pub struct FileEditTool;

impl FileEditTool {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl Tool for FileEditTool {
    fn name(&self) -> &str {
        "file_edit"
    }

    fn description(&self) -> &str {
        "Edit a file by replacing exact text. The oldText must match exactly (including whitespace). Use this for precise, surgical edits."
    }

    fn parameters(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Path to the file to edit (relative or absolute)"
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
        let path = args
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

        // Read the file
        let content = fs::read_to_string(path)
            .await
            .map_err(|e| AppError::Io(format!("Failed to read file '{}': {}", path, e)))?;

        // Check if old_text exists in content
        if !content.contains(old_text) {
            return Err(AppError::Validation(format!(
                "oldText not found in file '{}'. The text must match exactly (including whitespace).",
                path
            )));
        }

        // Count occurrences
        let occurrences = content.matches(old_text).count();
        if occurrences > 1 {
            return Err(AppError::Validation(format!(
                "oldText appears {} times in file '{}'. Use a more specific oldText that matches exactly once.",
                occurrences, path
            )));
        }

        // Replace the text
        let new_content = content.replace(old_text, new_text);

        // Write back
        fs::write(path, new_content)
            .await
            .map_err(|e| AppError::Io(format!("Failed to write file '{}': {}", path, e)))?;

        Ok(format!(
            "Successfully edited file '{}'. Replaced {} occurrence(s).",
            path, occurrences
        ))
    }
}
