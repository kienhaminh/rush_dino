use colored::Colorize;
use rushdino_common::Result;

pub async fn run() -> Result<()> {
    println!("{} {}", "💬".bold(), "Messaging CLI".blue().bold());
    println!("{}", "========================================".dimmed());
    println!("{} {}", "i".yellow(), "Command not yet implemented. Will push messages to channels.");
    Ok(())
}
