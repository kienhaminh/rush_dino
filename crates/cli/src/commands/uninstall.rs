use std::fs;

use colored::Colorize;

use rushdino_common::{init, Result};

pub async fn run() -> Result<()> {
    println!("{} {}", "🗑️".bold(), "Uninstalling RushDino Data".red().bold());
    println!("{}", "========================================".dimmed());
    let home = init::default_home_dir();

    if home.exists() {
        if let Err(e) = fs::remove_dir_all(&home) {
            println!("{} Failed to uninstall: {e}", "✖".red());
        } else {
            println!("{} Successfully purged local state at {}", "✔".green(), home.display());
            println!("{} Note: CLI binary remains. To fully remove, delete the executable from your PATH.", "i".yellow());
        }
    } else {
        println!("{} Nothing to uninstall. Directory {} does not exist.", "i".yellow(), home.display());
    }

    Ok(())
}
