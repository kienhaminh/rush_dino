use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Lifecycle status of an ACP session.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum AcpSessionStatus {
    Active,
    Completed,
    Error,
}

impl std::fmt::Display for AcpSessionStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Active => write!(f, "active"),
            Self::Completed => write!(f, "completed"),
            Self::Error => write!(f, "error"),
        }
    }
}

/// Persisted record of an ACP coding-agent session.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AcpSessionRecord {
    pub id: String,
    pub agent_id: String,
    pub conversation_id: String,
    pub rush_run_id: Option<String>,
    pub status: AcpSessionStatus,
    pub working_dir: String,
    pub started_at: DateTime<Utc>,
    pub completed_at: Option<DateTime<Utc>>,
    pub error: Option<String>,
}
