use colored::Colorize;
use rushdino_common::Result;

pub async fn run() -> Result<()> {
    println!("{} {}", "🤖".bold(), "Agents Manager".blue().bold());
    println!("{}", "========================================".dimmed());
    println!("{} {}", "i".yellow(), "Command not yet implemented. Will list and manage background agents.");
    Ok(())
}
