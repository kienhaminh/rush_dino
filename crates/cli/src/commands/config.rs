use colored::Colorize;
use rushdino_common::Result;

pub async fn run() -> Result<()> {
    println!("{} {}", "📝".bold(), "Configuration Manager".blue().bold());
    println!("{}", "========================================".dimmed());
    println!("{} {}", "i".yellow(), "Command not yet implemented. Will allow getting/setting config keys.");
    Ok(())
}
