use colored::Colorize;
use rushdino_common::Result;

pub async fn run() -> Result<()> {
    println!("{} {}", "🤖".bold(), "Agents Manager".blue().bold());
    println!("{}", "========================================".dimmed());
    println!(
        "{} {}",
        "i".yellow(),
        "Agent administration now belongs in the web control UI. Use CLI only when the UI is unavailable and you need recovery access."
    );
    Ok(())
}
