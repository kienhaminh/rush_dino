//! Web fetch tool — fetch and extract readable content from a URL.
//! Ported from OpenClaw's web_fetch tool.

use std::sync::Arc;

use async_trait::async_trait;
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
use rushdino_security::validation::{validate_url, ValidationError};

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
            // Extract <main> or <body> content first, then strip HTML tags.
            let scoped = extract_main_content(&extracted);
            let plain = strip_html(&scoped);
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

/// Extract the content inside `<main>` or `<body>`, whichever is found first.
/// Falls back to the full HTML if neither tag is present.
fn extract_main_content(html: &str) -> String {
    let lower = html.to_lowercase();

    // Try <main> first — it's the most focused content region.
    if let Some(content) = extract_tag_content(html, &lower, "main") {
        return content;
    }
    // Fall back to <body>.
    if let Some(content) = extract_tag_content(html, &lower, "body") {
        return content;
    }
    // No recognizable structure — return as-is.
    html.to_owned()
}

/// Find the first occurrence of `<tag ...>` and its matching `</tag>`, returning
/// the inner content. Uses the pre-lowercased `lower` for case-insensitive
/// matching while slicing from the original `html` to preserve casing.
fn extract_tag_content(html: &str, lower: &str, tag: &str) -> Option<String> {
    let open_pattern = format!("<{tag}");
    let close_pattern = format!("</{tag}>");

    let open_start = lower.find(&open_pattern)?;
    // Skip past the opening tag's `>`.
    let after_open = lower[open_start..].find('>')? + open_start + 1;
    let close_start = lower[after_open..].find(&close_pattern)? + after_open;
    Some(html[after_open..close_start].to_owned())
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
            let is_block = [
                "<div", "<p>", "<p ", "<br", "<h1", "<h2", "<h3", "<h4", "<h5", "<h6", "<li",
                "<tr", "<td", "<th", "<section", "<article", "<header", "<footer", "<main", "<nav",
                "</div", "</p", "</h1", "</h2", "</h3", "</h4", "</h5", "</h6", "</li", "</tr",
            ]
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

    let system_instructions = "You are a web content extraction assistant. \
         Extract the key information from web pages. \
         Remove navigation menus, headers, footers, ads, cookie notices, and other boilerplate. \
         Keep the main article or page content. \
         Preserve important facts, data, dates, and details. \
         Write in clean, readable prose. \
         Be comprehensive but concise.";

    let user_prompt = format!(
        "Extract the key information from this web page.\n\
         URL: {url}\n\n\
         Page content:\n{truncated_text}"
    );

    let request = ChatRequest {
        messages: vec![
            Message::new(Uuid::new_v4().to_string(), Role::System, system_instructions.to_owned()),
            Message::new(Uuid::new_v4().to_string(), Role::User, user_prompt),
        ],
        tools: None,
        temperature: Some(0.1),
        max_tokens: Some(LLM_EXTRACT_MAX_TOKENS),
        model: None,
        thinking_level: Some(ThinkingLevel::Off),
    };

    let response = provider.chat(request).await?;
    Ok(response.content)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_main_tag_preferred_over_body() {
        let html = r#"<html><body><nav>Menu</nav><main><h1>Article</h1><p>Content</p></main><footer>Foot</footer></body></html>"#;
        let result = extract_main_content(html);
        assert!(result.contains("<h1>Article</h1>"));
        assert!(result.contains("<p>Content</p>"));
        assert!(!result.contains("Menu"), "nav should be excluded");
        assert!(!result.contains("Foot"), "footer should be excluded");
    }

    #[test]
    fn extract_falls_back_to_body() {
        let html = r#"<html><body><h1>Title</h1><p>Body content</p></body></html>"#;
        let result = extract_main_content(html);
        assert!(result.contains("<h1>Title</h1>"));
        assert!(result.contains("Body content"));
    }

    #[test]
    fn extract_returns_full_html_when_no_tags() {
        let html = "<h1>No body or main</h1><p>Just fragments</p>";
        let result = extract_main_content(html);
        assert_eq!(result, html);
    }

    #[test]
    fn extract_main_case_insensitive() {
        let html = r#"<HTML><BODY><MAIN class="content"><p>Hello</p></MAIN></BODY></HTML>"#;
        let result = extract_main_content(html);
        assert!(result.contains("<p>Hello</p>"));
        assert!(!result.contains("<BODY>"));
    }

    #[test]
    fn strip_html_removes_script_and_style() {
        let html = "<div><script>alert('x')</script><style>.a{}</style><p>Hello</p></div>";
        let plain = strip_html(html);
        assert!(plain.contains("Hello"));
        assert!(!plain.contains("alert"));
        assert!(!plain.contains(".a{}"));
    }
}
