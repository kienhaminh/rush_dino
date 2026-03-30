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

#[test]
fn sessions_list_parses() {
    let cli = Cli::try_parse_from(["rushdino", "sessions", "list"])
        .expect("sessions list should parse");
    assert!(matches!(cli.command, Command::Sessions(_)));
}

#[test]
fn sessions_list_json_flag_parses() {
    let cli = Cli::try_parse_from(["rushdino", "sessions", "list", "--json"])
        .expect("sessions list --json should parse");
    assert!(matches!(cli.command, Command::Sessions(_)));
}

#[test]
fn sessions_create_requires_title() {
    Cli::try_parse_from(["rushdino", "sessions", "create"])
        .expect_err("sessions create without --title should fail");
}

#[test]
fn sessions_create_parses_with_title() {
    let cli = Cli::try_parse_from(["rushdino", "sessions", "create", "--title", "My session"])
        .expect("sessions create --title should parse");
    assert!(matches!(cli.command, Command::Sessions(_)));
}

#[test]
fn sessions_message_requires_id_and_text() {
    Cli::try_parse_from(["rushdino", "sessions", "message"])
        .expect_err("sessions message without args should fail");
}

#[test]
fn sessions_message_parses() {
    let cli = Cli::try_parse_from(["rushdino", "sessions", "message", "abc123", "hello"])
        .expect("sessions message <id> <text> should parse");
    assert!(matches!(cli.command, Command::Sessions(_)));
}

#[test]
fn agents_list_parses() {
    let cli = Cli::try_parse_from(["rushdino", "agents", "list"])
        .expect("agents list should parse");
    assert!(matches!(cli.command, Command::Agents(_)));
}

#[test]
fn agents_list_json_flag_parses() {
    let cli = Cli::try_parse_from(["rushdino", "agents", "list", "--json"])
        .expect("agents list --json should parse");
    assert!(matches!(cli.command, Command::Agents(_)));
}

#[test]
fn agents_get_parses() {
    let cli = Cli::try_parse_from(["rushdino", "agents", "get", "agent-123"])
        .expect("agents get <id> should parse");
    assert!(matches!(cli.command, Command::Agents(_)));
}

#[test]
fn workflow_list_parses() {
    let cli = Cli::try_parse_from(["rushdino", "workflow", "list"])
        .expect("workflow list should parse");
    assert!(matches!(cli.command, Command::Workflow(_)));
}

#[test]
fn workflow_run_requires_id() {
    Cli::try_parse_from(["rushdino", "workflow", "run"])
        .expect_err("workflow run without id should fail");
}

#[test]
fn workflow_run_parses_with_id() {
    let cli = Cli::try_parse_from(["rushdino", "workflow", "run", "wf-abc"])
        .expect("workflow run <id> should parse");
    assert!(matches!(cli.command, Command::Workflow(_)));
}

#[test]
fn workflow_run_parses_with_input() {
    let cli = Cli::try_parse_from(["rushdino", "workflow", "run", "wf-abc", "--input", "hello"])
        .expect("workflow run --input should parse");
    assert!(matches!(cli.command, Command::Workflow(_)));
}

#[test]
fn kanban_board_parses() {
    let cli = Cli::try_parse_from(["rushdino", "kanban", "board"])
        .expect("kanban board should parse");
    assert!(matches!(cli.command, Command::Kanban(_)));
}

#[test]
fn kanban_list_parses() {
    let cli = Cli::try_parse_from(["rushdino", "kanban", "list"])
        .expect("kanban list should parse");
    assert!(matches!(cli.command, Command::Kanban(_)));
}

#[test]
fn kanban_list_with_filters_parses() {
    let cli = Cli::try_parse_from([
        "rushdino", "kanban", "list", "--status", "backlog", "--agent", "planner",
    ])
    .expect("kanban list with filters should parse");
    assert!(matches!(cli.command, Command::Kanban(_)));
}

#[test]
fn kanban_get_requires_id() {
    Cli::try_parse_from(["rushdino", "kanban", "get"])
        .expect_err("kanban get without id should fail");
}

#[test]
fn kanban_get_parses() {
    let cli = Cli::try_parse_from(["rushdino", "kanban", "get", "task-abc"])
        .expect("kanban get <id> should parse");
    assert!(matches!(cli.command, Command::Kanban(_)));
}

#[test]
fn approvals_list_parses() {
    let cli = Cli::try_parse_from(["rushdino", "approvals", "list"])
        .expect("approvals list should parse");
    assert!(matches!(cli.command, Command::Approvals(_)));
}

#[test]
fn approvals_approve_requires_session() {
    Cli::try_parse_from(["rushdino", "approvals", "approve", "req-1"])
        .expect_err("approvals approve without --session should fail");
}

#[test]
fn approvals_approve_parses() {
    let cli = Cli::try_parse_from([
        "rushdino", "approvals", "approve", "req-1", "--session", "sess-1",
    ])
    .expect("approvals approve with args should parse");
    assert!(matches!(cli.command, Command::Approvals(_)));
}

#[test]
fn approvals_deny_parses() {
    let cli = Cli::try_parse_from([
        "rushdino", "approvals", "deny", "req-1", "--session", "sess-1",
    ])
    .expect("approvals deny with args should parse");
    assert!(matches!(cli.command, Command::Approvals(_)));
}

#[test]
fn configure_openai_key_parses() {
    let cli = Cli::try_parse_from(["rushdino", "configure", "--openai-key", "sk-test"])
        .expect("configure --openai-key should parse");
    assert!(matches!(cli.command, Command::Configure(_)));
}

#[test]
fn configure_brave_api_key_parses() {
    let cli = Cli::try_parse_from(["rushdino", "configure", "--brave-api-key", "brave-test"])
        .expect("configure --brave-api-key should parse");
    assert!(matches!(cli.command, Command::Configure(_)));
}

#[test]
fn configure_multiple_keys_parses() {
    let cli = Cli::try_parse_from([
        "rushdino", "configure",
        "--openai-key", "sk-test",
        "--anthropic-key", "ant-test",
    ])
    .expect("configure with multiple flags should parse");
    assert!(matches!(cli.command, Command::Configure(_)));
}
