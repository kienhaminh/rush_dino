use std::{fs::File, process};

use colored::Colorize;
use daemonize::Daemonize;

use rushdino_common::{init, Result};

use crate::daemon;

pub async fn run(foreground: bool) -> Result<()> {
    init::ensure_rushdino_dir()?;

    if let Some(pid) = daemon::read_pid() {
        if daemon::is_running(pid) {
            println!("{} {pid}", "Already running with PID:".yellow());
            return Ok(());
        }
        daemon::remove_pid()?;
    }

    if foreground {
        println!("{}", "Starting in foreground".green());
        return rushdino_server::run_server().await;
    }

    let home = init::default_home_dir();
    let log_path = home.join("logs/rushdino.log");
    let stdout = File::create(&log_path)?;
    let stderr = stdout.try_clone()?;

    let daemonize = Daemonize::new()
        .pid_file(daemon::pid_file_path())
        .working_directory(&home)
        .stdout(stdout)
        .stderr(stderr);

    daemonize
        .start()
        .map_err(|e| rushdino_common::AppError::Agent(format!("daemonize failed: {e}")))?;

    let pid = process::id();
    println!("{} {pid}", "Started RushDino. PID:".green());
    rushdino_server::run_server().await
}
