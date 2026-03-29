use super::*;
use std::path::PathBuf;

use crate::policy::types::{
    AccessMode, DefaultAction, FilesystemPolicy, InferencePolicy, NetworkPolicy, PathRule,
    ProcessPolicy, SandboxConfig, SandboxPolicy,
};

/// Build a minimal `SandboxPolicy` for testing.
fn make_policy(
    fs_default: DefaultAction,
    allow: Vec<PathRule>,
    deny: Vec<PathBuf>,
    deny_commands: Vec<String>,
    allow_privileged: bool,
) -> SandboxPolicy {
    SandboxPolicy {
        version: "1".to_string(),
        sandbox: SandboxConfig {
            filesystem: FilesystemPolicy {
                default: fs_default,
                allow,
                deny,
            },
            process: ProcessPolicy {
                allow_privileged,
                deny_commands,
                ..Default::default()
            },
            network: NetworkPolicy::default(),
            inference: InferencePolicy::default(),
        },
        providers: vec![],
    }
}

// -----------------------------------------------------------------------
// SBPL generation tests
// -----------------------------------------------------------------------

#[test]
fn sbpl_deny_default_emits_base_allows() {
    let policy = make_policy(
        DefaultAction::Deny,
        vec![],
        vec![],
        vec![],
        false,
    );
    let sbpl = generate_sbpl(&policy, "test-session");
    assert!(sbpl.contains("(deny default)"), "must contain deny default");
    assert!(sbpl.contains("(allow process*)"), "must allow process*");
    assert!(sbpl.contains("(allow file-read*)"), "must allow file-read*");
}

#[test]
fn sbpl_includes_deny_rules_for_ssh_directory() {
    let ssh_path = PathBuf::from("/Users/testuser/.ssh");
    let policy = make_policy(
        DefaultAction::Deny,
        vec![],
        vec![ssh_path.clone()],
        vec![],
        false,
    );
    let sbpl = generate_sbpl(&policy, "sess-001");
    assert!(
        sbpl.contains("(deny file-read* (subpath \"/Users/testuser/.ssh\"))"),
        "must explicitly deny reads of ~/.ssh"
    );
    assert!(
        sbpl.contains("(deny file-write* (subpath \"/Users/testuser/.ssh\"))"),
        "must explicitly deny writes of ~/.ssh"
    );
}

#[test]
fn sbpl_includes_read_write_for_documents_directory() {
    let docs_path = PathBuf::from("/Users/testuser/documents");
    let policy = make_policy(
        DefaultAction::Deny,
        vec![PathRule {
            path: docs_path.clone(),
            mode: AccessMode::ReadWrite,
        }],
        vec![],
        vec![],
        false,
    );
    let sbpl = generate_sbpl(&policy, "sess-002");
    assert!(
        sbpl.contains("(allow file-read* (subpath \"/Users/testuser/documents\"))"),
        "must allow reads of ~/documents"
    );
    assert!(
        sbpl.contains("(allow file-write* (subpath \"/Users/testuser/documents\"))"),
        "must allow writes of ~/documents"
    );
}

#[test]
fn sbpl_readonly_rule_does_not_emit_write_allow() {
    let ro_path = PathBuf::from("/usr/local/share");
    let policy = make_policy(
        DefaultAction::Deny,
        vec![PathRule {
            path: ro_path.clone(),
            mode: AccessMode::ReadOnly,
        }],
        vec![],
        vec![],
        false,
    );
    let sbpl = generate_sbpl(&policy, "sess-003");
    assert!(
        sbpl.contains("(allow file-read* (subpath \"/usr/local/share\"))"),
        "must allow reads"
    );
    assert!(
        !sbpl.contains("(allow file-write* (subpath \"/usr/local/share\"))"),
        "must NOT allow writes for read-only rule"
    );
}

#[test]
fn sbpl_denies_privileged_escalation_when_not_allowed() {
    let policy = make_policy(DefaultAction::Deny, vec![], vec![], vec![], false);
    let sbpl = generate_sbpl(&policy, "sess-004");
    assert!(
        sbpl.contains("(deny process-exec (with no-sandbox))"),
        "must block unsandboxed exec when allow_privileged is false"
    );
}

#[test]
fn sbpl_omits_privilege_escalation_denial_when_allowed() {
    let policy = make_policy(DefaultAction::Deny, vec![], vec![], vec![], true);
    let sbpl = generate_sbpl(&policy, "sess-005");
    assert!(
        !sbpl.contains("(deny process-exec (with no-sandbox))"),
        "must NOT block unsandboxed exec when allow_privileged is true"
    );
}

#[test]
fn sbpl_always_ends_with_signal_and_sysctl() {
    let policy = make_policy(DefaultAction::Deny, vec![], vec![], vec![], false);
    let sbpl = generate_sbpl(&policy, "sess-006");
    assert!(sbpl.contains("(allow signal)"), "must allow signal");
    assert!(sbpl.contains("(allow sysctl-read)"), "must allow sysctl-read");
}

// -----------------------------------------------------------------------
// is_command_denied tests
// -----------------------------------------------------------------------

#[test]
fn is_command_denied_matches_prefix_substring() {
    let policy = ProcessPolicy {
        deny_commands: vec!["sudo".to_string()],
        ..Default::default()
    };
    // "sudo apt" contains the denied prefix "sudo"
    assert!(
        is_command_denied("sudo apt install vim", &policy),
        "sudo apt should be denied"
    );
}

#[test]
fn is_command_denied_returns_false_for_allowed_command() {
    let policy = ProcessPolicy {
        deny_commands: vec!["sudo".to_string(), "rm -rf /".to_string()],
        ..Default::default()
    };
    assert!(
        !is_command_denied("ls -la /tmp", &policy),
        "ls should not be denied"
    );
}

#[test]
fn is_command_denied_returns_false_for_empty_deny_list() {
    let policy = ProcessPolicy::default();
    assert!(
        !is_command_denied("sudo anything", &policy),
        "empty deny list should deny nothing"
    );
}
