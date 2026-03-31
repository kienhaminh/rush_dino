use std::path::{Path, PathBuf};

use async_trait::async_trait;
use serde_json::{json, Value};
use walkdir::WalkDir;

use rushdino_common::{AppError, Result};

use crate::{tool_registry::Tool, tools::bash::current_tool_execution_context};

pub struct GlobSearchTool {
    workspace: PathBuf,
}

impl GlobSearchTool {
    pub fn new(workspace: PathBuf) -> Self {
        Self { workspace }
    }
}

/// Check if a path matches a glob pattern.
///
/// Supports: `*` (single segment), `**` (recursive), `?` (single char),
/// `{a,b}` (alternation), `[abc]` (character class).
fn glob_matches(pattern: &str, path: &str) -> bool {
    let alternatives = expand_braces(pattern);
    alternatives.iter().any(|alt| glob_match_single(alt, path))
}

/// Expand `{a,b,c}` brace patterns into all alternatives.
fn expand_braces(pattern: &str) -> Vec<String> {
    if let Some(open) = pattern.find('{') {
        if let Some(close) = pattern[open..].find('}') {
            let close = open + close;
            let prefix = &pattern[..open];
            let suffix = &pattern[close + 1..];
            let alternatives = &pattern[open + 1..close];
            return alternatives
                .split(',')
                .flat_map(|alt| expand_braces(&format!("{prefix}{alt}{suffix}")))
                .collect();
        }
    }
    vec![pattern.to_owned()]
}

fn glob_match_single(pattern: &str, path: &str) -> bool {
    let pat_segments: Vec<&str> = pattern.split('/').collect();
    let path_segments: Vec<&str> = path.split('/').collect();
    match_segments(&pat_segments, &path_segments)
}

fn match_segments(pat: &[&str], path: &[&str]) -> bool {
    if pat.is_empty() {
        return path.is_empty();
    }

    if pat[0] == "**" {
        // `**` matches zero or more path segments.
        if match_segments(&pat[1..], path) {
            return true;
        }
        if !path.is_empty() {
            return match_segments(pat, &path[1..]);
        }
        return false;
    }

    if path.is_empty() {
        return false;
    }

    if match_segment(pat[0], path[0]) {
        return match_segments(&pat[1..], &path[1..]);
    }

    false
}

/// Match a single path segment against a glob segment pattern.
/// Supports `*`, `?`, and `[abc]` character classes.
fn match_segment(pattern: &str, segment: &str) -> bool {
    let pat: Vec<char> = pattern.chars().collect();
    let seg: Vec<char> = segment.chars().collect();
    match_chars(&pat, &seg)
}

fn match_chars(pat: &[char], seg: &[char]) -> bool {
    if pat.is_empty() {
        return seg.is_empty();
    }

    match pat[0] {
        '*' => {
            // `*` matches zero or more characters within a segment.
            if match_chars(&pat[1..], seg) {
                return true;
            }
            if !seg.is_empty() {
                return match_chars(pat, &seg[1..]);
            }
            false
        }
        '?' => {
            if seg.is_empty() {
                return false;
            }
            match_chars(&pat[1..], &seg[1..])
        }
        '[' => {
            if seg.is_empty() {
                return false;
            }
            if let Some(close) = pat.iter().position(|&c| c == ']') {
                let class = &pat[1..close];
                let matches_class = class.iter().any(|&c| c == seg[0]);
                if matches_class {
                    return match_chars(&pat[close + 1..], &seg[1..]);
                }
            }
            false
        }
        c => {
            if seg.is_empty() || seg[0] != c {
                return false;
            }
            match_chars(&pat[1..], &seg[1..])
        }
    }
}

/// Check if path should be ignored (common VCS and build directories).
fn should_skip(name: &str) -> bool {
    matches!(
        name,
        ".git" | "node_modules" | "target" | ".next" | "dist" | "__pycache__" | ".venv"
    )
}

#[async_trait]
impl Tool for GlobSearchTool {
    fn name(&self) -> &str {
        "glob"
    }

    fn description(&self) -> &str {
        "Find files by glob pattern. Returns matching file paths sorted by modification time \
         (newest first). Supports: `**/*.rs` (recursive), `*.ts` (single dir), \
         `{a,b}` (alternation), `[abc]` (character class)."
    }


