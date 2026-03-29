use serde::{Deserialize, Serialize};

use rushdino_common::{AppError, Result};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum RunKind {
    Assistant,
    Workflow,
}

impl RunKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Assistant => "assistant",
            Self::Workflow => "workflow",
        }
    }

    pub fn parse(value: &str) -> Result<Self> {
        match value {
            "assistant" => Ok(Self::Assistant),
            "workflow" => Ok(Self::Workflow),
            other => Err(AppError::Validation(format!("invalid run kind: {other}"))),
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum RunState {
    Queued,
    Running,
    AwaitingApproval,
    AwaitingInput,
    Blocked,
    Completed,
    Failed,
    Aborted,
}

impl RunState {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Queued => "queued",
            Self::Running => "running",
            Self::AwaitingApproval => "awaiting_approval",
            Self::AwaitingInput => "awaiting_input",
            Self::Blocked => "blocked",
            Self::Completed => "completed",
            Self::Failed => "failed",
            Self::Aborted => "aborted",
        }
    }

    pub fn parse(value: &str) -> Result<Self> {
        match value {
            "queued" => Ok(Self::Queued),
            "running" => Ok(Self::Running),
            "awaiting_approval" => Ok(Self::AwaitingApproval),
            "awaiting_input" => Ok(Self::AwaitingInput),
            "blocked" => Ok(Self::Blocked),
            "completed" => Ok(Self::Completed),
            "failed" => Ok(Self::Failed),
            "aborted" => Ok(Self::Aborted),
            other => Err(AppError::Validation(format!("invalid run state: {other}"))),
        }
    }

    pub fn is_terminal(self) -> bool {
        matches!(self, Self::Completed | Self::Failed | Self::Aborted)
    }

    pub fn is_wait_target(self) -> bool {
        self.is_terminal()
            || matches!(self, Self::AwaitingApproval | Self::AwaitingInput | Self::Blocked)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RunPolicySnapshot {
    pub decision: String,
    pub approval_state: String,
    pub sandbox_state: String,
    pub effective_scope: String,
    pub reason: Option<String>,
}

impl Default for RunPolicySnapshot {
    fn default() -> Self {
        Self {
            decision: "allow".to_owned(),
            approval_state: "not_required".to_owned(),
            sandbox_state: "unknown".to_owned(),
            effective_scope: "workspace".to_owned(),
            reason: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunSnapshot {
    pub id: String,
    pub kind: RunKind,
    pub state: RunState,
    pub source: Option<String>,
    pub channel_id: Option<String>,
    pub sender_id: Option<String>,
    pub gateway_session_id: Option<String>,
    pub session_id: Option<String>,
    pub conversation_id: Option<String>,
    pub workflow_id: Option<String>,
    pub title: String,
    pub input_text: Option<String>,
    pub output_text: Option<String>,
    pub provider: String,
    pub model: String,
    pub fallback_profile_id: Option<String>,
    pub queue_position: Option<i64>,
    pub active_tool: Option<String>,
    pub abort_requested: bool,
    pub policy: RunPolicySnapshot,
    pub error: Option<String>,
    pub created_at: String,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunEventRecord {
    pub id: String,
    pub run_id: String,
    pub event_type: String,
    pub state: Option<RunState>,
    pub tool_name: Option<String>,
    pub message: Option<String>,
    pub policy: RunPolicySnapshot,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunDetail {
    pub snapshot: RunSnapshot,
    pub events: Vec<RunEventRecord>,
}

#[derive(Debug, Clone)]
pub struct RunListFilter {
    pub kind: Option<RunKind>,
    pub state: Option<RunState>,
    pub source: Option<String>,
    pub channel_id: Option<String>,
    pub gateway_session_id: Option<String>,
    pub session_id: Option<String>,
    pub conversation_id: Option<String>,
    pub limit: i64,
}

#[derive(Debug, Clone, Default)]
pub struct RunOriginMetadata {
    pub source: Option<String>,
    pub channel_id: Option<String>,
    pub sender_id: Option<String>,
    pub gateway_session_id: Option<String>,
}

impl Default for RunListFilter {
    fn default() -> Self {
        Self {
            kind: None,
            state: None,
            source: None,
            channel_id: None,
            gateway_session_id: None,
            session_id: None,
            conversation_id: None,
            limit: 50,
        }
    }
}
