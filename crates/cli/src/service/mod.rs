use rushdino_common::Result;

/// Abstracts OS-native service lifecycle (launchd on macOS, systemd on Linux).
pub trait ServiceManager {
    fn is_running(&self) -> bool;
    /// Write service file if missing and start/load the service.
    fn install_and_start(&self, binary_path: &str, log_path: &str) -> Result<()>;
    /// Stop the service (leave service file intact).
    fn stop(&self) -> Result<()>;
    /// Human-readable status line from the OS service manager.
    fn status_line(&self) -> String;
}

/// Detect the current OS and return the appropriate ServiceManager.
pub fn detect() -> Result<Box<dyn ServiceManager>> {
    #[cfg(target_os = "macos")]
    return Ok(Box::new(macos::LaunchdManager::new()));
    #[cfg(target_os = "linux")]
    return Ok(Box::new(linux::SystemdManager::new()));
    #[cfg(not(any(target_os = "macos", target_os = "linux")))]
    return Err(rushdino_common::AppError::Agent(
        "system service not supported on this OS; use --foreground".into(),
    ));
}

#[cfg(target_os = "linux")]
pub mod linux;
#[cfg(target_os = "macos")]
pub mod macos;
