//! Memory search tool — full-text search across memory markdown files.
//! Ported from OpenClaw's memory_search tool (simplified; uses substring matching
//! since we don't have an embedding backend here).

use std::{fs, path::PathBuf};
use std::sync::Arc;

use async_trait::async_trait;
use serde_json::{json, Value};

use rushdino_common::{AppError, Result};

use crate::memory::MemoryManager;
use crate::tool_registry::Tool;

const DEFAULT_MAX_RESULTS: usize = 10;
const SNIPPET_CONTEXT_LINES: usize = 2;

pub struct MemorySearchTool {
    memory: Arc<MemoryManager>,
}

impl MemorySearchTool {
    pub fn new(memory: Arc<MemoryManager>) -> Self {
        Self { memory }
    }
}

/// Walk a directory and collect all `.md` file paths.
fn collect_md_files(dir: &PathBuf) -> Vec<PathBuf> {
    let mut files = Vec::new();
    let Ok(rd) = fs::read_dir(dir) else { return files; };
    for entry in rd.flatten() {
        let path = entry.path();
        if path.is_dir() {
            let mut nested = collect_md_files(&path);
            files.append(&mut nested);
        } else if path.extension().and_then(|e| e.to_str()) == Some("md") {
            files.push(path);
        }
    }
    files
}

#[derive(Debug)]
struct SearchHit {
    path: String,
    line: usize,
    snippet: String,
    score: usize,
}

/// Search `content` for `query` (case-insensitive), returning line-level hits.
fn search_file(content: &str, query_lower: &str, path: &str, context: usize) -> Vec<SearchHit> {
    let lines: Vec<&str> = content.lines().collect();
    let mut hits = Vec::new();
    for (idx, line) in lines.iter().enumerate() {
        let line_lower = line.to_lowercase();
        if !line_lower.contains(query_lower) {
            continue;
        }
        // Count occurrences as score
        let score = line_lower.matches(query_lower).count();
        let start = idx.saturating_sub(context);
        let end = (idx + context + 1).min(lines.len());
        let snippet = lines[start..end].join("\n");
        hits.push(SearchHit {
            path: path.to_owned(),
            line: idx + 1,
            snippet,
            score,
        });
    }
    hits
}

#[async_trait]
impl Tool for MemorySearchTool {
    fn name(&self) -> &str {
        "memory_search"
    }

    fn description(&self) -> &str {
        "Search root MEMORY.md and memory/*.md files for relevant snippets before answering questions about prior work, decisions, preferences, or todos. Returns top matching excerpts with file path and line number."
    }

    fn parameters(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Search terms to look for in memory files."
                },
                "maxResults": {
                    "type": "number",
                    "description": "Maximum results to return (default 10).",
                    "minimum": 1
                }
            },
            "required": ["query"]
        })
    }

    async fn execute(&self, args: Value) -> Result<String> {
        let query = args
            .get("query")
            .and_then(Value::as_str)
            .ok_or_else(|| AppError::Validation("query is required".to_owned()))?;

        let max_results = args
            .get("maxResults")
            .and_then(Value::as_u64)
            .map(|n| n as usize)
            .unwrap_or(DEFAULT_MAX_RESULTS)
            .clamp(1, 50);

        let query_lower = query.to_lowercase();
        let root = self.memory.root().clone();
        let memory_dir = root.join("memory");

        // Collect memory files: root-level identity files + canonical MEMORY.md + daily memory dir.
        let mut all_files: Vec<PathBuf> = Vec::new();
        for name in &["SOUL.md", "USER.md", "AGENTS.md", "IDENTITY.md", "TOOLS.md"] {
            let path = root.join(name);
            if path.exists() {
                all_files.push(path);
            }
        }
        let root_memory = root.join("MEMORY.md");
        if root_memory.exists() {
            all_files.push(root_memory);
        }
        let mut nested = collect_md_files(&memory_dir);
        nested.retain(|path| path.file_name().and_then(|name| name.to_str()) != Some("MEMORY.md"));
        all_files.append(&mut nested);

        let mut all_hits: Vec<SearchHit> = Vec::new();

        for file_path in &all_files {
            let Ok(content) = fs::read_to_string(file_path) else { continue; };
            // Use relative path for display
            let display = file_path
                .strip_prefix(&root)
                .unwrap_or(file_path)
                .display()
                .to_string();
            let hits = search_file(&content, &query_lower, &display, SNIPPET_CONTEXT_LINES);
            all_hits.extend(hits);
        }

        // Sort by score descending, then file path + line
        all_hits.sort_by(|a, b| b.score.cmp(&a.score).then_with(|| a.path.cmp(&b.path)));
        all_hits.truncate(max_results);

        let results: Vec<Value> = all_hits
            .into_iter()
            .map(|h| {
                json!({
                    "path": h.path,
                    "line": h.line,
                    "score": h.score,
                    "snippet": h.snippet
                })
            })
            .collect();

        let result = json!({
            "query": query,
            "count": results.len(),
            "results": results
        });

        serde_json::to_string_pretty(&result)
            .map_err(|e| AppError::Agent(e.to_string()))
    }
}
