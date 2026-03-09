use colored::Colorize;
use rushdino_common::Result;

pub async fn run() -> Result<()> {
    println!("{} {}", "💬".bold(), "Messaging CLI".blue().bold());
    println!("{}", "========================================".dimmed());
    println!(
        "{} {}",
        "i".yellow(),
        "Messaging and channel operations are intended to run through the web control UI. Keep CLI for bootstrap, diagnostics, and emergency repair."
    );
    Ok(())
}
