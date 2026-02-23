use std::time::Duration;

use colored::Colorize;
use nix::sys::signal::Signal;

use rushdino_common::Result;

use crate::daemon;

pub async fn run() -> Result<()> {
    let Some(pid) = daemon::read_pid() else {
        println!("{}", "RushDino is not running".yellow());
        return Ok(());
    };

    daemon::send_signal(pid, Signal::SIGTERM)?;
    for _ in 0..25 {
        if !daemon::is_running(pid) {
            daemon::remove_pid()?;
            println!("{}", "Stopped RushDino".green());
            return Ok(());
        }
        tokio::time::sleep(Duration::from_millis(200)).await;
    }

    daemon::send_signal(pid, Signal::SIGKILL)?;
    daemon::remove_pid()?;
    println!("{}", "Force stopped RushDino".yellow());
    Ok(())
}
