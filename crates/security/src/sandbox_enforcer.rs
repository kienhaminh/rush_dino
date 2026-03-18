// OS-level static enforcement for the agent sandbox.
//
// Generates macOS Seatbelt Profile Language (SBPL) content from the rich
// `SandboxPolicy` type and provides helpers to apply that profile when
// spawning subprocesses.

use std::path::{Path, PathBuf};

use crate::policy::types::{AccessMode, DefaultAction, ProcessPolicy, SandboxPolicy};

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

#[derive(Debug, thiserror::Error)]
pub enum SandboxEnforcerError {
    #[error("failed to write seatbelt profile: {0}")]
    ProfileWrite(#[from] std::io::Error),
}

// ---------------------------------------------------------------------------
// SBPL generation
// ---------------------------------------------------------------------------

/// Generates a macOS Seatbelt Profile Language (.sb) profile from a
/// `SandboxPolicy`.  The profile can be passed directly to `sandbox-exec -f`.
///
/// Generation rules:
/// - Always opens with `(version 1)`.
/// - If `filesystem.default == Deny`, emits `(deny default)` followed by
///   `(allow process*)` and `(allow file-read*)` as a base.
/// - For each `filesystem.allow` entry:
///   - `ReadOnly`  → `(allow file-read* (subpath "…"))`
///   - `ReadWrite` → `(allow file-read* …)` + `(allow file-write* …)`
/// - For each `filesystem.deny` entry:
///   - `(deny file-read* (subpath "…"))` + `(deny file-write* (subpath "…"))`
/// - If `process.allow_privileged == false`:
///   - `(deny process-exec (with no-sandbox))`
/// - Always closes with `(allow signal)` and `(allow sysctl-read)`.
pub fn generate_sbpl(policy: &SandboxPolicy, _session_id: &str) -> String {
    let mut out = String::new();

    out.push_str("(version 1)\n");

    // Default filesystem stance
    if policy.sandbox.filesystem.default == DefaultAction::Deny {
        out.push_str("(deny default)\n");
        out.push_str("(allow process*)\n");
        out.push_str("(allow file-read*)\n");
    }

    // Explicit allow rules
    for rule in &policy.sandbox.filesystem.allow {
        let path = escape_seatbelt_path(&rule.path.to_string_lossy());
        out.push_str(&format!("(allow file-read* (subpath \"{path}\"))\n"));
        if rule.mode == AccessMode::ReadWrite {
            out.push_str(&format!("(allow file-write* (subpath \"{path}\"))\n"));
        }
    }

    // Explicit deny rules — block both reads and writes unconditionally
    for deny_path in &policy.sandbox.filesystem.deny {
        let path = escape_seatbelt_path(&deny_path.to_string_lossy());
        out.push_str(&format!("(deny file-read* (subpath \"{path}\"))\n"));
        out.push_str(&format!("(deny file-write* (subpath \"{path}\"))\n"));
    }

    // Privilege escalation guard
    if !policy.sandbox.process.allow_privileged {
        out.push_str("(deny process-exec (with no-sandbox))\n");
    }

    // Always-on allowances required for basic process operation
    out.push_str("(allow signal)\n");
    out.push_str("(allow sysctl-read)");

    out
}

/// Escapes characters that have special meaning inside Seatbelt string
/// literals: backslash and double-quote.
fn escape_seatbelt_path(path: &str) -> String {
    path.replace('\\', "\\\\").replace('"', "\\\"")
}

// ---------------------------------------------------------------------------
// Profile file I/O
// ---------------------------------------------------------------------------

/// Writes the SBPL profile to a temporary file and returns its path.
///
/// The file is named `rushdino-sandbox-{session_id}.sb` and placed under the
/// system temporary directory.  The caller is responsible for deleting it.
pub fn write_sbpl_profile(
    policy: &SandboxPolicy,
    session_id: &str,
) -> Result<PathBuf, SandboxEnforcerError> {
    let content = generate_sbpl(policy, session_id);
    let file_name = format!("rushdino-sandbox-{session_id}.sb");
    let path = std::env::temp_dir().join(file_name);
    std::fs::write(&path, content)?;
    Ok(path)
}

// ---------------------------------------------------------------------------
// Command wrapping (macOS only)
// ---------------------------------------------------------------------------

/// Wraps a shell command with `sandbox-exec` so the OS enforces the profile.
///
/// Returns: `sandbox-exec -f {sb_path} -- sh -c '{command}'`
///
/// The command string is single-quote–escaped so it is safe to pass through
/// `sh -c`.
#[cfg(target_os = "macos")]
pub fn wrap_command_macos(command: &str, sb_path: &Path) -> String {
    let escaped_command = command.replace('\'', "'\\''");
    format!(
        "sandbox-exec -f {} -- sh -c '{}'",
        sb_path.display(),
        escaped_command
    )
}

// ---------------------------------------------------------------------------
// Process policy enforcement
// ---------------------------------------------------------------------------

/// Returns `true` when the given command line is denied by the process policy.
///
/// A command is denied if any entry in `policy.deny_commands` is a prefix or
/// substring of `command`.  Comparison is case-sensitive.
pub fn is_command_denied(command: &str, policy: &ProcessPolicy) -> bool {
    policy
        .deny_commands
        .iter()
        .any(|denied| command.contains(denied.as_str()))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use crate::policy::types::{
        AccessMode, DefaultAction, FilesystemPolicy, InferencePolicy, NetworkPolicy, PathRule,
        ProcessPolicy, SandboxConfig, SandboxPolicy,
    };

    use super::{generate_sbpl, is_command_denied};

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
}
