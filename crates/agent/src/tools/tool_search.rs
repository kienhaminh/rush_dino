use std::sync::Weak;

use async_trait::async_trait;
use serde_json::{json, Value};

use rushdino_common::{AppError, Result};

use crate::tool_registry::{SessionToolContext, Tool};

/// Tool that lets the LLM discover and activate tools from the pool on demand.
///
/// Holds a `Weak<SessionToolContext>` to avoid a retain cycle:
/// `SessionToolContext → ToolSearchTool → SessionToolContext`.
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
        "Search the tool pool for tools matching a keyword and activate them for this session."
    }

    fn parameters(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Keyword to search for in tool names and descriptions"
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
        for m in &matches {
            if ctx.activate(&m.name) {
                activated.push(format!("{} ({})", m.name, m.description));
            }
        }

        if activated.is_empty() {
            return Ok(format!(
                "No new tools activated for '{query}' (all matches already active)"
            ));
        }

        Ok(format!(
            "Activated {} tools: {}",
            activated.len(),
            activated.join(", ")
        ))
    }
}
