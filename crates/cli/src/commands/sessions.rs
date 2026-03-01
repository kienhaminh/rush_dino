use colored::Colorize;
use rushdino_common::Result;

pub async fn run() -> Result<()> {
    println!("{} {}", "🕒".bold(), "Sessions Manager".blue().bold());
    println!("{}", "========================================".dimmed());
    println!("{} {}", "i".yellow(), "Command not yet implemented. Will list or delete conversation sessions.");
    Ok(())
}
