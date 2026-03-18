use tokio::{io::AsyncBufReadExt, process::Command, sync::mpsc};

use rushdino_common::{AppError, Result};

use crate::agent_registry::CodingAgentDescriptor;

/// Returns `true` if `binary` is found somewhere on `$PATH`.
pub fn check_binary_in_path(binary: &str) -> bool {
    std::process::Command::new("which")
        .arg(binary)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// Run the agent's install command, streaming each output line to `progress_tx`.
pub async fn install_with_progress(
    descriptor: &CodingAgentDescriptor,
    progress_tx: mpsc::Sender<String>,
) -> Result<()> {
    let parts: Vec<&str> = descriptor.install_command.split_whitespace().collect();
    if parts.is_empty() {
        return Err(AppError::Validation(format!(
            "invalid install command: {}",
            descriptor.install_command
        )));
    }
    let program = parts[0];
    let args = &parts[1..];

    let mut child = Command::new(program)
        .args(args)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| AppError::Agent(format!("failed to spawn installer for {}: {e}", descriptor.id)))?;

    // Stream stdout lines.
    if let Some(stdout) = child.stdout.take() {
        let tx = progress_tx.clone();
        tokio::spawn(async move {
            let mut lines = tokio::io::BufReader::new(stdout).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let _ = tx.send(line).await;
            }
        });
    }

    // Stream stderr lines.
    if let Some(stderr) = child.stderr.take() {
        tokio::spawn(async move {
            let mut lines = tokio::io::BufReader::new(stderr).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let _ = progress_tx.send(line).await;
            }
        });
    }

    let status = child
        .wait()
        .await
        .map_err(|e| AppError::Agent(format!("installer wait error: {e}")))?;

    if status.success() {
        Ok(())
    } else {
        Err(AppError::Agent(format!(
            "installer for {} exited with: {}",
            descriptor.id, status
        )))
    }
}
