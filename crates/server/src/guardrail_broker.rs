//! `GuardrailBroker` — a `SystemBroker` implementation that enforces the
//! guardrail pipeline on every tool call before executing shell commands.
//!
//! Responsibilities:
//!  1. Classify the command's output origin via `classify_command`.
//!  2. Run input filters (PolicyEnforcer → DataRedactor → TrustGate). Hard-deny
//!     blocks immediately; NeedsApproval waits for a human decision via the
//!     `pending` map.
//!  3. Execute the command via `sh -c` with the configured timeout.
//!  4. Run output filters (OutputScanner → PromptShield) on stdout/stderr.
//!  5. Prepend an injection warning to stderr if PromptShield fires on either
//!     stdout or stderr.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;

use async_trait::async_trait;
use tokio::process::Command;
use tokio::sync::{mpsc, oneshot, Mutex};

use rushdino_agent::system_broker::{
    InputRequest, InputRequestResult, ShellExecRequest, ShellExecResult, SystemBroker,
};
use rushdino_common::{AppError, Result};
use rushdino_security::guardrail::pipeline::{GuardrailPipeline, InputDecision};
use rushdino_security::guardrail::types::{ActionCategory, GuardrailAction, SourceTag};

/// Timeout in seconds to wait for a human approval decision before
/// automatically denying the command.
const APPROVAL_TIMEOUT_SECS: u64 = 60;

// ---------------------------------------------------------------------------
// ApprovalRequest
// ---------------------------------------------------------------------------

/// An approval request sent to the UI when TrustGate requires human
/// input before a command can be executed.
///
/// Does NOT carry a responder channel — the decision is delivered via
/// [`GuardrailBroker::resolve_approval`] keyed by `id`.
#[derive(Debug, Clone)]
pub struct ApprovalRequest {
    pub id: String,
    pub session_id: String,
    pub category: ActionCategory,
    pub description: String,
    /// The command content with secrets redacted, safe to display in UI.
    pub redacted_content: String,
}

// ---------------------------------------------------------------------------
// GuardrailBroker
// ---------------------------------------------------------------------------

/// `SystemBroker` implementation that enforces the guardrail pipeline on
/// every shell command request.
///
/// Construct with [`GuardrailBroker::new`] and share via an `Arc`.
pub struct GuardrailBroker {
    pipeline: Arc<GuardrailPipeline>,
    /// Sends approval requests to the approval queue consumed by the API layer.
    approval_tx: mpsc::Sender<ApprovalRequest>,
    /// In-flight approval waiters keyed by request id.
    pending: Arc<Mutex<HashMap<String, oneshot::Sender<bool>>>>,
    /// Default working directory when the request does not specify one.
    project_dir: PathBuf,
}

impl GuardrailBroker {
    /// Create a new `GuardrailBroker`.
    ///
    /// # Arguments
    /// * `agent_id`         — Identifier of the owning agent (used to key trust state).
    /// * `project_dir`      — Fallback working directory when `host_cwd` is absent.
    /// * `trust_state_path` — Optional path to persist/load trust state across restarts.
    /// * `approval_tx`      — Channel to forward `ApprovalRequest`s to the API layer.
    pub fn new(
        agent_id: &str,
        project_dir: PathBuf,
        trust_state_path: Option<PathBuf>,
        approval_tx: mpsc::Sender<ApprovalRequest>,
    ) -> Self {
        Self {
            pipeline: Arc::new(GuardrailPipeline::new(agent_id, trust_state_path)),
            approval_tx,
            pending: Arc::new(Mutex::new(HashMap::new())),
            project_dir,
        }
    }

    /// Returns a clone of the shared `GuardrailPipeline` for inspection by
    /// API routes (e.g. trust state queries, policy updates).
    pub fn pipeline(&self) -> Arc<GuardrailPipeline> {
        self.pipeline.clone()
    }

    /// Deliver a human approval decision for a pending request.
    ///
    /// Called by the API route layer when the user approves or denies a
    /// command.  If the waiter has already timed out the send is silently
    /// dropped.
    pub async fn resolve_approval(&self, request_id: &str, approved: bool) {
        let sender = self.pending.lock().await.remove(request_id);
        if let Some(tx) = sender {
            // Ignore error — receiver may have dropped on timeout.
            let _ = tx.send(approved);
        }
    }

    /// Classify the origin of a shell command's output.
    ///
    /// Commands that explicitly fetch from the network (curl/wget/http)
    /// produce untrusted output that warrants PromptShield scanning.  All
    /// other commands are treated as local-origin.
    fn classify_command(command: &str) -> SourceTag {
        let trimmed = command.trim();
        if trimmed.starts_with("curl ")
            || trimmed.starts_with("wget ")
            || trimmed.starts_with("http ")
            || trimmed.contains("| curl")
            || trimmed.contains("| wget")
        {
            SourceTag::ShellExternal
        } else {
            SourceTag::LocalFile
        }
    }
}

// ---------------------------------------------------------------------------
// SystemBroker impl
// ---------------------------------------------------------------------------

