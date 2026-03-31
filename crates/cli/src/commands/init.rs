use colored::Colorize;
use rushdino_common::{asset_sync, init, Result};

fn install_agent_cli_skill(data_dir: &std::path::Path) -> rushdino_common::Result<()> {
    let skill_dir = data_dir.join("skills").join("agent-cli");
    std::fs::create_dir_all(&skill_dir)?;
    let dest = skill_dir.join("SKILL.md");
    if !dest.exists() {
        let content = include_str!("../../../agent/src/skills/agent-cli/SKILL.md");
        std::fs::write(&dest, content)?;
    }
    Ok(())
}

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

    install_agent_cli_skill(&home)?;

    // Sync bundled agent templates and skill files from GitHub.
    // Uses version + hash manifest to detect updates and preserve user modifications.
    println!("{}", "Syncing bundled assets...".blue().bold());
    match asset_sync::sync_bundled_assets(&home).await {
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
