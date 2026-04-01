use serde::{Deserialize, Serialize};
use serde_json::Value;

use rushdino_common::{
    models::{Message, ToolCall},
    RichContent,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolDefinition {
    pub name: String,
    pub description: String,
    pub parameters: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Usage {
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub total_tokens: u32,
}

/// Unified thinking/reasoning level across all providers.
///
/// - OpenAI: maps to `reasoning_effort` ("minimal"…"xhigh") or disabled.
/// - Anthropic: maps to `thinking.budget_tokens` (token-based) or effort level (adaptive models).
/// - "xhigh" is only supported by select OpenAI models (gpt-5.*-codex-max, gpt-5.2+).
/// - "adaptive" lets the model choose its own reasoning depth.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "lowercase")]
pub enum ThinkingLevel {
    Off,
    Minimal,
    #[default]
    Low,
    Medium,
    High,
    Xhigh,
    Adaptive,
}

impl ThinkingLevel {
    /// Token budget for Anthropic token-based thinking (non-adaptive models).
    pub fn anthropic_budget_tokens(&self) -> Option<u32> {
        match self {
            ThinkingLevel::Off => None,
            ThinkingLevel::Minimal => Some(1024),
            ThinkingLevel::Low => Some(2048),
            ThinkingLevel::Medium => Some(8192),
            ThinkingLevel::High | ThinkingLevel::Xhigh | ThinkingLevel::Adaptive => Some(16384),
        }
    }

    /// Effort level for Anthropic adaptive thinking models (Opus 4.6, Sonnet 4.6).
    /// Returns `None` for `Off`.
    pub fn anthropic_effort(&self) -> Option<&'static str> {
        match self {
            ThinkingLevel::Off => None,
            ThinkingLevel::Minimal | ThinkingLevel::Low => Some("low"),
            ThinkingLevel::Medium | ThinkingLevel::Adaptive => Some("medium"),
            ThinkingLevel::High => Some("high"),
            ThinkingLevel::Xhigh => Some("high"),
        }
    }

    /// OpenAI `reasoning_effort` string. Returns `None` for `Off`.
    pub fn openai_reasoning_effort(&self) -> Option<&'static str> {
        match self {
            ThinkingLevel::Off => None,
            ThinkingLevel::Minimal => Some("minimal"),
            ThinkingLevel::Low => Some("low"),
            ThinkingLevel::Medium | ThinkingLevel::Adaptive => Some("medium"),
            ThinkingLevel::High => Some("high"),
            ThinkingLevel::Xhigh => Some("xhigh"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatRequest {
    pub messages: Vec<Message>,
    pub tools: Option<Vec<ToolDefinition>>,
    pub temperature: Option<f32>,
    pub max_tokens: Option<u32>,
    pub model: Option<String>,
    pub thinking_level: Option<ThinkingLevel>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatResponse {
    pub content: String,
    pub tool_calls: Vec<ToolCall>,
    pub rich_content: Option<RichContent>,
    pub usage: Option<Usage>,
    pub finish_reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatChunk {
    pub delta: String,
    pub tool_calls: Vec<ToolCall>,
    pub done: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub usage: Option<Usage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thinking_delta: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelInfo {
    pub id: String,
    pub name: Option<String>,
    pub description: Option<String>,
    pub context_window: Option<u32>,
    pub is_reasoning: Option<bool>,
}

/// Authentication method for OpenAI-compatible providers.
/// - `ApiKey`: standard API key, routes to `https://api.openai.com/v1`
/// - `Codex`: ChatGPT OAuth token, routes to `https://chatgpt.com/backend-api/codex/responses`
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "method", rename_all = "snake_case")]
pub enum OpenAIAuth {
    ApiKey { api_key: String },
    Codex { access_token: String },
}

/// Authentication method for Anthropic providers.
/// - `ApiKey`: standard API key sent as `x-api-key` header
/// - `OAuth`: OAuth access token sent as `Authorization: Bearer` header
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "method", rename_all = "snake_case")]
pub enum AnthropicAuth {
    ApiKey { api_key: String },
    OAuth { access_token: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ProviderConfig {
    Ollama {
        base_url: String,
        model: String,
        api_key: Option<String>,
    },
    OpenAI {
        auth: OpenAIAuth,
        model: String,
        base_url: Option<String>,
    },
    Anthropic {
        auth: AnthropicAuth,
        model: String,
    },
}
