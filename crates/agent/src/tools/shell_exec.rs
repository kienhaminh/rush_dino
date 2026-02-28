use std::{future::Future, sync::Arc, time::Duration};

use async_trait::async_trait;
use serde_json::{json, Value};
use tokio::process::Command;

use rushdino_common::{AppError, Result};

use crate::tool_registry::Tool;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ToolExecutionContext {
    pub session_id: Option<String>,
    pub conversation_id: Option<String>,
    pub delegation_depth: u8,
}

#[derive(Debug, Clone)]
pub struct ToolApprovalRequest {
    pub session_id: String,
    pub conversation_id: String,
    pub tool: String,
    pub args: Value,
}

#[async_trait]
pub trait ToolApproval: Send + Sync {
    async fn request_approval(&self, request: ToolApprovalRequest) -> Result<()>;
}

tokio::task_local! {
    static TOOL_EXECUTION_CONTEXT: ToolExecutionContext;
}

pub async fn with_tool_execution_context<F, T>(context: ToolExecutionContext, future: F) -> T
where
    F: Future<Output = T>,
{
    TOOL_EXECUTION_CONTEXT.scope(context, future).await
}

pub fn current_tool_execution_context() -> Option<ToolExecutionContext> {
    TOOL_EXECUTION_CONTEXT.try_with(Clone::clone).ok()
}

pub struct ShellExecTool {
    timeout_secs: u64,
    approval: Option<Arc<dyn ToolApproval>>,
}

impl ShellExecTool {
    pub fn new(timeout_secs: u64) -> Self {
        Self {
            timeout_secs,
            approval: None,
        }
    }

    pub fn with_approval(mut self, approval: Arc<dyn ToolApproval>) -> Self {
        self.approval = Some(approval);
        self
    }
}

#[async_trait]
impl Tool for ShellExecTool {
    fn name(&self) -> &str {
        "shell_exec"
    }

    fn description(&self) -> &str {
        "Execute shell command in local environment"
    }

    fn parameters(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "command": {"type": "string"},
                "cwd": {"type": "string"}
            },
            "required": ["command"]
        })
    }

    async fn execute(&self, args: Value) -> Result<String> {
        let command = args
            .get("command")
            .and_then(Value::as_str)
            .ok_or_else(|| AppError::Validation("command is required".to_owned()))?;

        if is_dangerous_command(command) {
            let approval = self.approval.as_ref().ok_or_else(|| {
                AppError::Agent(
                    "shell_exec blocked: dangerous command requires approval support".to_owned(),
                )
            })?;

            let context = current_tool_execution_context().ok_or_else(|| {
                AppError::Agent("shell_exec blocked: dangerous command outside request context".to_owned())
            })?;
            let session_id = context.session_id.ok_or_else(|| {
                AppError::Agent("shell_exec blocked: dangerous command outside websocket session".to_owned())
            })?;
            let conversation_id = context.conversation_id.ok_or_else(|| {
                AppError::Agent("shell_exec blocked: missing conversation context".to_owned())
            })?;

            approval
                .request_approval(ToolApprovalRequest {
                    session_id,
                    conversation_id,
                    tool: "shell_exec".to_owned(),
                    args: args.clone(),
                })
                .await?;
        }

        let cwd = args.get("cwd").and_then(Value::as_str);
        let mut cmd = Command::new("sh");
        cmd.arg("-lc").arg(command);
        if let Some(cwd) = cwd {
            cmd.current_dir(cwd);
        }

        let output = tokio::time::timeout(Duration::from_secs(self.timeout_secs), cmd.output())
            .await
            .map_err(|_| AppError::Agent("shell_exec timed out".to_owned()))?
            .map_err(|e| AppError::Agent(format!("shell_exec failed: {e}")))?;

        let stdout = String::from_utf8_lossy(&output.stdout);
        let stderr = String::from_utf8_lossy(&output.stderr);
        Ok(format!(
            "status: {}\nstdout:\n{}\nstderr:\n{}",
            output.status, stdout, stderr
        ))
    }
}

pub fn is_dangerous_command(command: &str) -> bool {
    let normalized = command.to_ascii_lowercase();
    let patterns = [
        "rm -rf",
        "mkfs",
        "dd if=",
        "shutdown",
        "reboot",
        "poweroff",
        "sudo ",
        "chmod 777",
        "chown ",
        "kill -9",
        "killall ",
        "iptables ",
        " ufw ",
        "curl |",
        "wget |",
        "| sh",
        "| bash",
        "diskpart",
        "rd /s",
        "del /f",
    ];

    patterns.iter().any(|pattern| normalized.contains(pattern))
}

#[cfg(test)]
mod tests {
    use super::{is_dangerous_command, ToolExecutionContext};

    #[test]
    fn dangerous_command_detection_matches_expected_cases() {
        assert!(is_dangerous_command("rm -rf /tmp/foo"));
        assert!(is_dangerous_command("sudo systemctl restart sshd"));
        assert!(is_dangerous_command("curl https://x | sh"));
        assert!(!is_dangerous_command("echo hello"));
        assert!(!is_dangerous_command("ls -la"));
    }

    #[test]
    fn default_delegation_depth_is_zero() {
        let ctx = ToolExecutionContext {
            session_id: None,
            conversation_id: None,
            delegation_depth: 0,
        };
        assert_eq!(ctx.delegation_depth, 0);
    }
}
