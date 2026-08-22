#![allow(dead_code)]
//! Data models shared between the daemon, the store, and the UI.

use serde::{Deserialize, Serialize};

/// Generic `{ items: [...] }` API envelope.
#[derive(Debug, Clone, Deserialize)]
pub struct ListResponse<T> {
    pub items: Vec<T>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ConversationSummary {
    pub id: String,
    pub title: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ConversationDetail {
    pub id: String,
    pub messages: Vec<ChatMessage>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ChatMessage {
    #[serde(default)]
    pub id: String,
    pub role: ChatRole,
    pub content: String,
    #[serde(default)]
    pub created_at: Option<String>,
}

impl ChatMessage {
    pub fn new(role: ChatRole, content: impl Into<String>) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            role,
            content: content.into(),
            created_at: None,
        }
    }

    /// Human-readable label used when rendering tool activity rows.
    pub fn is_tool(&self) -> bool {
        self.role == ChatRole::Tool
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ChatRole {
    System,
    User,
    Assistant,
    Tool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct HealthResponse {
    pub status: String,
    #[serde(default)]
    pub provider: Option<String>,
}

/// A pending tool approval requested by the agent.
#[derive(Debug, Clone)]
pub struct PendingApproval {
    pub request_id: String,
    pub tool: String,
    pub arguments: serde_json::Value,
}

/// A structured form request coming over the socket.
#[derive(Debug, Clone, Deserialize)]
pub struct InputRequest {
    #[serde(rename = "request_id")]
    pub request_id: String,
    pub payload: InputRequestPayload,
}

impl InputRequest {
    pub fn id(&self) -> &str {
        &self.request_id
    }

    pub fn title(&self) -> &str {
        &self.payload.spec.title
    }

    pub fn fields(&self) -> &[InputFieldSpec] {
        &self.payload.spec.fields
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct InputRequestPayload {
    pub spec: InputRequestSpec,
}

#[derive(Debug, Clone, Deserialize)]
pub struct InputRequestSpec {
    pub title: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub submit_label: Option<String>,
    #[serde(default)]
    pub cancel_label: Option<String>,
    #[serde(default)]
    pub fields: Vec<InputFieldSpec>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct InputFieldSpec {
    pub name: String,
    pub label: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(rename = "type")]
    pub field_type: InputFieldType,
    #[serde(default)]
    pub required: Option<bool>,
    #[serde(default)]
    pub placeholder: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum InputFieldType {
    Text,
    Textarea,
    Select,
    Multiselect,
    Boolean,
    Number,
}

impl InputFieldType {
    /// Whether the field can be answered with a plain text input.
    pub fn is_text_like(self) -> bool {
        matches!(self, Self::Text | Self::Textarea | Self::Number)
    }
}

/// Sidebar navigation destinations (workspace sections).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Destination {
    Chat,
    Search,
    Automations,
    Kanban,
    Agents,
    Sessions,
    Workflows,
    KnowledgeGraph,
    Approvals,
    Logs,
}

impl Destination {
    pub fn title(self) -> &'static str {
        match self {
            Self::Chat => "New chat",
            Self::Search => "Search",
            Self::Automations => "Automations",
            Self::Kanban => "Kanban",
            Self::Agents => "Agents",
            Self::Sessions => "Sessions",
            Self::Workflows => "Workflows",
            Self::KnowledgeGraph => "Knowledge Graph",
            Self::Approvals => "Approvals",
            Self::Logs => "Logs",
        }
    }

    /// REST path used to load the section's resource list, if any.
    pub fn api_path(self) -> Option<&'static str> {
        match self {
            Self::Agents => Some("/api/agents"),
            Self::Sessions => Some("/api/sessions"),
            Self::Workflows => Some("/api/workflows"),
            Self::KnowledgeGraph => Some("/api/graph/facts"),
            Self::Approvals => Some("/api/approvals"),
            Self::Logs => Some("/api/logs?limit=200"),
            Self::Automations => Some("/api/cron"),
            Self::Kanban => Some("/api/kanban/board"),
            _ => None,
        }
    }
}

/// Extract a human-friendly title from an arbitrary JSON item.
pub fn display_title(value: &serde_json::Value) -> String {
    for key in ["title", "name", "label", "message", "tool", "id"] {
        if let Some(s) = value.get(key).and_then(|v| v.as_str()) {
            if !s.is_empty() {
                return s.to_string();
            }
        }
    }
    "Item".to_string()
}

/// Extract a human-friendly subtitle from an arbitrary JSON item.
pub fn display_subtitle(value: &serde_json::Value) -> Option<String> {
    for key in ["description", "status", "state", "target", "updated_at", "created_at"] {
        if let Some(s) = value.get(key).and_then(|v| v.as_str()) {
            if !s.is_empty() {
                return Some(s.to_string());
            }
        }
    }
    None
}

/// Pull the collection of items out of an arbitrary JSON payload.
pub fn collection_items(value: &serde_json::Value) -> Vec<serde_json::Value> {
    if let Some(arr) = value.as_array() {
        return arr.clone();
    }
    for key in ["items", "pending", "recent", "facts", "profiles"] {
        if let Some(arr) = value.get(key).and_then(|v| v.as_array()) {
            return arr.clone();
        }
    }
    if let Some(columns) = value.get("columns").and_then(|v| v.as_object()) {
        let mut keys: Vec<_> = columns.keys().cloned().collect();
        keys.sort();
        return keys
            .iter()
            .flat_map(|k| columns[k].as_array().cloned().unwrap_or_default())
            .collect();
    }
    if value.is_object() {
        vec![value.clone()]
    } else {
        Vec::new()
    }
}
