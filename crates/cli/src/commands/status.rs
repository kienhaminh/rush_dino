use colored::Colorize;

use rushdino_common::{AppConfig, Result};

use crate::daemon;

pub async fn run() -> Result<()> {
    let Some(pid) = daemon::read_pid() else {
        println!("{}", "RushDino is not running".yellow());
        return Ok(());
    };

    if !daemon::is_running(pid) {
        println!("{}", "PID stale, process not alive".yellow());
        daemon::remove_pid()?;
        return Ok(());
    }

    let config = AppConfig::load()?;
    let url = format!("http://{}:{}/healthz", config.host, config.port);

    println!("{} {pid}", "Running PID:".green());
    if let Ok(res) = reqwest::get(url).await {
        if let Ok(health) = res.json::<serde_json::Value>().await {
            println!("status: {}", health["status"].as_str().unwrap_or("unknown"));
            println!("uptime_secs: {}", health["uptime_secs"]);
            println!("provider: {}", health["provider"]);
        }
    }

    Ok(())
}
