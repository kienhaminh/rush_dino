use colored::Colorize;
use rushdino_common::Result;

pub async fn run() -> Result<()> {
    println!("{} {}", "⚡".bold(), "Agent CLI".blue().bold());
    println!("{}", "========================================".dimmed());
    println!(
        "{} Daily agent management is UI-first. Use the web control UI for agent work; keep CLI for bootstrap and recovery.",
        "i".yellow()
    );
    Ok(())
}
