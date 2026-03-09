use colored::Colorize;
use rushdino_common::{init, Result};

pub async fn run() -> Result<()> {
    println!(
        "\n{} {}",
        "🦕".bold(),
        "Initializing RushDino".blue().bold()
    );
    println!("{}", "========================================".dimmed());

    println!("{}", "System Check...".blue().bold());
    let home = init::ensure_rushdino_dir()?;
    println!("{} Created directories at {}", "✔".green(), home.display());

    println!("\n{}", "========================================".dimmed());
    println!(
        "{} {}",
        "🚀".bold(),
        "RushDino successfully initialized!".green().bold()
    );
    println!(
        "{} Location: {}",
        "📂".bold(),
        home.display().to_string().blue()
    );
    println!("\n{}", "Next steps:".bold());
    println!("  Run {} to start the daemon.", "rushdino start".yellow());
    Ok(())
}
