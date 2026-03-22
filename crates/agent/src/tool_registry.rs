use std::{
    collections::{HashMap, HashSet},
    sync::{Arc, RwLock},
};

use async_trait::async_trait;
use serde_json::Value;

use rushdino_common::Result;
use rushdino_providers::types::ToolDefinition;

#[async_trait]
pub trait Tool: Send + Sync {
    fn name(&self) -> &str;
    fn description(&self) -> &str;
    /// Optional keywords that improve tool_search discoverability.
    fn keywords(&self) -> Vec<&str> {
        vec![]
    }
    fn parameters(&self) -> Value;
    async fn execute(&self, args: Value) -> Result<String>;
}

#[derive(Default)]
pub struct ToolRegistry {
    tools: RwLock<HashMap<String, Arc<dyn Tool>>>,
}

impl ToolRegistry {
    pub fn new() -> Self {
        Self {
            tools: RwLock::new(HashMap::new()),
        }
    }

    pub fn register<T: Tool + 'static>(&self, tool: T) {
        self.tools
            .write()
            .expect("tool registry lock poisoned")
            .insert(tool.name().to_owned(), Arc::new(tool));
    }

    pub fn get(&self, name: &str) -> Option<Arc<dyn Tool>> {
        self.tools
            .read()
            .expect("tool registry lock poisoned")
            .get(name)
            .cloned()
    }

    pub fn definitions(&self) -> Vec<ToolDefinition> {
        self.tools
            .read()
            .expect("tool registry lock poisoned")
            .values()
            .map(|tool| ToolDefinition {
                name: tool.name().to_owned(),
                description: tool.description().to_owned(),
                parameters: tool.parameters(),
            })
            .collect()
    }

    pub fn names(&self) -> Vec<String> {
        self.tools
            .read()
            .expect("tool registry lock poisoned")
            .keys()
            .cloned()
            .collect()
    }

    pub fn all_tools(&self) -> Vec<Arc<dyn Tool>> {
        self.tools
            .read()
            .expect("tool registry lock poisoned")
            .values()
            .cloned()
            .collect()
    }
}

/// Per-engine session context: holds all tools in the pool and tracks which are active.
///
/// Activation controls visibility in the system prompt and provider API schemas only.
/// Any tool in the pool can always be executed even if not active.
pub struct SessionToolContext {
    pool: Vec<Arc<dyn Tool>>,
    active: RwLock<HashSet<String>>,
}

impl SessionToolContext {
    /// Create a new context. `core_names` are immediately active; all others are inactive.
    pub fn new(pool: Vec<Arc<dyn Tool>>, core_names: &[&str]) -> Self {
        let active: HashSet<String> = pool
            .iter()
            .filter(|t| core_names.contains(&t.name()))
            .map(|t| t.name().to_owned())
            .collect();
        Self {
            pool,
            active: RwLock::new(active),
        }
    }

    /// Search the pool by name, description, and keywords (case-insensitive).
    /// The query is split into words; a tool matches if **any** word appears in its
    /// name, description, or keywords. Results are ranked by the number of matching
    /// words (descending).
    pub fn search_pool(&self, query: &str) -> Vec<ToolDefinition> {
        let words: Vec<String> = query
            .split_whitespace()
            .map(|w| w.to_lowercase())
            .collect();
        if words.is_empty() {
            return vec![];
        }

        let mut scored: Vec<(usize, &Arc<dyn Tool>)> = self
            .pool
            .iter()
            .filter_map(|t| {
                let name = t.name().to_lowercase();
                let desc = t.description().to_lowercase();
                let kws: Vec<String> =
                    t.keywords().iter().map(|k| k.to_lowercase()).collect();

                let hits = words
                    .iter()
                    .filter(|w| {
                        name.contains(w.as_str())
                            || desc.contains(w.as_str())
                            || kws.iter().any(|k| k.contains(w.as_str()))
                    })
                    .count();

                if hits > 0 { Some((hits, t)) } else { None }
            })
            .collect();

        // Best matches first.
        scored.sort_by(|a, b| b.0.cmp(&a.0));

        scored
            .into_iter()
            .map(|(_, t)| ToolDefinition {
                name: t.name().to_owned(),
                description: t.description().to_owned(),
                parameters: t.parameters(),
            })
            .collect()
    }

    /// Activate a tool by name. Returns true if newly activated, false if already active
    /// or not found in the pool.
    pub fn activate(&self, name: &str) -> bool {
        let exists = self.pool.iter().any(|t| t.name() == name);
        if !exists {
            return false;
        }
        self.active
            .write()
            .expect("active set lock poisoned")
            .insert(name.to_owned())
    }

