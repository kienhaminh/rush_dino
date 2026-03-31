use std::{
    fs,
    io::{BufRead, BufReader},
    path::{Path, PathBuf},
};

use async_trait::async_trait;
use regex::Regex;
use serde_json::{json, Value};
use walkdir::WalkDir;

use rushdino_common::{AppError, Result};

use crate::{tool_registry::Tool, tools::bash::current_tool_execution_context};

pub struct GrepSearchTool {
    workspace: PathBuf,
}

impl GrepSearchTool {
    pub fn new(workspace: PathBuf) -> Self {
        Self { workspace }
    }
}

/// Check if path should be ignored (common VCS and build directories).
fn should_skip(name: &str) -> bool {
    matches!(
        name,
        ".git" | "node_modules" | "target" | ".next" | "dist" | "__pycache__" | ".venv"
    )
}

/// Simple glob matching for file filters (supports `*` and `?`).
fn file_glob_matches(pattern: &str, filename: &str) -> bool {
    let pat: Vec<char> = pattern.chars().collect();
    let name: Vec<char> = filename.chars().collect();
    file_glob_chars(&pat, &name)
}

fn file_glob_chars(pat: &[char], name: &[char]) -> bool {
    if pat.is_empty() {
        return name.is_empty();
    }
    match pat[0] {
        '*' => {
            if file_glob_chars(&pat[1..], name) {
                return true;
            }
            if !name.is_empty() {
                return file_glob_chars(pat, &name[1..]);
            }
            false
        }
        '?' => {
            if name.is_empty() {
                return false;
            }
            file_glob_chars(&pat[1..], &name[1..])
        }
        c => {
            if name.is_empty() || name[0] != c {
                return false;
            }
            file_glob_chars(&pat[1..], &name[1..])
        }
    }
}

#[derive(Debug)]
struct GrepMatch {
    path: PathBuf,
    line_number: usize,
    text: String,
    context_before: Vec<String>,
    context_after: Vec<String>,
}

fn search_file(
    path: &Path,
    regex: &Regex,
    context_lines: usize,
    max_matches: usize,
) -> Vec<GrepMatch> {
    let file = match fs::File::open(path) {
        Ok(f) => f,
        Err(_) => return Vec::new(),
    };

    let reader = BufReader::new(file);
    let lines: Vec<String> = reader.lines().map_while(std::result::Result::ok).collect();
    let mut matches = Vec::new();

    for (i, line) in lines.iter().enumerate() {
        if matches.len() >= max_matches {
            break;
        }
        if regex.is_match(line) {
            let start = i.saturating_sub(context_lines);
            let end = (i + context_lines + 1).min(lines.len());

            let context_before = lines[start..i].to_vec();
            let context_after = if i + 1 < end {
                lines[i + 1..end].to_vec()
            } else {
                Vec::new()
            };

            matches.push(GrepMatch {
                path: path.to_path_buf(),
                line_number: i + 1, // 1-indexed
                text: line.clone(),
                context_before,
                context_after,
            });
        }
    }

    matches
}

#[async_trait]
impl Tool for GrepSearchTool {
    fn name(&self) -> &str {
        "grep"
    }

    fn description(&self) -> &str {
        "Search file contents using regex patterns. Returns matches with file paths and line numbers. \
         Supports three output modes: `files` (file paths only), `content` (matching lines with context), \
         `count` (match counts per file). Skips binary files and common build directories."
    }


