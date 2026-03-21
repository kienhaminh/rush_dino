use std::sync::Arc;

use async_trait::async_trait;
use serde_json::{json, Value};

use rushdino_common::{AppError, Result};
use rushdino_security::{
    egress_proxy::{EgressDecision, EgressProxy, EgressRequest},
    validation::validate_url,
};

use crate::tool_registry::Tool;

pub struct WebSearchTool {
    endpoint: String,
    api_key: Option<String>,
    /// Hosts explicitly allowed even if they resolve to private IPs (empty = public IPs only).
    allowed_external_hosts: Vec<String>,
    /// Optional egress proxy for sandbox policy enforcement.
    /// When set, the search endpoint request is checked before execution.
    pub egress_proxy: Option<Arc<EgressProxy>>,
}

impl WebSearchTool {
    pub fn new(endpoint: String, api_key: Option<String>) -> Self {
        Self {
            endpoint: endpoint.trim().to_owned(),
            api_key: api_key.map(|k| k.trim().to_owned()),
            allowed_external_hosts: Vec::new(),
            egress_proxy: None,
        }
    }

    pub fn with_allowed_hosts(mut self, hosts: Vec<String>) -> Self {
        self.allowed_external_hosts = hosts;
        self
    }

    /// Attach a sandbox egress proxy for policy-based network enforcement.
    pub fn with_egress_proxy(mut self, proxy: Arc<EgressProxy>) -> Self {
        self.egress_proxy = Some(proxy);
        self
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

    fn keywords(&self) -> Vec<&str> {
        vec!["internet", "search", "google", "browse"]
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

        // SSRF guard: validate the search endpoint URL before issuing the request.
        // This prevents an operator misconfiguration from routing requests to internal IPs.
        let endpoint_url = validate_url(&self.endpoint, &self.allowed_external_hosts)
            .map_err(|e| AppError::Validation(format!("web_search endpoint blocked: {e}")))?;

        // Sandbox policy enforcement: check with egress proxy before making the request.
        if let Some(proxy) = &self.egress_proxy {
            let host = endpoint_url.host_str().unwrap_or("").to_string();
            let port = endpoint_url.port_or_known_default().unwrap_or(443);
            let path = endpoint_url.path().to_string();
            let req = EgressRequest {
                host,
                port,
                method: "GET".to_string(),
                path,
            };
            match proxy.check(&req) {
                EgressDecision::Allow => {}
                EgressDecision::RouteForInference => {} // proceed as normal for now
                EgressDecision::Deny(reason) => {
                    return Err(AppError::Validation(format!(
                        "Network request blocked by policy: {reason}"
                    )));
                }
                EgressDecision::PendingApproval => {
                    return Err(AppError::Validation(
                        "Network request pending user approval".to_owned(),
                    ));
                }
            }
        }

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
                        let title = item
                            .get("title")
                            .and_then(Value::as_str)
                            .unwrap_or_default();
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
