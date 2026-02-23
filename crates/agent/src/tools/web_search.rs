use async_trait::async_trait;
use serde_json::{json, Value};

use rushdino_common::{AppError, Result};

use crate::tool_registry::Tool;

pub struct WebSearchTool {
    endpoint: String,
    api_key: Option<String>,
}

impl WebSearchTool {
    pub fn new(endpoint: String, api_key: Option<String>) -> Self {
        Self { endpoint, api_key }
    }
}

#[async_trait]
impl Tool for WebSearchTool {
    fn name(&self) -> &str {
        "web_search"
    }

    fn description(&self) -> &str {
        "Search web via Brave Search API"
    }

    fn parameters(&self) -> Value {
        json!({
            "type": "object",
            "properties": {"query": {"type": "string"}},
            "required": ["query"]
        })
    }

    async fn execute(&self, args: Value) -> Result<String> {
        let query = args
            .get("query")
            .and_then(Value::as_str)
            .ok_or_else(|| AppError::Validation("query is required".to_owned()))?;

        let api_key = self
            .api_key
            .as_deref()
            .filter(|x| !x.is_empty())
            .ok_or_else(|| AppError::Validation("BRAVE API key missing".to_owned()))?;

        let payload: Value = reqwest::Client::new()
            .get(&self.endpoint)
            .header("x-subscription-token", api_key)
            .query(&[("q", query)])
            .send()
            .await
            .map_err(|e| AppError::Agent(format!("web search failed: {e}")))?
            .error_for_status()
            .map_err(|e| AppError::Agent(format!("web search status error: {e}")))?
            .json()
            .await
            .map_err(|e| AppError::Agent(format!("web search parse error: {e}")))?;

        let summary = payload
            .pointer("/web/results")
            .and_then(Value::as_array)
            .map(|items| {
                items
                    .iter()
                    .take(5)
                    .map(|item| {
                        let title = item.get("title").and_then(Value::as_str).unwrap_or_default();
                        let url = item.get("url").and_then(Value::as_str).unwrap_or_default();
                        format!("- {title}: {url}")
                    })
                    .collect::<Vec<_>>()
                    .join("\n")
            })
            .unwrap_or_default();

        Ok(summary)
    }
}