    fn parameters(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "pattern": {
                    "type": "string",
                    "description": "Regex pattern to search for in file contents (e.g., `fn\\s+\\w+`, `TODO|FIXME`)"
                },
                "path": {
                    "type": "string",
                    "description": "Directory to search in. Defaults to workspace root."
                },
                "glob": {
                    "type": "string",
                    "description": "File name filter (e.g., `*.rs`, `*.{ts,tsx}`). Only files matching this pattern are searched."
                },
                "outputMode": {
                    "type": "string",
                    "enum": ["files", "content", "count"],
                    "description": "Output format: `files` (default) returns file paths, `content` returns matching lines with context, `count` returns match counts per file."
                },
                "contextLines": {
                    "type": "integer",
                    "description": "Number of lines before and after each match (only for `content` mode, default 0)",
                    "minimum": 0
                },
                "caseInsensitive": {
                    "type": "boolean",
                    "description": "Case-insensitive search (default false)"
                },
                "maxResults": {
                    "type": "integer",
                    "description": "Maximum results to return (default 50)",
                    "minimum": 1
                }
            },
            "required": ["pattern"]
        })
    }

    async fn execute(&self, args: Value) -> Result<String> {
        let pattern_str = args
            .get("pattern")
            .and_then(Value::as_str)
            .ok_or_else(|| AppError::Validation("pattern is required".to_owned()))?;

        let case_insensitive = args
            .get("caseInsensitive")
            .and_then(Value::as_bool)
            .unwrap_or(false);

        let regex_pattern = if case_insensitive {
            format!("(?i){pattern_str}")
        } else {
            pattern_str.to_owned()
        };

        let regex = Regex::new(&regex_pattern).map_err(|e| {
            AppError::Validation(format!("invalid regex pattern '{pattern_str}': {e}"))
        })?;

        let output_mode = args
            .get("outputMode")
            .and_then(Value::as_str)
            .unwrap_or("files");

        let context_lines = args
            .get("contextLines")
            .and_then(Value::as_u64)
            .unwrap_or(0) as usize;

        let max_results = args
            .get("maxResults")
            .and_then(Value::as_u64)
            .unwrap_or(50) as usize;

        let file_glob = args.get("glob").and_then(Value::as_str);

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

        // Collect matching files.
        let mut all_matches: Vec<GrepMatch> = Vec::new();
        let mut file_counts: Vec<(PathBuf, usize)> = Vec::new();
        let mut matching_files: Vec<PathBuf> = Vec::new();
        let mut total_collected = 0usize;

        for entry in WalkDir::new(&search_root)
            .follow_links(false)
            .into_iter()
            .filter_entry(|e| {
                e.file_name()
                    .to_str()
                    .is_none_or(|name| !should_skip(name))
            })
        {
            if total_collected >= max_results {
                break;
            }

            let entry = match entry {
                Ok(e) => e,
                Err(_) => continue,
            };

            if !entry.file_type().is_file() {
                continue;
            }

            // Apply file glob filter.
            if let Some(glob_pattern) = file_glob {
                let filename = entry.file_name().to_string_lossy();
                // Support brace expansion in glob filter.
                let alternatives = expand_file_glob_braces(glob_pattern);
                let matches_any = alternatives
                    .iter()
                    .any(|alt| file_glob_matches(alt, &filename));
                if !matches_any {
                    continue;
                }
            }

            // Skip binary files (check first 512 bytes for null bytes).
            if let Ok(data) = fs::read(entry.path()) {
                let check_len = data.len().min(512);
                if data[..check_len].contains(&0) {
                    continue;
                }
            }

            let remaining = max_results.saturating_sub(total_collected);
            let file_matches = search_file(entry.path(), &regex, context_lines, remaining);

            if !file_matches.is_empty() {
                let count = file_matches.len();
                total_collected += count;

                match output_mode {
                    "content" => all_matches.extend(file_matches),
                    "count" => file_counts.push((entry.path().to_path_buf(), count)),
                    _ => matching_files.push(entry.path().to_path_buf()),
                }
            }
        }

        let output = match output_mode {
            "content" => {
                let results: Vec<Value> = all_matches
                    .into_iter()
                    .map(|m| {
                        let mut obj = json!({
                            "path": m.path.to_string_lossy(),
                            "line": m.line_number,
                            "text": m.text,
                        });
                        if !m.context_before.is_empty() {
                            obj["contextBefore"] = json!(m.context_before);
                        }
                        if !m.context_after.is_empty() {
                            obj["contextAfter"] = json!(m.context_after);
                        }
                        obj
                    })
                    .collect();
                json!({
                    "pattern": pattern_str,
                    "mode": "content",
                    "count": results.len(),
                    "results": results,
                })
            }
            "count" => {
                let results: Vec<Value> = file_counts
                    .into_iter()
                    .map(|(path, count)| {
                        json!({
                            "path": path.to_string_lossy(),
                            "count": count,
                        })
                    })
                    .collect();
                json!({
                    "pattern": pattern_str,
                    "mode": "count",
                    "filesMatched": results.len(),
                    "results": results,
                })
            }
            _ => {
                // "files" mode
                let results: Vec<String> = matching_files
                    .into_iter()
                    .map(|p| p.to_string_lossy().to_string())
                    .collect();
                json!({
                    "pattern": pattern_str,
                    "mode": "files",
                    "count": results.len(),
                    "files": results,
                })
            }
        };

        serde_json::to_string_pretty(&output)
            .map_err(|e| AppError::Agent(format!("json serialization failed: {e}")))
    }
}

