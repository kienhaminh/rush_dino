use std::path::{Path, PathBuf};
use std::sync::Arc;

use async_trait::async_trait;
use serde_json::json;
use tokio::process::Command;

use rushdino_agent::{
    tools::shell_exec::is_dangerous_command, AgentRuntime, RunPolicySnapshot, ShellExecRequest,
    ShellExecResult, SystemBroker,
};
use rushdino_common::{init, AppError, Result};

use rushdino_security::sandbox::{
    apply_subprocess_isolation, platform_supports_sandbox, SandboxPolicy,
};

use crate::approval_gate::ApprovalGate;

pub struct LocalSystemBroker {
    approval_gate: Arc<ApprovalGate>,
    runtime: Arc<AgentRuntime>,
}

impl LocalSystemBroker {
    pub fn new(approval_gate: Arc<ApprovalGate>, runtime: Arc<AgentRuntime>) -> Self {
        Self {
            approval_gate,
            runtime,
        }
    }

    async fn ensure_approval(&self, request: &ShellExecRequest, cwd: &Path) -> Result<()> {
        if !is_dangerous_command(&request.command) {
            return Ok(());
        }

        // The agent has unrestricted access to its own workspace.
        let rushdino_home = init::canonical_home_dir();
        let command_targets_rushdino = request
            .command
            .contains(rushdino_home.to_str().unwrap_or(".rushdino"))
            || request.command.contains(".rushdino/")
            || request.command.contains("/.rushdino");
        if cwd.starts_with(&rushdino_home)
            || cwd.components().any(|c| c.as_os_str() == ".rushdino")
            || command_targets_rushdino
        {
            return Ok(());
        }

        let session_id = request.session_id.as_deref().ok_or_else(|| {
            AppError::Agent(
                "shell_exec blocked: dangerous command outside websocket session".to_owned(),
            )
        })?;
        let conversation_id = request.conversation_id.as_deref().ok_or_else(|| {
            AppError::Agent("shell_exec blocked: missing conversation context".to_owned())
        })?;

        if let Some(run_id) = request.run_id.as_deref() {
            let _ = self
                .runtime
                .mark_awaiting_approval(
                    run_id,
                    "exec",
                    RunPolicySnapshot {
                        decision: "ask".to_owned(),
                        approval_state: "pending".to_owned(),
                        sandbox_state: "host".to_owned(),
                        effective_scope: "host".to_owned(),
                        reason: Some(
                            "Dangerous shell execution requires explicit operator approval."
                                .to_owned(),
                        ),
                    },
                )
                .await;
        }

        let approval_result = self
            .approval_gate
            .request_approval(
                session_id,
                conversation_id,
                request.run_id.as_deref(),
                "exec",
                json!({
                    "command": request.command,
                    "cwd": cwd.display().to_string(),
                }),
            )
            .await;

        // If the originating session disconnected while the agent was running,
        // auto-approve rather than hard-failing the tool call. The user initiated
        // the run and a disconnection should not abort in-progress work.
        let approval_result = match approval_result {
            Err(AppError::Agent(ref msg))
                if msg.contains("no active session")
                    || msg.contains("websocket session unavailable") =>
            {
                tracing::warn!(
                    session_id = session_id,
                    command = request.command,
                    "session disconnected — auto-approving command"
                );
                Ok(())
            }
            other => other,
        };

        if let Some(run_id) = request.run_id.as_deref() {
            let _ = self
                .runtime
                .record_approval_resolution(
                    run_id,
                    approval_result.is_ok(),
                    approval_result
                        .as_ref()
                        .err()
                        .map(ToString::to_string)
                        .or_else(|| {
                            Some("Operator approved dangerous shell execution.".to_owned())
                        }),
                )
                .await;
        }

        approval_result
    }
}

#[async_trait]
impl SystemBroker for LocalSystemBroker {
    async fn execute_shell(&self, request: ShellExecRequest) -> Result<ShellExecResult> {
        let cwd = resolve_cwd(request.host_cwd.as_deref())?;
        self.ensure_approval(&request, &cwd).await?;

        let mut cmd = Command::new("sh");
        cmd.args(["-c", &request.command]).current_dir(&cwd);

        if platform_supports_sandbox() {
            let workspace = init::canonical_home_dir();
            let temp_dir = std::env::temp_dir();
            let mut writable = vec![workspace.clone(), temp_dir.clone()];
            if let Ok(p) = temp_dir.canonicalize() {
                writable.push(p);
            }
            if let Ok(p) = workspace.canonicalize() {
                writable.push(p);
            }
            let policy = SandboxPolicy::new(writable, true);
            #[cfg(unix)]
            unsafe {
                cmd.pre_exec(move || {
                    apply_subprocess_isolation(&policy).map_err(std::io::Error::other)
                });
            }
        }

        let output = tokio::time::timeout(
            std::time::Duration::from_secs(request.timeout_secs),
            cmd.output(),
        )
        .await
        .map_err(|_| AppError::Agent("shell_exec timed out".to_owned()))?
        .map_err(|err| AppError::Agent(format!("shell_exec failed: {err}")))?;

        Ok(ShellExecResult {
            exit_status: output.status.to_string(),
            stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
            stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
            cwd,
        })
    }
}

fn resolve_cwd(requested: Option<&Path>) -> Result<PathBuf> {
    let candidate = match requested {
        Some(path) if path.is_absolute() => path.to_path_buf(),
        Some(path) => std::env::current_dir().map_err(AppError::Io)?.join(path),
        None => std::env::current_dir().map_err(AppError::Io)?,
    };

    let canonical = candidate.canonicalize().map_err(|err| {
        AppError::Validation(format!(
            "invalid shell_exec cwd '{}': {err}",
            candidate.display()
        ))
    })?;

    if !canonical.is_dir() {
        return Err(AppError::Validation(format!(
            "shell_exec cwd is not a directory: {}",
            canonical.display()
        )));
    }

    Ok(canonical)
}

#[cfg(test)]
mod tests {
    use std::{sync::Arc, time::Duration};

    use serde_json::json;
    use sqlx::SqlitePool;

    use super::*;
    use crate::approval_gate::ApprovalGate;

    #[tokio::test]
    async fn dangerous_commands_are_routed_through_approval_gate() {
        let gate = ApprovalGate::with_timeout(Duration::from_secs(1));
        let pool = Arc::new(
            SqlitePool::connect("sqlite::memory:")
                .await
                .expect("in-memory sqlite should connect"),
        );
        let runtime = Arc::new(AgentRuntime::new(pool));
        let broker = LocalSystemBroker::new(gate.clone(), runtime);
        let mut rx = gate.register_session("session-1").await;

        let approval_task = tokio::spawn(async move {
            broker
                .ensure_approval(
                    &ShellExecRequest {
                        command: "rm -rf /tmp/test".to_owned(),
                        host_cwd: None,
                        timeout_secs: 30,
                        session_id: Some("session-1".to_owned()),
                        conversation_id: Some("conv-1".to_owned()),
                        run_id: Some("run-1".to_owned()),
                    },
                    Path::new("/tmp"),
                )
                .await
        });

        let request = rx.recv().await.expect("approval request should be emitted");
        assert_eq!(request.tool, "exec");
        assert_eq!(request.run_id.as_deref(), Some("run-1"));
        assert_eq!(
            request.args,
            json!({"command": "rm -rf /tmp/test", "cwd": "/tmp"})
        );
        gate.resolve("session-1", &request.request_id, true)
            .await
            .expect("approval should resolve");

        assert!(approval_task
            .await
            .expect("approval task should complete")
            .is_ok());
    }
}
