use std::time::Duration;

use async_trait::async_trait;
use serde_json::{json, Value};
use tokio::process::Command;

use rushdino_common::{AppError, Result};

use crate::tool_registry::Tool;

pub struct ShellExecTool {
    timeout_secs: u64,
}

impl ShellExecTool {
    pub fn new(timeout_secs: u64) -> Self {
        Self { timeout_secs }
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
