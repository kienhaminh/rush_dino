#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info".into()),
        )
        .init();

    if let Err(err) = rushdino_server::run_server().await {
        eprintln!("rushdino-server error: {err}");
        std::process::exit(1);
    }
}
