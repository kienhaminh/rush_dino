use rushdino_common::{init, AppConfig, AppError, Result};

pub async fn run(foreground: bool) -> Result<()> {
    init::ensure_rushdino_dir()?;

    if foreground {
        println!("Running in foreground mode...");
        return rushdino_server::run_server().await;
    }

    let config = AppConfig::load_and_reconcile()?;
    let home = init::default_home_dir();
    let log_path = home.join("logs/rushdino.log");

    println!("\n🦕 Starting RushDino Gateway");
    println!("🌐 API Endpoint: http://{}:{}", config.host, config.port);
    println!("🧠 Provider: {:?}", config.active_provider);

    let binary =
        std::env::current_exe().map_err(|e| AppError::Agent(format!("cannot find binary: {e}")))?;

    let manager = crate::service::detect()?;
    manager.install_and_start(
        binary.to_str().unwrap_or("rushdino"),
        log_path.to_str().unwrap_or(""),
    )?;

    println!("\n🚀 RushDino started as system service!");
    println!("Web UI: http://{}:{}", config.host, config.port);
    println!("Log: {}", log_path.display());
    Ok(())
}
