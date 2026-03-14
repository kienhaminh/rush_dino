mod commands;
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
    Upgrade,
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
    Sessions,
    Memory,
    Agent,
    Agents,
    Browser,
}

#[cfg(test)]
mod tests {
    use clap::Parser;

    use super::{Cli, Command, DashboardAction};

    #[test]
    fn dashboard_issue_code_subcommand_parses() {
        let cli = Cli::try_parse_from(["rushdino", "dashboard", "issue-code"])
            .expect("dashboard issue-code should parse");

        match cli.command {
            Command::Dashboard { action, no_open } => {
                assert!(matches!(action, Some(DashboardAction::IssueCode)));
                assert!(!no_open);
            }
            other => panic!("expected dashboard command, got {other:?}"),
        }
    }

    #[test]
    fn dashboard_no_open_still_parses_without_subcommand() {
        let cli = Cli::try_parse_from(["rushdino", "dashboard", "--no-open"])
            .expect("dashboard --no-open should parse");

        match cli.command {
            Command::Dashboard { action, no_open } => {
                assert!(action.is_none());
                assert!(no_open);
            }
            other => panic!("expected dashboard command, got {other:?}"),
        }
    }
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
        Command::Start { foreground } => {
            commands::start::run(foreground).await
        },
        Command::Stop => commands::stop::run().await,
        Command::Restart => {
            commands::stop::run().await?;
            commands::start::run(false).await
        }
        Command::Status => commands::status::run().await,
        Command::Upgrade => commands::upgrade::run().await,
        Command::Configure { login } => commands::configure::run(login).await,
        Command::Dashboard { action, no_open } => {
            commands::dashboard::run(action, no_open).await
        }
        Command::Health => commands::health::run().await,
        Command::Doctor => commands::doctor::run().await,
        Command::Reset => commands::reset::run().await,
        Command::Uninstall => commands::uninstall::run().await,
        Command::Config => commands::config::run().await,
        Command::Message => commands::message::run().await,
        Command::Sessions => commands::sessions::run().await,
        Command::Memory => commands::memory::run().await,
        Command::Agent => commands::agent::run().await,
        Command::Agents => commands::agents::run().await,
        Command::Browser => commands::browser::run().await,
    }
}
