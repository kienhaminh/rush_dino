//! AG-UI `RunAgentInput` request schema.
//!
//! Mirrors the wire shape produced by `@ag-ui/client`'s `HttpAgent`. All
//! top-level keys are camelCase per AG-UI spec; serde renames map them onto
//! idiomatic Rust snake_case fields.

use serde::Deserialize;
use serde_json::Value;

use rushdino_providers::types::ThinkingLevel;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunAgentInput {
    pub thread_id: String,
    pub run_id: String,
    #[serde(default)]
    pub parent_run_id: Option<String>,
    #[serde(default)]
    pub state: Option<Value>,
    #[serde(default)]
    pub messages: Vec<AguiMessage>,
    #[serde(default)]
    pub tools: Vec<Value>,
    #[serde(default)]
    pub context: Vec<Value>,
    #[serde(default)]
    pub forwarded_props: Option<ForwardedProps>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ForwardedProps {
    #[serde(default)]
    pub profile_id: Option<String>,
    #[serde(default)]
    pub thinking_mode: Option<ThinkingLevel>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AguiMessage {
    pub role: String,
    #[serde(default)]
    pub content: Option<String>,
    #[serde(default)]
    pub id: Option<String>,
}

impl RunAgentInput {
    /// Last `user` message in the conversation — what the agent should react to.
    pub fn last_user_message(&self) -> Option<&str> {
        self.messages
            .iter()
            .rev()
            .find(|m| m.role.eq_ignore_ascii_case("user"))
            .and_then(|m| m.content.as_deref())
    }
}
