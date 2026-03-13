use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum WorkflowSource {
    Manual,
    Agent,
}

impl WorkflowSource {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Manual => "manual",
            Self::Agent => "agent",
        }
    }

    pub fn from_db(value: &str) -> Option<Self> {
        match value {
            "manual" => Some(Self::Manual),
            "agent" => Some(Self::Agent),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum WorkflowStatus {
    Draft,
    Active,
}

impl WorkflowStatus {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Draft => "draft",
            Self::Active => "active",
        }
    }

    pub fn from_db(value: &str) -> Option<Self> {
        match value {
            "draft" => Some(Self::Draft),
            "active" => Some(Self::Active),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum WorkflowRunStatus {
    Queued,
    Running,
    Succeeded,
    Failed,
}

impl WorkflowRunStatus {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Queued => "queued",
            Self::Running => "running",
            Self::Succeeded => "succeeded",
            Self::Failed => "failed",
        }
    }

    pub fn from_db(value: &str) -> Option<Self> {
        match value {
            "queued" => Some(Self::Queued),
            "running" => Some(Self::Running),
            "succeeded" => Some(Self::Succeeded),
            "failed" => Some(Self::Failed),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum WorkflowRunStepStatus {
    Pending,
    Running,
    Succeeded,
    Failed,
    Skipped,
}

impl WorkflowRunStepStatus {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Pending => "pending",
            Self::Running => "running",
            Self::Succeeded => "succeeded",
            Self::Failed => "failed",
            Self::Skipped => "skipped",
        }
    }

    pub fn from_db(value: &str) -> Option<Self> {
        match value {
            "pending" => Some(Self::Pending),
            "running" => Some(Self::Running),
            "succeeded" => Some(Self::Succeeded),
            "failed" => Some(Self::Failed),
            "skipped" => Some(Self::Skipped),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowStepInput {
    pub name: String,
    pub instructions: String,
    pub agent_id: String,
    /// Step IDs this step depends on. NULL = linear (position-based).
    #[serde(default)]
    pub depends_on: Option<Vec<String>>,
    /// Number of times to retry on failure (default 0 = no retry).
    #[serde(default)]
    pub max_retries: u8,
    /// Per-step timeout in seconds. NULL = no timeout.
    #[serde(default)]
    pub timeout_secs: Option<u64>,
    /// Condition expression, e.g. "step_name.succeeded". NULL = always run.
    #[serde(default)]
    pub condition: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateWorkflowInput {
    pub name: String,
    pub description: String,
    pub status: WorkflowStatus,
    pub steps: Vec<WorkflowStepInput>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct UpdateWorkflowInput {
    pub name: Option<String>,
    pub description: Option<String>,
    pub status: Option<WorkflowStatus>,
    pub steps: Option<Vec<WorkflowStepInput>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowStep {
    pub id: String,
    pub workflow_id: String,
    pub position: i64,
    pub name: String,
    pub instructions: String,
    pub agent_id: String,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default)]
    pub depends_on: Option<Vec<String>>,
    #[serde(default)]
    pub max_retries: u8,
    #[serde(default)]
    pub timeout_secs: Option<u64>,
    #[serde(default)]
    pub condition: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowListItem {
    pub id: String,
    pub name: String,
    pub description: String,
    pub source: WorkflowSource,
    pub status: WorkflowStatus,
    pub created_by: String,
    pub created_at: String,
    pub updated_at: String,
    pub step_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowDetail {
    pub id: String,
    pub name: String,
    pub description: String,
    pub source: WorkflowSource,
    pub status: WorkflowStatus,
    pub created_by: String,
    pub created_at: String,
    pub updated_at: String,
    pub steps: Vec<WorkflowStep>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowRunStartResponse {
    pub run_id: String,
    pub status: WorkflowRunStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowRunListItem {
    pub id: String,
    pub workflow_id: String,
    pub status: WorkflowRunStatus,
    pub triggered_by: String,
    pub input: String,
    pub error: Option<String>,
    pub started_at: String,
    pub completed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowRunStepDetail {
    pub id: String,
    pub run_id: String,
    pub step_id: String,
    pub position: i64,
    pub step_name: String,
    pub agent_id: String,
    pub status: WorkflowRunStepStatus,
    pub input: String,
    pub output: Option<String>,
    pub error: Option<String>,
    pub conversation_id: Option<String>,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
    pub retry_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowRunDetail {
    pub id: String,
    pub workflow_id: String,
    pub status: WorkflowRunStatus,
    pub triggered_by: String,
    pub input: String,
    pub error: Option<String>,
    pub started_at: String,
    pub completed_at: Option<String>,
    pub steps: Vec<WorkflowRunStepDetail>,
}

#[derive(Debug, Clone)]
pub struct WorkflowRunExecutionStep {
    pub run_step_id: String,
    pub step_id: String,
    pub position: i64,
    pub step_name: String,
    pub instructions: String,
    pub agent_id: String,
    /// Parsed from JSON column; None means linear (position-based).
    pub depends_on: Option<Vec<String>>,
    pub max_retries: u8,
    pub timeout_secs: Option<u64>,
    pub condition: Option<String>,
    pub retry_count: i64,
}

#[derive(Debug, Clone)]
pub struct WorkflowRunExecutionContext {
    pub run_id: String,
    pub workflow_id: String,
    pub run_input: String,
    pub steps: Vec<WorkflowRunExecutionStep>,
}
