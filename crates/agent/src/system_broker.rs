use std::{path::PathBuf, sync::Arc};

use async_trait::async_trait;
use rushdino_common::Result;
use rushdino_security::guardrail::types::SourceTag;

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

#[async_trait]
pub trait SystemBroker: Send + Sync {
    async fn execute_shell(&self, request: ShellExecRequest) -> Result<ShellExecResult>;
}

pub type SharedSystemBroker = Arc<dyn SystemBroker>;
