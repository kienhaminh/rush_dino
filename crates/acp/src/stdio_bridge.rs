use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
    process::{Child, ChildStdin, ChildStdout},
    sync::Mutex,
};

use rushdino_common::{AppError, Result};

use crate::protocol::types::AcpStdioEvent;

/// Wraps a coding-agent child process, providing async send/receive over
/// newline-delimited JSON on stdin/stdout.
pub struct AcpStdioBridge {
    stdin: Mutex<ChildStdin>,
    stdout: Mutex<BufReader<ChildStdout>>,
    child: Mutex<Child>,
}

impl AcpStdioBridge {
    /// Construct from an already-spawned child. Stdin and stdout must be piped.
    pub fn new(mut child: Child) -> Result<Self> {
        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| AppError::Agent("child stdin not available".to_owned()))?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| AppError::Agent("child stdout not available".to_owned()))?;
        Ok(Self {
            stdin: Mutex::new(stdin),
            stdout: Mutex::new(BufReader::new(stdout)),
            child: Mutex::new(child),
        })
    }

    /// Kill the child process. Called when the ACP session is cancelled.
    pub async fn kill(&self) {
        let mut child = self.child.lock().await;
        let _ = child.kill().await;
    }

    /// Serialize `request` as JSON and write a newline-terminated line to stdin.
    pub async fn send_request<T: serde::Serialize>(&self, request: &T) -> Result<()> {
        let mut line = serde_json::to_string(request)
            .map_err(|e| AppError::Agent(format!("acp serialize error: {e}")))?;
        line.push('\n');
        let mut stdin = self.stdin.lock().await;
        stdin
            .write_all(line.as_bytes())
            .await
            .map_err(|e| AppError::Agent(format!("acp stdin write error: {e}")))?;
        stdin
            .flush()
            .await
            .map_err(|e| AppError::Agent(format!("acp stdin flush error: {e}")))?;
        Ok(())
    }

    /// Read the next newline-delimited JSON event from stdout.
    /// Returns `None` when the child process closes its stdout (EOF).
    pub async fn next_event(&self) -> Result<Option<AcpStdioEvent>> {
        let mut line = String::new();
        let bytes_read = self
            .stdout
            .lock()
            .await
            .read_line(&mut line)
            .await
            .map_err(|e| AppError::Agent(format!("acp stdout read error: {e}")))?;
        if bytes_read == 0 {
            return Ok(None);
        }
        let trimmed = line.trim();
        if trimmed.is_empty() {
            return Ok(None);
        }
        let event = serde_json::from_str::<AcpStdioEvent>(trimmed).map_err(|e| {
            AppError::Agent(format!(
                "acp parse event error: {e} (line: {trimmed})"
            ))
        })?;
        Ok(Some(event))
    }
}
