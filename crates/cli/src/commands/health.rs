use colored::Colorize;
use reqwest::Client;
use serde_json::Value;

use rushdino_common::{AppConfig, AppError, Result};

pub async fn run() -> Result<()> {
    let manager = crate::service::detect()?;

    if !manager.is_running() {
        println!("{} {}", "✖".red(), "Gateway is not running.".bold());
        return Ok(());
    }

    println!(
        "{} Fetching health from the running gateway...",
        "⏳".yellow()
    );

    let config = AppConfig::load()?;
    let url = format!("http://{}:{}/healthz", config.host, config.port);

    let client = Client::new();
    let res = client.get(&url).send().await;

    match res {
        Ok(response) => {
            if response.status().is_success() {
                let body: Value = response.json().await.unwrap_or_default();
                println!("\n{} {}", "✔".green(), "Gateway is healthy!".bold().green());
                println!("  {} {}", "Uptime (secs):".bold(), body["uptime_secs"]);
                println!(
                    "  {} {}",
                    "Provider:".bold(),
                    body["provider"].as_str().unwrap_or("Unknown").blue()
                );
            } else {
                println!(
                    "{} {} {}",
                    "✖".red(),
                    "Gateway returned error status:".bold(),
                    response.status()
                );
            }
        }
        Err(e) => {
            println!("{} {} {}", "✖".red(), "Failed to reach gateway:".bold(), e);
            return Err(AppError::Agent(format!("Gateway health check failed: {e}")));
        }
    }

    Ok(())
}
