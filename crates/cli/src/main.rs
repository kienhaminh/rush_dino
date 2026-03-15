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

    #[test]
    fn upgrade_subcommand_parses_with_defaults() {
        let cli = Cli::try_parse_from(["rushdino", "upgrade"]).expect("upgrade should parse");

        match cli.command {
            Command::Upgrade { beta, version } => {
                assert!(!beta);
                assert!(version.is_none());
            }
            other => panic!("expected upgrade command, got {other:?}"),
        }
    }

    #[test]
    fn upgrade_subcommand_parses_beta_flag() {
        let cli = Cli::try_parse_from(["rushdino", "upgrade", "--beta"])
            .expect("upgrade --beta should parse");

        match cli.command {
            Command::Upgrade { beta, version } => {
                assert!(beta);
                assert!(version.is_none());
            }
            other => panic!("expected upgrade command, got {other:?}"),
        }
    }

    #[test]
    fn upgrade_subcommand_parses_version_flag() {
        let cli = Cli::try_parse_from(["rushdino", "upgrade", "--version", "1.2.3"])
            .expect("upgrade --version should parse");

        match cli.command {
            Command::Upgrade { beta, version } => {
                assert!(!beta);
                assert_eq!(version.as_deref(), Some("1.2.3"));
            }
            other => panic!("expected upgrade command, got {other:?}"),
        }
    }

    #[test]
    fn upgrade_subcommand_rejects_beta_and_version_together() {
        let err = Cli::try_parse_from(["rushdino", "upgrade", "--beta", "--version", "1.2.3"])
            .expect_err("upgrade should reject --beta with --version");

        let rendered = err.to_string();
        assert!(rendered.contains("--beta"));
        assert!(rendered.contains("--version"));
    }

    #[test]
    fn downgrade_subcommand_requires_version_flag() {
        let err = Cli::try_parse_from(["rushdino", "downgrade"])
            .expect_err("downgrade should need version");

        assert!(err.to_string().contains("--version"));
    }

    #[test]
    fn downgrade_subcommand_parses_version_flag() {
        let cli = Cli::try_parse_from(["rushdino", "downgrade", "--version", "v1.2.3"])
            .expect("downgrade --version should parse");

        match cli.command {
            Command::Downgrade { version } => assert_eq!(version, "v1.2.3"),
            other => panic!("expected downgrade command, got {other:?}"),
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
        Command::Sessions => commands::sessions::run().await,
        Command::Memory => commands::memory::run().await,
        Command::Agent => commands::agent::run().await,
        Command::Agents => commands::agents::run().await,
        Command::Browser => commands::browser::run().await,
    }
}
