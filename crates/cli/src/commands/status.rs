use colored::Colorize;

use rushdino_common::{AppConfig, Result};

pub async fn run() -> Result<()> {
    let manager = crate::service::detect()?;

    if !manager.is_running() {
        println!("{}", "RushDino is not running".yellow());
        return Ok(());
    }

    println!("{}", manager.status_line());

    let config = AppConfig::load()?;
    let url = format!("http://{}:{}/healthz", config.host, config.port);
    if let Ok(res) = reqwest::get(url).await {
        if let Ok(health) = res.json::<serde_json::Value>().await {
            println!("status: {}", health["status"].as_str().unwrap_or("unknown"));
            println!("uptime_secs: {}", health["uptime_secs"]);
            println!("provider: {}", health["provider"]);
        }
    }
    Ok(())
}