/// Expand `{a,b,c}` brace patterns in file glob filters.
fn expand_file_glob_braces(pattern: &str) -> Vec<String> {
    if let Some(open) = pattern.find('{') {
        if let Some(close) = pattern[open..].find('}') {
            let close = open + close;
            let prefix = &pattern[..open];
            let suffix = &pattern[close + 1..];
            let alternatives = &pattern[open + 1..close];
            return alternatives
                .split(',')
                .flat_map(|alt| expand_file_glob_braces(&format!("{prefix}{alt}{suffix}")))
                .collect();
        }
    }
    vec![pattern.to_owned()]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn file_glob_star() {
        assert!(file_glob_matches("*.rs", "main.rs"));
        assert!(!file_glob_matches("*.rs", "main.ts"));
    }

    #[test]
    fn file_glob_brace_expansion() {
        let alts = expand_file_glob_braces("*.{ts,tsx}");
        assert_eq!(alts, vec!["*.ts", "*.tsx"]);
    }

    #[tokio::test]
    async fn searches_files_in_temp_dir() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("hello.rs"), "fn main() {\n    println!(\"hello\");\n}\n")
            .unwrap();
        fs::write(
            dir.path().join("lib.rs"),
            "pub fn greet() {\n    println!(\"greet\");\n}\n",
        )
        .unwrap();
        fs::write(dir.path().join("notes.txt"), "no rust here").unwrap();

        let tool = GrepSearchTool::new(dir.path().to_path_buf());

        // Files mode
        let result = tool
            .execute(json!({"pattern": "println!", "glob": "*.rs"}))
            .await
            .unwrap();
        let parsed: Value = serde_json::from_str(&result).unwrap();
        assert_eq!(parsed["count"], 2);

        // Content mode
        let result = tool
            .execute(json!({"pattern": "fn main", "outputMode": "content"}))
            .await
            .unwrap();
        let parsed: Value = serde_json::from_str(&result).unwrap();
        assert_eq!(parsed["count"], 1);
        let first = &parsed["results"][0];
        assert_eq!(first["line"], 1);
        assert!(first["text"].as_str().unwrap().contains("fn main"));

        // Count mode
        let result = tool
            .execute(json!({"pattern": "println!", "outputMode": "count"}))
            .await
            .unwrap();
        let parsed: Value = serde_json::from_str(&result).unwrap();
        assert_eq!(parsed["filesMatched"], 2);
    }

    #[tokio::test]
    async fn case_insensitive_search() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("test.txt"), "Hello World\nhello world\n").unwrap();

        let tool = GrepSearchTool::new(dir.path().to_path_buf());
        let result = tool
            .execute(json!({
                "pattern": "hello",
                "caseInsensitive": true,
                "outputMode": "content"
            }))
            .await
            .unwrap();
        let parsed: Value = serde_json::from_str(&result).unwrap();
        assert_eq!(parsed["count"], 2);
    }

    #[tokio::test]
    async fn context_lines_included() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(
            dir.path().join("code.rs"),
            "line1\nline2\nMATCH\nline4\nline5\n",
        )
        .unwrap();

        let tool = GrepSearchTool::new(dir.path().to_path_buf());
        let result = tool
            .execute(json!({
                "pattern": "MATCH",
                "outputMode": "content",
                "contextLines": 1
            }))
            .await
            .unwrap();
        let parsed: Value = serde_json::from_str(&result).unwrap();
        let first = &parsed["results"][0];
        assert_eq!(first["contextBefore"].as_array().unwrap().len(), 1);
        assert_eq!(first["contextAfter"].as_array().unwrap().len(), 1);
    }
}
