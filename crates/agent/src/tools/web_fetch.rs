//! Web fetch tool — fetch and extract readable content from a URL.
//! Ported from OpenClaw's web_fetch tool.

use std::sync::Arc;

use async_trait::async_trait;
use chrono::Utc;
use serde_json::{json, Value};
use uuid::Uuid;

use rushdino_common::{
    models::{Message, Role},
    AppError, Result,
};
use rushdino_providers::{
    types::{ChatRequest, ThinkingLevel},
    Provider,
};
use rushdino_security::{
    egress_proxy::{EgressDecision, EgressProxy, EgressRequest},
    validation::{validate_url, ValidationError},
};

use crate::tool_registry::Tool;

const DEFAULT_MAX_CHARS: usize = 50_000;
const DEFAULT_MAX_RESPONSE_BYTES: usize = 2_000_000;
const DEFAULT_TIMEOUT_SECS: u64 = 30;
/// Maximum characters of stripped text fed to the LLM for extraction.
const LLM_INPUT_LIMIT: usize = 40_000;
/// Maximum tokens the LLM may produce when extracting content.
const LLM_EXTRACT_MAX_TOKENS: u32 = 2048;

pub struct WebFetchTool {
    max_chars: usize,
    max_response_bytes: usize,
    timeout_secs: u64,
    allowed_external_hosts: Vec<String>,
    /// Optional egress proxy for sandbox policy enforcement.
    /// When set, network requests are checked before execution.
    pub egress_proxy: Option<Arc<EgressProxy>>,
    /// Optional LLM provider for HTML-to-summary extraction.
    provider: Option<Arc<Provider>>,
}

impl WebFetchTool {
    pub fn new() -> Self {
        Self {
            max_chars: DEFAULT_MAX_CHARS,
            max_response_bytes: DEFAULT_MAX_RESPONSE_BYTES,
            timeout_secs: DEFAULT_TIMEOUT_SECS,
            allowed_external_hosts: Vec::new(),
            egress_proxy: None,
            provider: None,
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

    /// Attach an LLM provider used to extract key information from HTML pages.
    pub fn with_provider(mut self, provider: Arc<Provider>) -> Self {
        self.provider = Some(provider);
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
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            )
            .header(
                "Accept",
                "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
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
        } else if content_type.contains("text/html") {
            // Strip HTML tags to plain text, then use LLM to extract key information.
            let plain = strip_html(&extracted);
            extracted = if let Some(provider) = &self.provider {
                match extract_with_llm(provider, url_str, &plain).await {
                    Ok(summary) => summary,
                    Err(e) => {
                        tracing::warn!(url = url_str, error = %e, "LLM extraction failed, falling back to stripped text");
                        plain
                    }
                }
            } else {
                plain
            };
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

/// Strip HTML tags and return plain text.
///
/// Removes `<script>` and `<style>` blocks entirely (content included).
/// Adds line breaks for block-level elements. Decodes common HTML entities.
fn strip_html(html: &str) -> String {
    let html_lower = html.to_lowercase();
    let mut out = String::with_capacity(html.len() / 3);
    let mut i = 0;

    while i < html.len() {
        if html.as_bytes()[i] != b'<' {
            let ch = html[i..].chars().next().unwrap_or('\0');
            out.push(ch);
            i += ch.len_utf8();
            continue;
        }

        // We are at '<'.
        let rest_lower = &html_lower[i..];

        // Skip entire script / style blocks (tag + content + closing tag).
        let block_end = if rest_lower.starts_with("<script") {
            html_lower[i..].find("</script>").map(|e| i + e + 9)
        } else if rest_lower.starts_with("<style") {
            html_lower[i..].find("</style>").map(|e| i + e + 8)
        } else {
            None
        };

        if let Some(new_i) = block_end {
            i = new_i;
            out.push('\n');
            continue;
        }

        // Regular tag: skip to '>' and emit whitespace.
        if let Some(end) = html[i..].find('>') {
            let tag_snippet = &html_lower[i..i + end + 1];
            let is_block = ["<div", "<p>", "<p ", "<br", "<h1", "<h2", "<h3", "<h4", "<h5",
                            "<h6", "<li", "<tr", "<td", "<th", "<section", "<article",
                            "<header", "<footer", "<main", "<nav", "</div", "</p", "</h1",
                            "</h2", "</h3", "</h4", "</h5", "</h6", "</li", "</tr"]
                .iter()
                .any(|t| tag_snippet.starts_with(t));
            i += end + 1;
            if is_block {
                out.push('\n');
            } else {
                out.push(' ');
            }
        } else {
            i += 1;
        }
    }

    // Decode common HTML entities.
    let out = out
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&apos;", "'")
        .replace("&nbsp;", " ")
        .replace("&mdash;", "—")
        .replace("&ndash;", "–")
        .replace("&hellip;", "…");

    // Collapse whitespace: trim each line, drop empty lines.
    out.lines()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .collect::<Vec<_>>()
        .join("\n")
}

/// Call the LLM to extract and summarize key information from stripped web page text.
async fn extract_with_llm(provider: &Provider, url: &str, text: &str) -> Result<String> {
    // Limit input size to avoid excessive token usage.
    let truncated_text = if text.len() > LLM_INPUT_LIMIT {
        let boundary = text
            .char_indices()
            .take(LLM_INPUT_LIMIT)
            .last()
            .map(|(i, _)| i)
            .unwrap_or(0);
        &text[..boundary]
    } else {
        text
    };

    let prompt = format!(
        "Extract the key information from this web page.\n\
         URL: {url}\n\n\
         Instructions:\n\
         - Remove navigation menus, headers, footers, ads, cookie notices, and other boilerplate\n\
         - Keep the main article or page content\n\
         - Preserve important facts, data, dates, and details\n\
         - Write in clean, readable prose\n\
         - Be comprehensive but concise\n\n\
         Page content:\n{truncated_text}"
    );

    let request = ChatRequest {
        messages: vec![Message {
            id: Uuid::new_v4().to_string(),
            role: Role::User,
            content: prompt,
            tool_calls: None,
            rich_content: None,
            created_at: Utc::now(),
        }],
        tools: None,
        temperature: Some(0.1),
        max_tokens: Some(LLM_EXTRACT_MAX_TOKENS),
        model: None,
        thinking_level: Some(ThinkingLevel::Off),
    };

    let response = provider.chat(request).await?;
    Ok(response.content)
}
