use std::{path::PathBuf, sync::Arc};

use async_trait::async_trait;
use rushdino_common::Result;
use rushdino_security::guardrail::types::SourceTag;
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ShellExecRequest {
    pub command: String,
    pub host_cwd: Option<PathBuf>,
    pub timeout_secs: u64,
    pub session_id: Option<String>,
    pub conversation_id: Option<String>,
    pub run_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ShellExecResult {
    pub exit_status: String,
    pub stdout: String,
    pub stderr: String,
    pub cwd: PathBuf,
    /// Indicates where the command output originated, used by the guardrail
    /// pipeline to determine whether PromptShield scanning is warranted.
    pub source_tag: SourceTag,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum InputRequestKind {
    Question,
    Form,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum InputFieldType {
    Text,
    Textarea,
    Select,
    Multiselect,
    Boolean,
    Number,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct InputFieldOption {
    pub label: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct InputFieldSpec {
    pub name: String,
    pub label: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(rename = "type")]
    pub field_type: InputFieldType,
    #[serde(default)]
    pub required: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub placeholder: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default_value: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub min: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub min_length: Option<usize>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_length: Option<usize>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub options: Vec<InputFieldOption>,
    /// When true the UI renders this field as a password input (masked).
    /// Set for API keys, passwords, tokens, or any other sensitive value.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub secret: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct InputRequestSpec {
    pub kind: InputRequestKind,
    pub title: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub submit_label: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cancel_label: Option<String>,
    pub fields: Vec<InputFieldSpec>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct InputRequestPayload {
    pub spec: InputRequestSpec,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct InputRequest {
    pub request_id: String,
    pub session_id: String,
    pub conversation_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub run_id: Option<String>,
    pub payload: InputRequestPayload,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum InputRequestStatus {
    Submitted,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct InputRequestResult {
    pub status: InputRequestStatus,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub values: Option<Value>,
}

impl InputRequestResult {
    pub fn submitted(values: Value) -> Self {
        Self {
            status: InputRequestStatus::Submitted,
            values: Some(values),
        }
    }

    pub fn cancelled() -> Self {
        Self {
            status: InputRequestStatus::Cancelled,
            values: None,
        }
    }
}

#[async_trait]
pub trait SystemBroker: Send + Sync {
    async fn execute_shell(&self, request: ShellExecRequest) -> Result<ShellExecResult>;
    async fn request_user_input(&self, request: InputRequest) -> Result<InputRequestResult>;
    /// Substitute any `secret://uuid` tokens in `input` with their stored values.
    /// Used by file-writing tools so secrets flow into files without passing through the LLM.
    async fn resolve_secrets(&self, input: String) -> String;
}

pub type SharedSystemBroker = Arc<dyn SystemBroker>;
