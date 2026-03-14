use colored::Colorize;
use rushdino_common::Result;

pub async fn run() -> Result<()> {
    println!("{} {}", "🕒".bold(), "Sessions Manager".blue().bold());
    println!("{}", "========================================".dimmed());
    println!(
        "{} Session management is UI-first. Use the web control UI for normal session review and reserve CLI for hard recovery.",
        "i".yellow()
    );
    Ok(())
}
