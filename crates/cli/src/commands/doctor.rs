use colored::Colorize;

use rushdino_common::{init, Result};

pub async fn run() -> Result<()> {
    println!("{} {}", "🩺".bold(), "RushDino Doctor".blue().bold());
    println!("{}", "========================================".dimmed());
    println!(
        "{} {}",
        "i".yellow(),
        "Command not fully implemented. Validating paths..."
    );

    let home = init::default_home_dir();
    let is_ok = home.exists();
    if is_ok {
        println!(
            "{} Data Directory exists at {}",
            "✔".green(),
            home.display()
        );
    } else {
        println!(
            "{} Data Directory is missing at {}",
            "✖".red(),
            home.display()
        );
    }

    Ok(())
}
