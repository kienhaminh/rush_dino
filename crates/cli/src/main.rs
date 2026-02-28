mod commands;
mod daemon;

use clap::{Parser, Subcommand};

use rushdino_common::Result;

#[derive(Parser, Debug)]
#[command(name = "rushdino", about = "RushDino local AI agent platform")]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand, Debug)]
enum Command {
    Init,
    Start {
        #[arg(short, long)]
        foreground: bool,
    },
    Stop,
    Restart,
    Status,
    Upgrade,
}

#[tokio::main]
async fn main() {
    if let Err(err) = run().await {
        eprintln!("rushdino error: {err}");
        std::process::exit(1);
    }
}

async fn run() -> Result<()> {
    let cli = Cli::parse();
    match cli.command {
        Command::Init => commands::init::run().await,
        Command::Start { foreground } => commands::start::run(foreground).await,
        Command::Stop => commands::stop::run().await,
        Command::Restart => {
            commands::stop::run().await?;
            commands::start::run(false).await
        }
        Command::Status => commands::status::run().await,
        Command::Upgrade => commands::upgrade::run().await,
    }
}
