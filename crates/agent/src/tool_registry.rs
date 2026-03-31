use std::{
    collections::HashMap,
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
    fn parameters(&self) -> Value;
    /// Maximum number of times this tool may be called within a single react
    /// loop (one user turn). `None` means unlimited. When the limit is reached
    /// the react loop returns a guidance message instead of executing the tool.
    fn max_calls_per_turn(&self) -> Option<usize> {
        None
    }
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

/// Per-engine session context: holds the tools available to a session.
///
/// For delegate agents, `scoped` creates a filtered view over the full pool.
pub struct SessionToolContext {
    tools: Vec<Arc<dyn Tool>>,
}

impl SessionToolContext {
    pub fn new(tools: Vec<Arc<dyn Tool>>) -> Self {
        Self { tools }
    }

    /// Create a scoped context that only includes tools whose names are in `allowed`.
    /// If `allowed` is empty, all tools are included (unrestricted agent).
    pub fn scoped(pool: &[Arc<dyn Tool>], allowed: &[&str]) -> Self {
        let tools: Vec<Arc<dyn Tool>> = if allowed.is_empty() {
            pool.to_vec()
        } else {
            pool.iter()
                .filter(|t| allowed.contains(&t.name()))
                .cloned()
                .collect()
        };
        Self { tools }
    }

    /// Returns the tools available in this context.
    pub fn pool_tools(&self) -> &[Arc<dyn Tool>] {
        &self.tools
    }

    /// Definitions for all tools, sorted by name.
    pub fn active_definitions(&self) -> Vec<ToolDefinition> {
        let mut defs: Vec<ToolDefinition> = self
            .tools
            .iter()
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

    struct FakeTool { n: &'static str }
    #[async_trait]
    impl Tool for FakeTool {
        fn name(&self) -> &str { self.n }
        fn description(&self) -> &str { "fake" }
        fn parameters(&self) -> Value { json!({}) }
        async fn execute(&self, _: Value) -> rushdino_common::Result<String> { Ok(String::new()) }
    }

    fn make_pool() -> Vec<Arc<dyn Tool>> {
        vec![
            Arc::new(FakeTool { n: "read" }),
            Arc::new(FakeTool { n: "cron_create" }),
            Arc::new(FakeTool { n: "web_search" }),
        ]
    }

    #[test]
    fn new_includes_all_tools() {
        let ctx = SessionToolContext::new(make_pool());
        assert_eq!(ctx.active_definitions().len(), 3);
    }

    #[test]
    fn scoped_filters_pool() {
        let pool = make_pool();
        let ctx = SessionToolContext::scoped(&pool, &["read", "web_search"]);
        let names: Vec<String> = ctx.pool_tools().iter().map(|t| t.name().to_owned()).collect();
        assert_eq!(names.len(), 2);
        assert!(names.contains(&"read".to_owned()));
        assert!(names.contains(&"web_search".to_owned()));
        assert!(!names.contains(&"cron_create".to_owned()));
    }

    #[test]
    fn scoped_empty_allows_all() {
        let pool = make_pool();
        let ctx = SessionToolContext::scoped(&pool, &[]);
        assert_eq!(ctx.pool_tools().len(), 3);
    }

    #[test]
    fn active_definitions_sorted_by_name() {
        let ctx = SessionToolContext::new(make_pool());
        let defs = ctx.active_definitions();
        let names: Vec<&str> = defs.iter().map(|d| d.name.as_str()).collect();
        let mut sorted = names.clone();
        sorted.sort();
        assert_eq!(names, sorted);
    }
}