#[async_trait]
impl SystemBroker for GuardrailBroker {
    async fn execute_shell(&self, request: ShellExecRequest) -> Result<ShellExecResult> {
        let source_tag = Self::classify_command(&request.command);

        // Retrieve agent_id from trust state without holding the lock across await.
        let agent_id = {
            let state = self.pipeline.trust_state();
            let s = state.lock().unwrap();
            s.agent_id().to_string()
        };

        let action = GuardrailAction {
            category: ActionCategory::Bash,
            description: request.command.clone(),
            raw_content: request.command.clone(),
            source_tag: source_tag.clone(),
            session_id: request.session_id.clone().unwrap_or_default(),
            agent_id,
        };

        // ---------------------------------------------------------------
        // 1. Input filters
        // ---------------------------------------------------------------
        match self.pipeline.check_input(&action) {
            InputDecision::Denied(reason) => {
                return Err(rushdino_common::AppError::Agent(format!(
                    "Command blocked by guardrail: {reason}"
                )));
            }

            InputDecision::NeedsApproval {
                redacted_content, ..
            } => {
                // Register waiter BEFORE sending the request so there is no
                // race between the API layer resolving and us registering.
                let (tx, rx) = oneshot::channel::<bool>();
                let req_id = uuid::Uuid::new_v4().to_string();
                self.pending.lock().await.insert(req_id.clone(), tx);

                let req = ApprovalRequest {
                    id: req_id.clone(),
                    session_id: action.session_id.clone(),
                    category: action.category,
                    description: action.description.clone(),
                    redacted_content,
                };

                if let Err(e) = self.approval_tx.send(req).await {
                    // Clean up the pending entry if send fails.
                    self.pending.lock().await.remove(&req_id);
                    return Err(rushdino_common::AppError::Agent(format!(
                        "Failed to send approval request: {e}"
                    )));
                }

                let timeout_result =
                    tokio::time::timeout(std::time::Duration::from_secs(APPROVAL_TIMEOUT_SECS), rx)
                        .await;

                // Always clean up the pending entry — either the timeout fired
                // (entry still present) or the receiver was dropped without a
                // response (entry still present). On success the entry was
                // already removed by `resolve_approval`, so `remove` is a no-op.
                let approved = match timeout_result {
                    Err(_elapsed) => {
                        self.pending.lock().await.remove(&req_id);
                        return Err(rushdino_common::AppError::Agent(
                            "Approval timeout — command denied automatically".to_owned(),
                        ));
                    }
                    Ok(Err(_recv_err)) => {
                        self.pending.lock().await.remove(&req_id);
                        return Err(rushdino_common::AppError::Agent(
                            "Approval channel closed".to_owned(),
                        ));
                    }
                    Ok(Ok(decision)) => decision,
                };

                // Record the decision so TrustGate can update trust state.
                self.pipeline.record_decision(&action, approved);

                if !approved {
                    return Err(rushdino_common::AppError::Agent(
                        "Command denied by user".to_owned(),
                    ));
                }
            }

            InputDecision::Allowed { .. } => {
                // Proceed directly to execution.
            }
        }

        // ---------------------------------------------------------------
        // 2. Execute the command
        // ---------------------------------------------------------------
        let cwd = request
            .host_cwd
            .clone()
            .unwrap_or_else(|| self.project_dir.clone());

        let output = tokio::time::timeout(
            std::time::Duration::from_secs(request.timeout_secs),
            Command::new("sh")
                .arg("-c")
                .arg(&request.command)
                .current_dir(&cwd)
                .output(),
        )
        .await
        .map_err(|_| {
            rushdino_common::AppError::Agent(format!(
                "Command timed out after {}s",
                request.timeout_secs
            ))
        })?
        .map_err(|err| rushdino_common::AppError::Agent(format!("shell_exec failed: {err}")))?;

        let raw_stdout = String::from_utf8_lossy(&output.stdout).into_owned();
        let raw_stderr = String::from_utf8_lossy(&output.stderr).into_owned();

        // ---------------------------------------------------------------
        // 3. Output filters (OutputScanner → PromptShield)
        // ---------------------------------------------------------------
        let stdout_result = self.pipeline.check_output(&raw_stdout, &source_tag);
        let stderr_result = self.pipeline.check_output(&raw_stderr, &source_tag);

        // Prepend injection warnings to stderr when PromptShield detects
        // suspicious content in either stdout or stderr.
        let stderr = match (
            stdout_result.injection_warning,
            stderr_result.injection_warning,
        ) {
            (Some(w1), Some(w2)) => {
                format!(
                    "[GUARDRAIL WARNING] {w1}\n[GUARDRAIL WARNING] {w2}\n{}",
                    stderr_result.content
                )
            }
            (Some(w), None) | (None, Some(w)) => {
                format!("[GUARDRAIL WARNING] {w}\n{}", stderr_result.content)
            }
            (None, None) => stderr_result.content,
        };

        Ok(ShellExecResult {
            exit_status: output
                .status
                .code()
                .map(|c| c.to_string())
                .unwrap_or_else(|| "signal".to_string()),
            stdout: stdout_result.content,
            stderr,
            cwd,
            source_tag,
        })
    }

    async fn request_user_input(&self, _request: InputRequest) -> Result<InputRequestResult> {
        Err(AppError::Agent(
            "request_user_input is not supported by GuardrailBroker".to_owned(),
        ))
    }

    async fn resolve_secrets(&self, input: String) -> String {
        input
    }
}
