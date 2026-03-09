use colored::Colorize;
use rushdino_common::Result;

pub async fn run() -> Result<()> {
    println!("{} {}", "📝".bold(), "Configuration Manager".blue().bold());
    println!("{}", "========================================".dimmed());
    println!(
        "{} {}",
        "i".yellow(),
        "Config editing is UI-first. Use the web control UI for routine changes; use CLI when the UI cannot start or a recovery edit is required."
    );
    Ok(())
}
