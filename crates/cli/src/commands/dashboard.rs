use colored::Colorize;
use open;

use rushdino_common::{AppConfig, Result};

pub async fn run(no_open: bool) -> Result<()> {
    let config = AppConfig::load()?;
    let dashboard_url = format!("http://{}:{}", config.host, config.port);

    println!("{} {}", "Dashboard URL:".bold(), dashboard_url.blue());

    if !no_open {
        println!("{} Opening in your browser...", "⏳".yellow());
        match open::that(&dashboard_url) {
            Ok(_) => {
                println!(
                    "{} Opened in your browser. Keep that tab to control RushDino.",
                    "✔".green()
                );
            }
            Err(e) => {
                println!("{} Could not open browser automatically: {e}", "✖".red());
                println!("{} Use the URL above.", "i".yellow());
            }
        }
    } else {
        println!(
            "{} Browser launch disabled (--no-open). Use the URL above.",
            "i".yellow()
        );
    }

    Ok(())
}
