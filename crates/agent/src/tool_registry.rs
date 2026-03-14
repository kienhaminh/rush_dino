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
}