    fn parameters(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "pattern": {
                    "type": "string",
                    "description": "Glob pattern to match files (e.g., `**/*.rs`, `src/**/*.ts`, `*.{js,jsx}`)"
                },
                "path": {
                    "type": "string",
                    "description": "Directory to search in. Defaults to workspace root. Supports absolute paths."
                },
                "limit": {
                    "type": "integer",
                    "description": "Maximum number of results to return (default 100)",
                    "minimum": 1
                }
            },
            "required": ["pattern"]
        })
    }

    async fn execute(&self, args: Value) -> Result<String> {
        let pattern = args
            .get("pattern")
            .and_then(Value::as_str)
            .ok_or_else(|| AppError::Validation("pattern is required".to_owned()))?;

        let limit = args
            .get("limit")
            .and_then(Value::as_u64)
            .unwrap_or(100) as usize;

        let effective_workspace = current_tool_execution_context()
            .and_then(|ctx| ctx.workspace_override)
            .unwrap_or_else(|| self.workspace.clone());

        let search_root = match args.get("path").and_then(Value::as_str) {
            Some(p) if Path::new(p).is_absolute() => PathBuf::from(p),
            Some(p) => effective_workspace.join(p),
            None => effective_workspace,
        };

        if !search_root.is_dir() {
            return Err(AppError::Validation(format!(
                "search path '{}' is not a directory",
                search_root.display()
            )));
        }

        // Walk directory tree, filtering by glob pattern.
        let mut matches: Vec<(PathBuf, std::time::SystemTime)> = Vec::new();

        for entry in WalkDir::new(&search_root)
            .follow_links(false)
            .into_iter()
            .filter_entry(|e| {
                e.file_name()
                    .to_str()
                    .is_none_or(|name| !should_skip(name))
            })
        {
            let entry = match entry {
                Ok(e) => e,
                Err(_) => continue,
            };

            if !entry.file_type().is_file() {
                continue;
            }

            let rel_path = match entry.path().strip_prefix(&search_root) {
                Ok(rel) => rel,
                Err(_) => continue,
            };

            let rel_str = rel_path.to_string_lossy();
            if glob_matches(pattern, &rel_str) {
                let mtime = entry
                    .metadata()
                    .ok()
                    .and_then(|m| m.modified().ok())
                    .unwrap_or(std::time::UNIX_EPOCH);
                matches.push((entry.path().to_path_buf(), mtime));
            }
        }

        // Sort by modification time descending (newest first).
        matches.sort_by(|a, b| b.1.cmp(&a.1));

        let total = matches.len();
        let truncated = total > limit;
        let results: Vec<String> = matches
            .into_iter()
            .take(limit)
            .map(|(p, _)| p.to_string_lossy().to_string())
            .collect();

        let mut output = json!({
            "total": total,
            "files": results,
        });

        if truncated {
            output["truncated"] = json!(true);
            output["showing"] = json!(limit);
        }

        serde_json::to_string_pretty(&output)
            .map_err(|e| AppError::Agent(format!("json serialization failed: {e}")))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn basic_star_pattern() {
        assert!(glob_matches("*.rs", "main.rs"));
        assert!(!glob_matches("*.rs", "src/main.rs"));
    }

    #[test]
    fn double_star_pattern() {
        assert!(glob_matches("**/*.rs", "main.rs"));
        assert!(glob_matches("**/*.rs", "src/main.rs"));
        assert!(glob_matches("**/*.rs", "a/b/c/main.rs"));
        assert!(!glob_matches("**/*.rs", "main.ts"));
    }

    #[test]
    fn brace_expansion() {
        assert!(glob_matches("*.{ts,tsx}", "app.ts"));
        assert!(glob_matches("*.{ts,tsx}", "app.tsx"));
        assert!(!glob_matches("*.{ts,tsx}", "app.js"));
    }

    #[test]
    fn character_class() {
        assert!(glob_matches("[abc].txt", "a.txt"));
        assert!(!glob_matches("[abc].txt", "d.txt"));
    }

    #[test]
    fn question_mark() {
        assert!(glob_matches("?.txt", "a.txt"));
        assert!(!glob_matches("?.txt", "ab.txt"));
    }

    #[test]
    fn prefix_path_pattern() {
        assert!(glob_matches("src/**/*.ts", "src/app.ts"));
        assert!(glob_matches("src/**/*.ts", "src/components/App.ts"));
        assert!(!glob_matches("src/**/*.ts", "lib/app.ts"));
    }

    #[tokio::test]
    async fn finds_files_in_temp_dir() {
        let dir = tempfile::tempdir().unwrap();
        let src = dir.path().join("src");
        std::fs::create_dir_all(&src).unwrap();
        std::fs::write(src.join("main.rs"), "fn main() {}").unwrap();
        std::fs::write(src.join("lib.rs"), "pub mod foo;").unwrap();
        std::fs::write(dir.path().join("readme.md"), "# README").unwrap();

        let tool = GlobSearchTool::new(dir.path().to_path_buf());
        let result = tool
            .execute(json!({"pattern": "**/*.rs"}))
            .await
            .unwrap();

        let parsed: Value = serde_json::from_str(&result).unwrap();
        assert_eq!(parsed["total"], 2);
        let files = parsed["files"].as_array().unwrap();
        assert!(files.iter().all(|f| f.as_str().unwrap().ends_with(".rs")));
    }

    #[tokio::test]
    async fn respects_limit() {
        let dir = tempfile::tempdir().unwrap();
        for i in 0..10 {
            std::fs::write(dir.path().join(format!("file{i}.txt")), "content").unwrap();
        }

        let tool = GlobSearchTool::new(dir.path().to_path_buf());
        let result = tool
            .execute(json!({"pattern": "*.txt", "limit": 3}))
            .await
            .unwrap();

        let parsed: Value = serde_json::from_str(&result).unwrap();
        assert_eq!(parsed["total"], 10);
        assert_eq!(parsed["showing"], 3);
        assert!(parsed["truncated"].as_bool().unwrap());
        assert_eq!(parsed["files"].as_array().unwrap().len(), 3);
    }
}
