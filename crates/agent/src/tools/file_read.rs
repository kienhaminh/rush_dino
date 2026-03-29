use std::{
    fs,
    io::{BufRead, BufReader},
    path::{Path, PathBuf},
};

use async_trait::async_trait;
use serde_json::{json, Value};

use rushdino_common::{AppError, Result};
use rushdino_security::validation::validate_path;

use crate::tool_registry::Tool;

/// Default maximum number of lines returned per read.
const DEFAULT_LIMIT: usize = 2000;

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

/// Read a file with offset/limit and return content with line numbers.
fn read_with_pagination(path: &Path, offset: usize, limit: usize) -> Result<String> {
    let file = fs::File::open(path)?;
    let reader = BufReader::new(file);

    let all_lines: Vec<String> = reader.lines().map_while(std::result::Result::ok).collect();
    let total_lines = all_lines.len();

    if offset >= total_lines {
        return Ok(format!(
            "[file has {total_lines} lines, offset {offset} is past end]"
        ));
    }

    let end = (offset + limit).min(total_lines);
    let selected = &all_lines[offset..end];

    // Format with line numbers (1-indexed, right-aligned).
    let width = format!("{}", end).len();
    let mut output = String::new();
    for (i, line) in selected.iter().enumerate() {
        let line_num = offset + i + 1; // 1-indexed
        output.push_str(&format!("{line_num:>width$}\t{line}\n"));
    }

    // Append metadata footer when file is larger than the returned window.
    if total_lines > limit || offset > 0 {
        output.push_str(&format!(
            "\n[lines {}-{} of {} total]",
            offset + 1,
            end,
            total_lines
        ));
    }

    Ok(output)
}

#[async_trait]
impl Tool for FileReadTool {
    fn name(&self) -> &str {
        "read"
    }

    fn description(&self) -> &str {
        "Read a file with line numbers. Supports `offset` and `limit` for chunked reading \
         of large files (default: first 2000 lines). Provide an absolute path to read any \
         file, or a relative path resolved from the rushdino home directory."
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
                },
                "offset": {
                    "type": "integer",
                    "description": "Line number to start reading from (0-indexed, default 0)",
                    "minimum": 0
                },
                "limit": {
                    "type": "integer",
                    "description": "Maximum number of lines to return (default 2000)",
                    "minimum": 1
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

        let offset = args
            .get("offset")
            .and_then(Value::as_u64)
            .unwrap_or(0) as usize;

        let limit = args
            .get("limit")
            .and_then(Value::as_u64)
            .map(|v| v as usize)
            .unwrap_or(DEFAULT_LIMIT);

        let path = Path::new(path_str);

        // INTENTIONAL: Absolute paths bypass all root validation by design.
        // The agent is trusted — the operator controls which agents run and what
        // they can access. This is not exposed to untrusted external input.
        if path.is_absolute() {
            read_with_pagination(path, offset, limit)
        } else {
            // Relative paths always resolve under home_dir (~/.rushdino).
            // workspace_override is intentionally ignored here — memory files and
            // other home-relative paths must not shift when a delegated agent has
            // a project workspace set.
            let target = self.home_dir.join(path_str);
            let canonical = validate_path(&target, std::slice::from_ref(&self.home_dir))
                .map_err(|e| AppError::Validation(format!("invalid path: {e}")))?;
            read_with_pagination(&canonical, offset, limit)
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
        // Now returns line-numbered output.
        assert!(result.unwrap().contains(expected));
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
        assert!(result.unwrap().contains("today's note"));
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

    #[tokio::test]
    async fn output_includes_line_numbers() {
        let mut tmp = NamedTempFile::new().expect("create temp file");
        write!(tmp, "line one\nline two\nline three").unwrap();

        let home_dir = tempfile::tempdir().unwrap();
        let tool = make_tool(home_dir.path().to_path_buf());
        let abs_path = tmp.path().to_str().unwrap().to_owned();

        let result = tool.execute(json!({"path": abs_path})).await.unwrap();
        assert!(result.contains("1\tline one"));
        assert!(result.contains("2\tline two"));
        assert!(result.contains("3\tline three"));
    }

    #[tokio::test]
    async fn offset_and_limit_work() {
        let mut tmp = NamedTempFile::new().expect("create temp file");
        write!(tmp, "a\nb\nc\nd\ne").unwrap();

        let home_dir = tempfile::tempdir().unwrap();
        let tool = make_tool(home_dir.path().to_path_buf());
        let abs_path = tmp.path().to_str().unwrap().to_owned();

        let result = tool
            .execute(json!({"path": abs_path, "offset": 1, "limit": 2}))
            .await
            .unwrap();

        assert!(result.contains("2\tb"));
        assert!(result.contains("3\tc"));
        assert!(!result.contains("1\ta"));
        assert!(!result.contains("4\td"));
        assert!(result.contains("[lines 2-3 of 5 total]"));
    }
}
