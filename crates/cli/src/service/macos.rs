use std::{fs, path::PathBuf, process::Command};

use rushdino_common::{AppError, Result};

use super::ServiceManager;

const LABEL: &str = "com.rushdino.agent";

pub struct LaunchdManager;

impl LaunchdManager {
    pub fn new() -> Self {
        Self
    }

    fn plist_path() -> PathBuf {
        dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("Library/LaunchAgents/com.rushdino.agent.plist")
    }

    fn plist_content(binary: &str, log: &str) -> String {
        let home = dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .to_string_lossy()
            .into_owned();
        format!(
            r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>{LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>{binary}</string>
    <string>start</string>
    <string>--foreground</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>{log}</string>
  <key>StandardErrorPath</key>
  <string>{log}</string>
  <key>WorkingDirectory</key>
  <string>{home}</string>
</dict>
</plist>
"#
        )
    }
}

impl ServiceManager for LaunchdManager {
    fn is_running(&self) -> bool {
        Command::new("launchctl")
            .args(["list", LABEL])
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }

    fn install_and_start(&self, binary_path: &str, log_path: &str) -> Result<()> {
        let plist = Self::plist_path();

        if let Some(parent) = plist.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(&plist, Self::plist_content(binary_path, log_path))?;

        if self.is_running() {
            let _ = Command::new("launchctl")
                .args(["unload", plist.to_str().unwrap_or("")])
                .status();
        }

        let status = Command::new("launchctl")
            .args(["load", "-w", plist.to_str().unwrap_or("")])
            .status()
            .map_err(|e| AppError::Agent(format!("launchctl load failed: {e}")))?;

        if !status.success() {
            return Err(AppError::Agent(format!(
                "launchctl load exited with status {status}"
            )));
        }

        Ok(())
    }

    fn stop(&self) -> Result<()> {
        let plist = Self::plist_path();

        if !plist.exists() {
            let _ = Command::new("launchctl").args(["remove", LABEL]).status();
            return Ok(());
        }

        let status = Command::new("launchctl")
            .args(["unload", plist.to_str().unwrap_or("")])
            .status()
            .map_err(|e| AppError::Agent(format!("launchctl unload failed: {e}")))?;

        if !status.success() {
            return Err(AppError::Agent(format!(
                "launchctl unload exited with status {status}"
            )));
        }

        Ok(())
    }

    fn status_line(&self) -> String {
        Command::new("launchctl")
            .args(["list", LABEL])
            .output()
            .map(|o| String::from_utf8_lossy(&o.stdout).into_owned())
            .unwrap_or_default()
    }
}
