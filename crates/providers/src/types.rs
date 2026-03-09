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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatRequest {
    pub messages: Vec<Message>,
    pub tools: Option<Vec<ToolDefinition>>,
    pub temperature: Option<f32>,
    pub max_tokens: Option<u32>,
    pub model: Option<String>,
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
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelInfo {
    pub id: String,
    pub name: Option<String>,
    pub description: Option<String>,
    pub context_window: Option<u32>,
    pub is_reasoning: Option<bool>,
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
        api_key: String,
        model: String,
        base_url: Option<String>,
    },
    Anthropic {
        api_key: String,
        model: String,
    },
    Codex {
        /// OAuth access token used as Bearer authorization
        access_token: String,
        model: String,
    },
    Plugin {
        manifest_path: std::path::PathBuf,
    },
}
