use colored::Colorize;

use rushdino_common::Result;

pub async fn run() -> Result<()> {
    println!(
        "{}",
        "Upgrade automation not configured yet. Use release artifacts from GitHub.".yellow()
    );
    Ok(())
}
