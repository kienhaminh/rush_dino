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
