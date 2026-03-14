use colored::Colorize;
use open;

use rushdino_common::{dashboard_auth::DashboardAuthService, db, init, AppConfig, AppError, Result};

use crate::DashboardAction;

pub async fn run(action: Option<DashboardAction>, no_open: bool) -> Result<()> {
    let config = AppConfig::load()?;

    match action {
        Some(DashboardAction::IssueCode) => issue_code(&config).await,
        Some(DashboardAction::Logout) => logout(&config).await,
        None => open_dashboard(&config, no_open).await,
    }
}

async fn open_dashboard(config: &AppConfig, no_open: bool) -> Result<()> {
    let dashboard_url = format!("http://{}:{}", config.host, config.port);

    println!("{} {}", "Dashboard URL:".bold(), dashboard_url.blue());

    if !no_open {
        println!("{} Opening in your browser...", "⏳".yellow());
        match open::that(&dashboard_url) {
            Ok(_) => {
                println!(
                    "{} Opened in your browser. Keep that tab to control RushDino.",
                    "✔".green()
                );
            }
            Err(e) => {
                println!("{} Could not open browser automatically: {e}", "✖".red());
                println!("{} Use the URL above.", "i".yellow());
            }
        }
    } else {
        println!(
            "{} Browser launch disabled (--no-open). Use the URL above.",
            "i".yellow()
        );
    }

    Ok(())
}

async fn issue_code(config: &AppConfig) -> Result<()> {
    if !config.security.dashboard_auth_enabled {
        return Err(AppError::Validation(
            "dashboard auth is disabled in config.toml".to_owned(),
        ));
    }

    let home = init::ensure_rushdino_dir()?;
    let pool = db::init_pool(&config.db_path).await?;
    let auth = DashboardAuthService::new(pool);
    let issued = auth.issue_code().await?;

    println!("{} {}", "Login code:".bold(), issued.code.blue().bold());
    println!("{} {}", "Expires:".bold(), issued.expires_at);
    println!(
        "{} {}",
        "Local URL:".bold(),
        format!("http://127.0.0.1:{}/login", config.port).blue()
    );
    println!(
        "{} Run your SSH tunnel, open the local URL, and enter the code above.",
        "i".yellow()
    );
    println!("{} Auth state stored in {}", "i".yellow(), home.display());

    Ok(())
}

async fn logout(config: &AppConfig) -> Result<()> {
    if !config.security.dashboard_auth_enabled {
        return Err(AppError::Validation(
            "dashboard auth is disabled in config.toml".to_owned(),
        ));
    }

    let pool = db::init_pool(&config.db_path).await?;
    let auth = DashboardAuthService::new(pool);
    auth.revoke_active_sessions().await?;
    println!("{} Revoked the active dashboard session.", "✔".green());
    Ok(())
}