    /// Definitions for currently active tools, sorted by name.
    pub fn active_definitions(&self) -> Vec<ToolDefinition> {
        let active = self.active.read().expect("active set lock poisoned");
        let mut defs: Vec<ToolDefinition> = self
            .pool
            .iter()
            .filter(|t| active.contains(t.name()))
            .map(|t| ToolDefinition {
                name: t.name().to_owned(),
                description: t.description().to_owned(),
                parameters: t.parameters(),
            })
            .collect();
        defs.sort_by(|a, b| a.name.cmp(&b.name));
        defs
    }
}

#[cfg(test)]
mod session_ctx_tests {
    use super::*;
    use async_trait::async_trait;
    use serde_json::{json, Value};

    struct FakeTool {
        n: &'static str,
        desc: &'static str,
        kw: Vec<&'static str>,
    }
    #[async_trait]
    impl Tool for FakeTool {
        fn name(&self) -> &str { self.n }
        fn description(&self) -> &str { self.desc }
        fn keywords(&self) -> Vec<&str> { self.kw.clone() }
        fn parameters(&self) -> Value { json!({}) }
        async fn execute(&self, _: Value) -> rushdino_common::Result<String> { Ok(String::new()) }
    }

    fn make_pool() -> Vec<Arc<dyn Tool>> {
        vec![
            Arc::new(FakeTool { n: "read", desc: "Read a file", kw: vec![] }),
            Arc::new(FakeTool { n: "cron_create", desc: "Create a cron job", kw: vec!["schedule", "recurring"] }),
            Arc::new(FakeTool { n: "web_search", desc: "Search the web", kw: vec!["internet", "browse"] }),
        ]
    }

    #[test]
    fn active_starts_with_core_names() {
        let ctx = SessionToolContext::new(make_pool(), &["read"]);
        let defs = ctx.active_definitions();
        assert_eq!(defs.len(), 1);
        assert_eq!(defs[0].name, "read");
    }

    #[test]
    fn search_by_name() {
        let ctx = SessionToolContext::new(make_pool(), &[]);
        let results = ctx.search_pool("cron");
        assert!(results.iter().any(|d| d.name == "cron_create"));
    }

    #[test]
    fn search_by_description() {
        let ctx = SessionToolContext::new(make_pool(), &[]);
        let results = ctx.search_pool("web");
        assert!(results.iter().any(|d| d.name == "web_search"));
    }

    #[test]
    fn search_by_keyword() {
        let ctx = SessionToolContext::new(make_pool(), &[]);
        let results = ctx.search_pool("recurring");
        assert!(results.iter().any(|d| d.name == "cron_create"));
    }

    #[test]
    fn search_case_insensitive() {
        let ctx = SessionToolContext::new(make_pool(), &[]);
        let results = ctx.search_pool("SCHEDULE");
        assert!(results.iter().any(|d| d.name == "cron_create"));
    }

    #[test]
    fn activate_returns_true_first_time() {
        let ctx = SessionToolContext::new(make_pool(), &[]);
        assert!(ctx.activate("cron_create"));
    }

    #[test]
    fn activate_returns_false_if_already_active() {
        let ctx = SessionToolContext::new(make_pool(), &["read"]);
        assert!(!ctx.activate("read"));
    }

    #[test]
    fn activate_nonexistent_tool_returns_false() {
        let ctx = SessionToolContext::new(make_pool(), &[]);
        assert!(!ctx.activate("does_not_exist"));
    }

    #[test]
    fn empty_query_returns_empty() {
        let ctx = SessionToolContext::new(make_pool(), &[]);
        let results = ctx.search_pool("");
        assert!(results.is_empty());
    }

    #[test]
    fn multi_word_query_matches_any_word() {
        let ctx = SessionToolContext::new(make_pool(), &[]);
        // "web" matches web_search, "browse" matches its keyword, "research" matches nothing extra
        let results = ctx.search_pool("web search browser research internet");
        assert!(results.iter().any(|d| d.name == "web_search"));
    }

    #[test]
    fn multi_word_results_ranked_by_hits() {
        let ctx = SessionToolContext::new(make_pool(), &[]);
        // "web internet" — both words match web_search (name + keyword), only "web" matches via desc
        let results = ctx.search_pool("web internet");
        assert!(!results.is_empty());
        assert_eq!(results[0].name, "web_search");
    }
}
