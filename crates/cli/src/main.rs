mod commands;
mod api_client;
mod service;

use clap::{Parser, Subcommand};

use rushdino_common::Result;

#[derive(Parser, Debug)]
#[command(name = "rushdino", about = "RushDino local AI agent platform")]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand, Debug)]
enum DashboardAction {
    IssueCode,
    Logout,
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
    Upgrade {
        #[arg(long, conflicts_with = "version")]
        beta: bool,
        #[arg(long)]
        version: Option<String>,
    },
    Downgrade {
        #[arg(long)]
        version: String,
    },
    Configure {
        #[arg(long)]
        login: Option<String>,
    },
    Dashboard {
        #[command(subcommand)]
        action: Option<DashboardAction>,
        #[arg(long)]
        no_open: bool,
    },
    Health,
    Doctor,
    Reset,
    Uninstall,
    Config,
    Message,
    Sessions(commands::sessions::SessionsArgs),
    Memory,
    Agent,
    Agents(commands::agents::AgentsArgs),
    Browser,
}

#[cfg(test)]
#[path = "main_tests.rs"]
mod tests;

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
        Command::Upgrade { beta, version } => commands::upgrade::run(beta, version).await,
        Command::Downgrade { version } => commands::downgrade::run(version).await,
        Command::Configure { login } => commands::configure::run(login).await,
        Command::Dashboard { action, no_open } => commands::dashboard::run(action, no_open).await,
        Command::Health => commands::health::run().await,
        Command::Doctor => commands::doctor::run().await,
        Command::Reset => commands::reset::run().await,
        Command::Uninstall => commands::uninstall::run().await,
        Command::Config => commands::config::run().await,
        Command::Message => commands::message::run().await,
        Command::Sessions(args) => commands::sessions::run(args).await,
        Command::Memory => commands::memory::run().await,
        Command::Agent => commands::agent::run().await,
        Command::Agents(args) => commands::agents::run(args).await,
        Command::Browser => commands::browser::run().await,
    }
}
