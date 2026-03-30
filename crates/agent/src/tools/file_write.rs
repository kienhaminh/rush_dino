use std::path::{Component, Path, PathBuf};

use async_trait::async_trait;
use serde_json::{json, Value};
use tokio::fs;

use rushdino_common::{AppError, Result};

use crate::{
    system_broker::SharedSystemBroker,
    tool_registry::Tool,
    tools::bash::current_tool_execution_context,
};

pub struct FileWriteTool {
    /// The workspace root. All writes are restricted to this directory.
    workspace: PathBuf,
    broker: Option<SharedSystemBroker>,
}

impl FileWriteTool {
    pub fn new(workspace: PathBuf) -> Self {
        Self { workspace, broker: None }
    }

    pub fn with_broker(mut self, broker: SharedSystemBroker) -> Self {
        self.broker = Some(broker);
        self
    }
}

fn resolve_write_target(workspace: &Path, path_str: &str) -> Result<PathBuf> {
    let canonical_workspace = workspace.canonicalize().map_err(AppError::Io)?;
    let input_path = Path::new(path_str);

    let mut target = if input_path.is_absolute() {
        PathBuf::new()
    } else {
        canonical_workspace.clone()
    };

    for component in input_path.components() {
        match component {
            Component::Prefix(prefix) => target.push(prefix.as_os_str()),
            Component::RootDir => target.push(component.as_os_str()),
            Component::CurDir => {}
            Component::Normal(segment) => target.push(segment),
            Component::ParentDir => {
                if input_path.is_absolute() {
                    if !target.pop() {
                        return Err(AppError::Validation(
                            "invalid path: path traversal attempt detected".to_owned(),
                        ));
                    }
                } else if target == canonical_workspace || !target.pop() {
                    return Err(AppError::Validation(
                        "invalid path: path traversal attempt detected".to_owned(),
                    ));
                }
            }
        }
    }

    if !target.starts_with(&canonical_workspace) {
        return Err(AppError::Validation(format!(
            "invalid path: path is not under an allowed root: {}",
            target.display()
        )));
    }

    Ok(target)
}

#[async_trait]
impl Tool for FileWriteTool {
    fn name(&self) -> &str {
        "write"
    }

    fn description(&self) -> &str {
        "Create or overwrite a file.         Path is relative to the workspace root."
    }

    fn parameters(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Path to the file to create or overwrite.                                     Relative paths are resolved from the workspace root."
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

        let raw_content = args.get("content").and_then(Value::as_str).ok_or_else(|| {
            AppError::Validation("missing required parameter 'content'".to_owned())
        })?;

        // Resolve any secret://uuid tokens before writing so secrets flow into
        // the file without ever passing through the LLM context.
        let content_owned;
        let content = if let Some(broker) = &self.broker {
            content_owned = broker.resolve_secrets(raw_content.to_owned()).await;
            content_owned.as_str()
        } else {
            raw_content
        };

        // Use workspace_override from task-local context if set, otherwise self.workspace.
        let effective_workspace = current_tool_execution_context()
            .and_then(|ctx| ctx.workspace_override)
            .unwrap_or_else(|| self.workspace.clone());

        let target = resolve_write_target(&effective_workspace, path_str)?;

        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).await.map_err(AppError::Io)?;
        }

        fs::write(&target, content).await.map_err(AppError::Io)?;

        Ok(format!("written: {}", target.display()))
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;
    use tempfile::tempdir;

    use super::*;

    #[test]
    fn resolves_new_relative_file_under_workspace() {
        let workspace = tempdir().unwrap();
        let target = resolve_write_target(workspace.path(), "nested/new.txt").unwrap();
        let expected = workspace.path().canonicalize().unwrap().join("nested/new.txt");
        assert_eq!(target, expected);
    }

    #[test]
    fn rejects_relative_traversal_outside_workspace() {
        let workspace = tempdir().unwrap();
        let err = resolve_write_target(workspace.path(), "../escape.txt").unwrap_err();
        assert!(format!("{err}").contains("path traversal attempt detected"));
    }

    #[tokio::test]
    async fn writes_new_file_that_does_not_yet_exist() {
        let workspace = tempdir().unwrap();
        let tool = FileWriteTool::new(workspace.path().to_path_buf());

        let result = tool
            .execute(json!({
                "path": "nested/new.txt",
                "content": "hello"
            }))
            .await;

        assert!(result.is_ok(), "expected Ok, got {result:?}");
        let written = std::fs::read_to_string(workspace.path().join("nested/new.txt")).unwrap();
        assert_eq!(written, "hello");
    }
}
