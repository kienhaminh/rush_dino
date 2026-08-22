use async_trait::async_trait;
use serde_json::{json, Value};

use rushdino_common::{AppError, Result};
use rushdino_security::validation::validate_url;

use crate::tool_registry::Tool;

pub struct WebSearchTool {
    endpoint: String,
    api_key: Option<String>,
    /// Hosts explicitly allowed even if they resolve to private IPs (empty = public IPs only).
    allowed_external_hosts: Vec<String>,
}

impl WebSearchTool {
    pub fn new(endpoint: String, api_key: Option<String>) -> Self {
        Self {
            endpoint: endpoint.trim().to_owned(),
            api_key: api_key.map(|k| k.trim().to_owned()),
            allowed_external_hosts: Vec::new(),
        }
    }

    pub fn with_allowed_hosts(mut self, hosts: Vec<String>) -> Self {
        self.allowed_external_hosts = hosts;
        self
    }
}

#[async_trait]
impl Tool for WebSearchTool {
    fn name(&self) -> &str {
        "web_search"
    }

    fn description(&self) -> &str {
        "Search the web via Brave Search API. Returns structured results with titles, URLs, \
         and descriptions. Call once per topic — if results are insufficient, use web_fetch \
         to read specific URLs rather than searching again."
    }

    fn max_calls_per_turn(&self) -> Option<usize> {
        Some(1)
    }

    fn parameters(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Search query string"
                },
                "maxResults": {
                    "type": "integer",
                    "description": "Maximum number of results to return (default 5, max 20)",
                    "minimum": 1,
                    "maximum": 20
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
            .unwrap_or(5)
            .min(20) as usize;

        let api_key = self
            .api_key
            .as_deref()
            .filter(|x| !x.is_empty())
            .ok_or_else(|| AppError::Validation("BRAVE API key missing".to_owned()))?;

        // SSRF guard: validate the search endpoint URL before issuing the request.
        // This prevents an operator misconfiguration from routing requests to internal IPs.
        let endpoint_url = validate_url(&self.endpoint, &self.allowed_external_hosts)
            .map_err(|e| AppError::Validation(format!("web_search endpoint blocked: {e}")))?;

        let payload: Value = reqwest::Client::new()
            .get(endpoint_url)
            .header("x-subscription-token", api_key)
            .query(&[("q", query), ("count", &max_results.to_string())])
            .send()
            .await
            .map_err(|e| AppError::Agent(format!("web search failed: {e}")))?
            .error_for_status()
            .map_err(|e| AppError::Agent(format!("web search status error: {e}")))?
            .json()
            .await
            .map_err(|e| AppError::Agent(format!("web search parse error: {e}")))?;

        let results: Vec<Value> = payload
            .pointer("/web/results")
            .and_then(Value::as_array)
            .map(|items| {
                items
                    .iter()
                    .take(max_results)
                    .map(|item| {
                        let title = item
                            .get("title")
                            .and_then(Value::as_str)
                            .unwrap_or_default();
                        let url = item.get("url").and_then(Value::as_str).unwrap_or_default();
                        let description = item
                            .get("description")
                            .and_then(Value::as_str)
                            .unwrap_or_default();
                        let age = item.get("age").and_then(Value::as_str).unwrap_or_default();
                        let mut result = json!({
                            "title": title,
                            "url": url,
                        });
                        if !description.is_empty() {
                            result["description"] = json!(description);
                        }
                        if !age.is_empty() {
                            result["age"] = json!(age);
                        }
                        result
                    })
                    .collect()
            })
            .unwrap_or_default();

        let output = json!({
            "query": query,
            "count": results.len(),
            "results": results,
        });

        serde_json::to_string_pretty(&output)
            .map_err(|e| AppError::Agent(format!("json serialization failed: {e}")))
    }
}
