use colored::Colorize;
use rushdino_common::Result;

pub async fn run() -> Result<()> {
    println!("{} {}", "🌍".bold(), "Browser Control".blue().bold());
    println!("{}", "========================================".dimmed());
    println!(
        "{} {}",
        "i".yellow(),
        "Browser control is planned as a UI-first operator surface. Use CLI only if the web control UI is unavailable and you need recovery access."
    );
    Ok(())
}
