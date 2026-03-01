use std::fs;

use colored::Colorize;

use rushdino_common::{init, Result};

pub async fn run() -> Result<()> {
    println!("{} {}", "⚠️".bold(), "Resetting RushDino state".red().bold());
    println!("{}", "========================================".dimmed());
    let home = init::default_home_dir();

    if home.exists() {
        if let Err(e) = fs::remove_dir_all(&home) {
            println!("{} Failed to reset: {e}", "✖".red());
        } else {
            println!("{} Successfully removed local state at {}", "✔".green(), home.display());
            println!("{} Run `rushdino init` to reinstall configurations", "i".yellow());
        }
    } else {
        println!("{} Nothing to reset. Directory {} does not exist.", "i".yellow(), home.display());
    }

    Ok(())
}
