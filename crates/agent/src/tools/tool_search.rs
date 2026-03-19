use std::sync::Weak;

use async_trait::async_trait;
use serde_json::{json, Value};

use rushdino_common::{AppError, Result};

use crate::tool_registry::{SessionToolContext, Tool};

/// Lets the LLM discover and activate tools from the pool on demand.
///
/// Holds `Weak<SessionToolContext>` to avoid a retain cycle:
/// `SessionToolContext.pool → ToolSearchTool → SessionToolContext`.
pub struct ToolSearchTool {
    session_ctx: Weak<SessionToolContext>,
}

impl ToolSearchTool {
    pub fn new(session_ctx: Weak<SessionToolContext>) -> Self {
        Self { session_ctx }
    }
}

#[async_trait]
impl Tool for ToolSearchTool {
    fn name(&self) -> &str {
        "tool_search"
    }

    fn description(&self) -> &str {
        "Search the tool pool by keyword and activate matching tools for this session. \
        Searches tool names, descriptions, and keywords. \
        Activated tools become available immediately in subsequent turns."
    }

    fn parameters(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Keyword(s) to search for. Matched against tool name, description, and keywords."
                }
            },
            "required": ["query"]
        })
    }

    async fn execute(&self, args: Value) -> Result<String> {
        let ctx = self
            .session_ctx
            .upgrade()
            .ok_or_else(|| AppError::Agent("session context unavailable".to_owned()))?;

        let query = args
            .get("query")
            .and_then(Value::as_str)
            .ok_or_else(|| AppError::Validation("query is required".to_owned()))?;

        let matches = ctx.search_pool(query);
        if matches.is_empty() {
            return Ok(format!("No tools found for '{query}'"));
        }

        let mut activated = Vec::new();
        let mut already_active = Vec::new();

        for m in &matches {
            if ctx.activate(&m.name) {
                activated.push(format!("{} — {}", m.name, m.description));
            } else {
                already_active.push(m.name.clone());
            }
        }

        let mut parts = Vec::new();
        if !activated.is_empty() {
            parts.push(format!(
                "Activated {} tool(s):\n{}",
                activated.len(),
                activated.join("\n")
            ));
        }
        if !already_active.is_empty() {
            parts.push(format!(
                "Already active: {}",
                already_active.join(", ")
            ));
        }

        Ok(parts.join("\n\n"))
    }
}
