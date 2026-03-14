use colored::Colorize;
use rushdino_common::{asset_sync, init, Result};

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

    // Download bundled agent templates and skill files from GitHub.
    println!("{}", "Syncing bundled assets...".blue().bold());
    match asset_sync::seed_bundled_assets(&home).await {
        Ok(()) => println!("{} Bundled agents and skills synced", "✔".green()),
        Err(e) => println!(
            "{} Asset sync failed (you can retry by running `rushdino init` again): {e}",
            "⚠".yellow()
        ),
    }

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
