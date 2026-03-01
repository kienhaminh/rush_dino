use std::{fs, path::PathBuf, process::Command};

use rushdino_common::{AppError, Result};

use super::ServiceManager;

const UNIT: &str = "rushdino";

pub struct SystemdManager;

impl SystemdManager {
    pub fn new() -> Self {
        Self
    }

    fn unit_path() -> PathBuf {
        dirs::config_dir()
            .unwrap_or_else(|| PathBuf::from(".config"))
            .join("systemd/user/rushdino.service")
    }

    fn unit_content(binary: &str, log: &str) -> String {
        let home = dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .to_string_lossy()
            .into_owned();
        format!(
            "[Unit]\n\
Description=RushDino AI Agent\n\
After=network.target\n\
\n\
[Service]\n\
Type=simple\n\
ExecStart={binary} start --foreground\n\
Restart=on-failure\n\
RestartSec=5\n\
StandardOutput=append:{log}\n\
StandardError=append:{log}\n\
WorkingDirectory={home}\n\
\n\
[Install]\n\
WantedBy=default.target\n"
        )
    }
}

impl ServiceManager for SystemdManager {
    fn is_running(&self) -> bool {
        Command::new("systemctl")
            .args(["--user", "is-active", UNIT])
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }

    fn install_and_start(&self, binary_path: &str, log_path: &str) -> Result<()> {
        // Always rewrite the unit file so the binary path stays current after rebuilds.
        let unit = Self::unit_path();
        if let Some(parent) = unit.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(&unit, Self::unit_content(binary_path, log_path))?;

        // Reload systemd unit files so the new content is picked up.
        Command::new("systemctl")
            .args(["--user", "daemon-reload"])
            .status()
            .map_err(|e| AppError::Agent(format!("systemctl daemon-reload failed: {e}")))?;

        // Stop any running instance so we always start fresh with the current binary.
        if self.is_running() {
            let _ = Command::new("systemctl")
                .args(["--user", "stop", UNIT])
                .status();
        }

        let status = Command::new("systemctl")
            .args(["--user", "enable", "--now", UNIT])
            .status()
            .map_err(|e| AppError::Agent(format!("systemctl enable failed: {e}")))?;

        if !status.success() {
            return Err(AppError::Agent(format!(
                "systemctl enable --now exited with status {status}"
            )));
        }

        Ok(())
    }

    fn stop(&self) -> Result<()> {
        let status = Command::new("systemctl")
            .args(["--user", "stop", UNIT])
            .status()
            .map_err(|e| AppError::Agent(format!("systemctl stop failed: {e}")))?;

        if !status.success() {
            return Err(AppError::Agent(format!(
                "systemctl stop exited with status {status}"
            )));
        }

        Ok(())
    }

    fn status_line(&self) -> String {
        Command::new("systemctl")
            .args(["--user", "status", UNIT])
            .output()
            .map(|o| {
                String::from_utf8_lossy(&o.stdout)
                    .lines()
                    .take(5)
                    .collect::<Vec<_>>()
                    .join("\n")
            })
            .unwrap_or_default()
    }
}
