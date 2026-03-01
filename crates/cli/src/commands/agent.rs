use colored::Colorize;
use rushdino_common::Result;

pub async fn run() -> Result<()> {
    println!("{} {}", "⚡".bold(), "Agent CLI".blue().bold());
    println!("{}", "========================================".dimmed());
    println!("{} {}", "i".yellow(), "Command not yet implemented. Will run one agent turn via the Gateway.");
    Ok(())
}
