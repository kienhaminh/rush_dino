use std::{fs, path::PathBuf};

use nix::{sys::signal, unistd::Pid};

use rushdino_common::{init, Result};

pub fn pid_file_path() -> PathBuf {
    init::default_home_dir().join("rushdino.pid")
}

pub fn read_pid() -> Option<u32> {
    let path = pid_file_path();
    let raw = fs::read_to_string(path).ok()?;
    raw.trim().parse::<u32>().ok()
}

pub fn is_running(pid: u32) -> bool {
    signal::kill(Pid::from_raw(pid as i32), None).is_ok()
}

pub fn remove_pid() -> Result<()> {
    let path = pid_file_path();
    if path.exists() {
        fs::remove_file(path)?;
    }
    Ok(())
}

pub fn send_signal(pid: u32, sig: signal::Signal) -> Result<()> {
    signal::kill(Pid::from_raw(pid as i32), Some(sig))
        .map_err(|e| rushdino_common::AppError::Agent(format!("failed to send signal: {e}")))
}
