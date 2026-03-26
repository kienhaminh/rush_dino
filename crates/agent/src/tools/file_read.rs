use std::{fs, path::{Path, PathBuf}};

use async_trait::async_trait;
use serde_json::{json, Value};

use rushdino_common::{AppError, Result};
use rushdino_security::validation::validate_path;

use crate::tool_registry::Tool;

pub struct FileReadTool {
    /// Home directory (~/.rushdino). Relative paths are resolved here so that
    /// sub-paths like `memory/daily/YYYY-MM-DD.md` or `documents/foo.txt` work
    /// without requiring the caller to supply an absolute path.
    home_dir: PathBuf,
}

impl FileReadTool {
    pub fn new(home_dir: PathBuf) -> Self {
        Self { home_dir }
    }
}

#[async_trait]
impl Tool for FileReadTool {
    fn name(&self) -> &str {
        "read"
    }

    fn description(&self) -> &str {
        "Read a file. Provide an absolute path to read any file on the filesystem, \
         or a relative path resolved from the rushdino home directory \
         (e.g. `documents/notes.txt`, `memory/daily/2026-03-21.md`, `MEMORY.md`)."
    }

    fn parameters(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Absolute path to any file on the filesystem, or a relative path \
                                    resolved from the rushdino home directory \
                                    (e.g. `documents/notes.txt`, `memory/daily/2026-03-21.md`)."
                }
            },
            "required": ["path"]
        })
    }

    async fn execute(&self, args: Value) -> Result<String> {
        let path_str = args
            .get("path")
            .and_then(Value::as_str)
            .ok_or_else(|| AppError::Validation("path is required".to_owned()))?;

        let path = Path::new(path_str);

        // INTENTIONAL: Absolute paths bypass all root validation by design.
        // The agent is trusted — the operator controls which agents run and what
        // they can access. This is not exposed to untrusted external input.
        if path.is_absolute() {
            // Absolute paths bypass home_dir restriction — read directly from the filesystem.
            Ok(fs::read_to_string(path)?)
        } else {
            // Relative paths always resolve under home_dir (~/.rushdino).
            // workspace_override is intentionally ignored here — memory files and
            // other home-relative paths must not shift when a delegated agent has
            // a project workspace set.
            let target = self.home_dir.join(path_str);
            let canonical = validate_path(&target, std::slice::from_ref(&self.home_dir))
                .map_err(|e| AppError::Validation(format!("invalid path: {e}")))?;
            Ok(fs::read_to_string(canonical)?)
        }
    }
}

#[cfg(test)]
mod tests {
    use std::io::Write;

    use tempfile::NamedTempFile;

    use serde_json::json;

    use super::*;

    fn make_tool(home_dir: PathBuf) -> FileReadTool {
        FileReadTool::new(home_dir)
    }

    #[tokio::test]
    async fn reads_absolute_path_outside_home_dir() {
        // Create a temp file completely outside home_dir.
        let mut tmp = NamedTempFile::new().expect("create temp file");
        let expected = "hello from absolute path";
        write!(tmp, "{expected}").unwrap();

        let home_dir = tempfile::tempdir().unwrap();
        let tool = make_tool(home_dir.path().to_path_buf());

        let abs_path = tmp.path().to_str().unwrap().to_owned();
        let result = tool.execute(json!({"path": abs_path})).await;

        assert!(result.is_ok(), "expected Ok, got {result:?}");
        assert!(result.unwrap().contains(expected));
    }

    #[tokio::test]
    async fn relative_path_resolves_under_home_dir() {
        let home_dir = tempfile::tempdir().unwrap();
        let file_path = home_dir.path().join("notes.txt");
        let expected = "relative content";
        fs::write(&file_path, expected).unwrap();

        let tool = make_tool(home_dir.path().to_path_buf());

        let result = tool.execute(json!({"path": "notes.txt"})).await;

        assert!(result.is_ok(), "expected Ok, got {result:?}");
        assert_eq!(result.unwrap(), expected);
    }

    #[tokio::test]
    async fn relative_path_resolves_daily_memory() {
        let home_dir = tempfile::tempdir().unwrap();
        let daily_dir = home_dir.path().join("memory").join("daily");
        fs::create_dir_all(&daily_dir).unwrap();
        fs::write(daily_dir.join("2026-03-21.md"), "today's note").unwrap();

        let tool = make_tool(home_dir.path().to_path_buf());

        let result = tool
            .execute(json!({"path": "memory/daily/2026-03-21.md"}))
            .await;

        assert!(result.is_ok(), "expected Ok, got {result:?}");
        assert_eq!(result.unwrap(), "today's note");
    }

    #[tokio::test]
    async fn absolute_path_nonexistent_returns_io_error() {
        let home_dir = tempfile::tempdir().unwrap();
        let tool = make_tool(home_dir.path().to_path_buf());

        let result = tool
            .execute(json!({"path": "/tmp/__rushdino_nonexistent_file_xyz__.txt"}))
            .await;

        assert!(result.is_err(), "expected Err for non-existent path");
    }

    #[tokio::test]
    async fn relative_traversal_is_rejected() {
        let home = tempfile::tempdir().unwrap();
        let tool = FileReadTool::new(home.path().to_path_buf());

        let result = tool
            .execute(serde_json::json!({ "path": "../../../etc/passwd" }))
            .await;
        assert!(result.is_err(), "path traversal should be rejected");
    }
}
