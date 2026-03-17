# Agent Read Files Outside Workspace — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow the agent's `read` tool to accept any absolute filesystem path, not just paths under `home_dir/documents/`.

**Architecture:** Single-file change in `FileReadTool`. Absolute paths bypass `validate_path` and are read directly; relative paths are validated against `docs_dir` as before. Tool description and parameter schema are updated so the agent knows to use absolute paths.

**Tech Stack:** Rust, `std::fs`, `rushdino_security::validation::validate_path`

---

## Chunk 1: Implementation + Tests

### Task 1: Write failing tests for the new behavior

**Files:**
- Modify: `crates/agent/src/tools/file_read.rs` (add `#[cfg(test)]` module at the bottom)

- [ ] **Step 1: Add a test module at the bottom of `file_read.rs`**

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::NamedTempFile;

    fn make_tool() -> FileReadTool {
        FileReadTool::new(std::env::temp_dir())
    }

    #[tokio::test]
    async fn reads_absolute_path_outside_docs_dir() {
        // Create a temp file outside the docs_dir
        let mut f = NamedTempFile::new().unwrap();
        writeln!(f, "hello from outside").unwrap();
        let path = f.path().to_str().unwrap().to_owned();

        let tool = make_tool();
        let result = tool
            .execute(serde_json::json!({ "path": path }))
            .await
            .unwrap();

        assert!(result.contains("hello from outside"));
    }

    #[tokio::test]
    async fn relative_path_still_resolves_under_docs_dir() {
        // Write a file inside docs_dir (temp_dir) with a known name
        let docs = std::env::temp_dir();
        let file_path = docs.join("test_relative.txt");
        std::fs::write(&file_path, "relative content").unwrap();

        let tool = FileReadTool::new(docs);
        let result = tool
            .execute(serde_json::json!({ "path": "test_relative.txt" }))
            .await
            .unwrap();

        assert_eq!(result, "relative content");
    }

    #[tokio::test]
    async fn absolute_path_nonexistent_returns_io_error() {
        let tool = make_tool();
        let result = tool
            .execute(serde_json::json!({ "path": "/nonexistent/path/that/does/not/exist.txt" }))
            .await;
        assert!(result.is_err());
    }
}
```

> **Note:** `tempfile` crate must be available as a dev-dependency. Check `crates/agent/Cargo.toml` — if it's missing, add it:
> ```toml
> [dev-dependencies]
> tempfile = "3"
> ```

- [ ] **Step 2: Run the tests — expect them to FAIL**

```bash
cd /path/to/RushDino
cargo test -p rushdino-agent tools::file_read::tests -- --nocapture 2>&1 | tail -30
```

Expected: `reads_absolute_path_outside_docs_dir` FAILS (absolute path gets joined with docs_dir and validation rejects it).

---

### Task 2: Implement the fix

**Files:**
- Modify: `crates/agent/src/tools/file_read.rs`

- [ ] **Step 3: Replace the `execute` body with the new path-resolution logic**

Replace the existing `execute` method body (lines 44–57) with:

```rust
async fn execute(&self, args: Value) -> Result<String> {
    let path_str = args
        .get("path")
        .and_then(Value::as_str)
        .ok_or_else(|| AppError::Validation("path is required".to_owned()))?;

    // Absolute paths bypass validate_path entirely — no root restriction.
    // Relative paths are resolved under docs_dir and validated as before.
    let target = if std::path::Path::new(path_str).is_absolute() {
        PathBuf::from(path_str)
    } else {
        // The `?` short-circuits on error, yielding PathBuf on success.
        validate_path(
            &self.docs_dir.join(path_str),
            std::slice::from_ref(&self.docs_dir),
        )
        .map_err(|e| AppError::Validation(format!("invalid path: {e}")))?
    };

    Ok(fs::read_to_string(target)?)
}
```

- [ ] **Step 4: Update `description()` and `parameters()`**

Change `description()`:
```rust
fn description(&self) -> &str {
    "Read a file. Provide an absolute path to read any file on the filesystem, \
     or a relative path to read from the workspace documents directory."
}
```

Update `parameters()` to add a description on the `path` field:
```rust
fn parameters(&self) -> Value {
    json!({
        "type": "object",
        "properties": {
            "path": {
                "type": "string",
                "description": "Absolute path to any file on the filesystem, \
                                or a relative path resolved from the workspace documents directory."
            }
        },
        "required": ["path"]
    })
}
```

- [ ] **Step 5: Run the tests — expect them to PASS**

```bash
cargo test -p rushdino-agent tools::file_read::tests -- --nocapture 2>&1 | tail -30
```

Expected: all 3 tests PASS.

- [ ] **Step 6: Run the full agent test suite to check for regressions**

```bash
cargo test -p rushdino-agent 2>&1 | tail -20
```

Expected: all tests PASS, no regressions.

- [ ] **Step 7: Commit**

```bash
git add crates/agent/src/tools/file_read.rs
git commit -m "feat: allow FileReadTool to read any absolute path on the filesystem"
```
