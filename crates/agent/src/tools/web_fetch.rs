//! Web fetch tool — fetch and extract readable content from a URL.
//! Ported from OpenClaw's web_fetch tool.

use std::sync::Arc;

use async_trait::async_trait;
use serde_json::{json, Value};

use rushdino_common::{AppError, Result};
use rushdino_security::{
    egress_proxy::{EgressDecision, EgressProxy, EgressRequest},
    validation::{validate_url, ValidationError},
};

use crate::tool_registry::Tool;

const DEFAULT_MAX_CHARS: usize = 50_000;
const DEFAULT_MAX_RESPONSE_BYTES: usize = 2_000_000;
const DEFAULT_TIMEOUT_SECS: u64 = 30;

pub struct WebFetchTool {
    max_chars: usize,
    max_response_bytes: usize,
    timeout_secs: u64,
    allowed_external_hosts: Vec<String>,
    /// Optional egress proxy for sandbox policy enforcement.
    /// When set, network requests are checked before execution.
    pub egress_proxy: Option<Arc<EgressProxy>>,
}

impl WebFetchTool {
    pub fn new() -> Self {
        Self {
            max_chars: DEFAULT_MAX_CHARS,
            max_response_bytes: DEFAULT_MAX_RESPONSE_BYTES,
            timeout_secs: DEFAULT_TIMEOUT_SECS,
            allowed_external_hosts: Vec::new(),
            egress_proxy: None,
        }
    }

    pub fn with_max_chars(mut self, n: usize) -> Self {
        self.max_chars = n.max(100);
        self
    }

    pub fn with_max_response_bytes(mut self, n: usize) -> Self {
        self.max_response_bytes = n.clamp(32_000, 10_000_000);
        self
    }

    pub fn with_timeout_secs(mut self, n: u64) -> Self {
        self.timeout_secs = n;
        self
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

impl Default for WebFetchTool {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl Tool for WebFetchTool {
    fn name(&self) -> &str {
        "web_fetch"
    }

    fn description(&self) -> &str {
        "Fetch and extract readable content from a URL (HTML, JSON, or plain text). Use for lightweight page access without browser automation."
    }

    fn keywords(&self) -> Vec<&str> {
        vec!["http", "url", "fetch", "browser", "page"]
    }

    fn parameters(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "HTTP or HTTPS URL to fetch."},
                "maxChars": {"type": "number", "description": "Maximum characters to return (truncates when exceeded).", "minimum": 100}
            },
            "required": ["url"]
        })
    }

    async fn execute(&self, args: Value) -> Result<String> {
        let url_str = args
            .get("url")
            .and_then(Value::as_str)
            .ok_or_else(|| AppError::Validation("url is required".to_owned()))?;

        let max_chars = args
            .get("maxChars")
            .and_then(Value::as_u64)
            .map(|n| n as usize)
            .unwrap_or(self.max_chars)
            .max(100)
            .min(self.max_chars);

        let url =
            validate_url(url_str, &self.allowed_external_hosts).map_err(|e: ValidationError| {
                AppError::Validation(format!("web_fetch URL blocked: {e}"))
            })?;

        if url.scheme() != "http" && url.scheme() != "https" {
            return Err(AppError::Validation("URL must be http or https".to_owned()));
        }

        // Sandbox policy enforcement: check with egress proxy before making the request.
        if let Some(proxy) = &self.egress_proxy {
            let host = url.host_str().unwrap_or("").to_string();
            let port = url.port_or_known_default().unwrap_or(443);
            let path = url.path().to_string();
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

        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(self.timeout_secs))
            .redirect(reqwest::redirect::Policy::limited(3))
            .build()
            .map_err(|e| AppError::Agent(format!("http client build failed: {e}")))?;

        let res = client
            .get(url.as_str())
            .header(
                "User-Agent",
                "Mozilla/5.0 (compatible; RushDino/1.0; +https://github.com/rushdino)",
            )
            .header(
                "Accept",
                "text/html, text/plain, application/json;q=0.9, */*;q=0.1",
            )
            .send()
            .await
            .map_err(|e| AppError::Agent(format!("web fetch failed: {e}")))?;

        let status = res.status();
        let content_type = res
            .headers()
            .get("content-type")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("")
            .to_lowercase();

        let body = res
            .bytes()
            .await
            .map_err(|e| AppError::Agent(format!("web fetch body error: {e}")))?;

        if body.len() > self.max_response_bytes {
            return serde_json::to_string_pretty(&json!({
                "url": url_str,
                "status": status.as_u16(),
                "contentType": content_type,
                "error": format!("Response body truncated: {} bytes (max {})", body.len(), self.max_response_bytes),
                "truncated": true
            }))
            .map_err(|e| AppError::Agent(e.to_string()));
        }

        let text = String::from_utf8_lossy(&body).to_string();
        let mut extracted = text;

        if content_type.contains("application/json") {
            if let Ok(parsed) = serde_json::from_str::<Value>(&extracted) {
                extracted =
                    serde_json::to_string_pretty(&parsed).unwrap_or_else(|_| extracted.clone());
            }
        }

        let truncated = extracted.len() > max_chars;
        if truncated {
            let boundary = extracted
                .char_indices()
                .take(max_chars)
                .last()
                .map(|(i, _)| i)
                .unwrap_or(0);
            extracted = format!(
                "{}\n…(truncated, {} chars total)…",
                &extracted[..boundary],
                extracted.len()
            );
        }

        let result = json!({
            "url": url_str,
            "status": status.as_u16(),
            "contentType": content_type,
            "truncated": truncated,
            "length": extracted.len(),
            "text": extracted
        });

        serde_json::to_string_pretty(&result).map_err(|e| AppError::Agent(e.to_string()))
    }
}
