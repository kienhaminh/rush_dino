use std::{future::Future, path::PathBuf};

use async_trait::async_trait;
use serde_json::{json, Value};
use tokio::sync::mpsc;

use rushdino_common::{AppError, Result};

use crate::{
    engine::WsStreamEvent,
    system_broker::{SharedSystemBroker, ShellExecRequest},
    tool_registry::Tool,
};

#[derive(Debug, Clone)]
pub struct ToolExecutionContext {
    pub session_id: Option<String>,
    pub conversation_id: Option<String>,
    pub run_id: Option<String>,
    pub delegation_depth: u8,
    /// Per-agent workspace directory override. When set, file tools resolve
    /// relative paths against this directory instead of the engine's default.
    pub workspace_override: Option<PathBuf>,
    /// Brief summary of the parent/delegating agent's context, passed down so
    /// child agents understand the broader task chain they belong to.
    pub parent_context: Option<String>,
    /// WebSocket event sender from the parent run. When set, delegated agents
    /// can forward their streaming events up to the frontend for live display.
    pub ws_event_tx: Option<mpsc::Sender<WsStreamEvent>>,
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
    broker: SharedSystemBroker,
}

impl ShellExecTool {
    pub fn new(timeout_secs: u64, broker: SharedSystemBroker) -> Self {
        Self {
            timeout_secs,
            broker,
        }
    }
}

#[async_trait]
impl Tool for ShellExecTool {
    fn name(&self) -> &str {
        "bash"
    }

    fn description(&self) -> &str {
        "Execute a bash command and return its output (exit status, stdout, stderr). \
         Use for shell operations, running tests, git commands, build tools, and system tasks."
    }

    fn parameters(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "command": {
                    "type": "string",
                    "description": "The bash command to execute"
                },
                "cwd": {
                    "type": "string",
                    "description": "Optional working directory for the command"
                }
            },
            "required": ["command"]
        })
    }

    async fn execute(&self, args: Value) -> Result<String> {
        // Accept "command" (canonical) or "cmd" (common LLM alias).
        let command = args
            .get("command")
            .or_else(|| args.get("cmd"))
            .and_then(Value::as_str)
            .ok_or_else(|| AppError::Validation("command is required".to_owned()))?;

        if references_sensitive_file(command) {
            return Err(AppError::Validation(
                "Access denied: bash commands may not reference credential files. \
                 Use the `secret_get` tool to obtain a secure token instead."
                    .to_owned(),
            ));
        }

        let cwd = args.get("cwd").and_then(Value::as_str).map(PathBuf::from);
        let context = current_tool_execution_context();

        let result = self
            .broker
            .execute_shell(ShellExecRequest {
                command: command.to_owned(),
                host_cwd: cwd,
                timeout_secs: self.timeout_secs,
                session_id: context.as_ref().and_then(|ctx| ctx.session_id.clone()),
                conversation_id: context.as_ref().and_then(|ctx| ctx.conversation_id.clone()),
                run_id: context.and_then(|ctx| ctx.run_id),
            })
            .await?;

        Ok(format!(
            "status: {}\ncwd: {}\nstdout:\n{}\nstderr:\n{}",
            result.exit_status,
            result.cwd.display(),
            result.stdout,
            result.stderr
        ))
    }
}

/// Returns `true` if the command appears to reference a credential file.
/// This is best-effort — it blocks naive attempts but is not exhaustive.
/// Agents should use `secret_get` to obtain tokens for credentials.
pub fn references_sensitive_file(command: &str) -> bool {
    let cmd = command.to_lowercase();
    let sensitive = ["credentials.toml", ".env"];
    sensitive.iter().any(|name| cmd.contains(name))
}

pub fn is_dangerous_command(command: &str) -> bool {
    let normalized = command.trim().to_ascii_lowercase();

    let patterns = [
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
        "rm -rf ",
        "rm -r ",
        "rm ",
    ];

    patterns.iter().any(|pattern| normalized.contains(pattern))
}

#[cfg(test)]
mod tests {
    use std::{
        path::PathBuf,
        sync::{Arc, Mutex},
    };

    use async_trait::async_trait;
    use serde_json::json;

    use rushdino_common::Result;

    use super::{is_dangerous_command, ToolExecutionContext};
    use crate::{
        system_broker::{
            InputRequest, InputRequestResult, ShellExecRequest, ShellExecResult, SystemBroker,
        },
        tool_registry::Tool,
    };

    #[derive(Default)]
    struct MockBroker {
        last_request: Mutex<Option<ShellExecRequest>>,
    }

    #[async_trait]
    impl SystemBroker for MockBroker {
        async fn execute_shell(&self, request: ShellExecRequest) -> Result<ShellExecResult> {
            *self
                .last_request
                .lock()
                .expect("mock broker mutex should not be poisoned") = Some(request);
            Ok(ShellExecResult {
                exit_status: "exit status: 0".to_owned(),
                stdout: "ok".to_owned(),
                stderr: String::new(),
                cwd: PathBuf::from("/tmp/host"),
                source_tag: rushdino_security::guardrail::types::SourceTag::LocalFile,
            })
        }

        async fn request_user_input(&self, _request: InputRequest) -> Result<InputRequestResult> {
            Ok(InputRequestResult::cancelled())
        }

        async fn resolve_secrets(&self, input: String) -> String {
            input
        }
    }

    #[tokio::test]
    async fn shell_exec_forwards_request_to_broker() {
        let broker = Arc::new(MockBroker::default());
        let tool = super::ShellExecTool::new(30, broker.clone());

        let output = super::with_tool_execution_context(
            ToolExecutionContext {
                session_id: Some("session-1".to_owned()),
                conversation_id: Some("conv-1".to_owned()),
                run_id: Some("run-1".to_owned()),
                delegation_depth: 0,
                workspace_override: None,
                parent_context: None,
                ws_event_tx: None,
            },
            tool.execute(json!({
                "command": "pwd",
                "cwd": "/tmp/example"
            })),
        )
        .await
        .expect("tool should succeed");

        let request = broker
            .last_request
            .lock()
            .expect("mock broker mutex should not be poisoned")
            .clone()
            .expect("broker should receive request");
        assert_eq!(request.command, "pwd");
        assert_eq!(request.host_cwd, Some(PathBuf::from("/tmp/example")));
        assert_eq!(request.session_id.as_deref(), Some("session-1"));
        assert_eq!(request.conversation_id.as_deref(), Some("conv-1"));
        assert_eq!(request.run_id.as_deref(), Some("run-1"));
        assert!(output.contains("cwd: /tmp/host"));
    }

    #[test]
    fn dangerous_command_detection_matches_expected_cases() {
        assert!(is_dangerous_command("rm -rf /tmp/foo"));
        assert!(is_dangerous_command("rm /tmp/foo"));
        assert!(is_dangerous_command("rm ~/.rushdino/SOUL.md"));
        assert!(is_dangerous_command("rm ~/.rushdino/BOOTSTRAP.md"));
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
            run_id: None,
            delegation_depth: 0,
            workspace_override: None,
            parent_context: None,
            ws_event_tx: None,
        };
        assert_eq!(ctx.delegation_depth, 0);
    }
}
