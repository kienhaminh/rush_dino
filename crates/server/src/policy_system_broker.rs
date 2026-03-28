//! `PolicySystemBroker` — a `SystemBroker` implementation that enforces a
//! `SandboxPolicy` before executing shell commands.
//!
//! Responsibilities:
//!  1. Reject commands denied by the `ProcessPolicy`.
//!  2. Inject credentials resolved from `CredentialProvider`s into the subprocess
//!     environment.
//!  3. On macOS, wrap commands with `sandbox-exec` using a generated SBPL profile
//!     so the OS enforces filesystem and network rules at the kernel level.
//!  4. Emit audit log entries for every allow and deny decision.
//!
//! The `EgressProxy` is exposed via `egress_proxy()` so callers (e.g. network
//! tools) can perform policy checks without going through shell execution.

use std::{collections::HashMap, path::{Path, PathBuf}, sync::Arc};

use async_trait::async_trait;
use tokio::process::Command;

use rushdino_agent::{ShellExecRequest, ShellExecResult, SystemBroker};
use rushdino_common::{AppError, Result};
use rushdino_security::{
    audit_log::{AuditCategory, AuditDecision, AuditEntry, AuditLog},
    credential_injector,
    egress_proxy::EgressProxy,
    policy::types::SandboxPolicy,
    sandbox_enforcer,
};

// ---------------------------------------------------------------------------
// PolicySystemBroker
// ---------------------------------------------------------------------------

/// A `SystemBroker` that applies a `SandboxPolicy` before executing any shell
/// command.
///
/// Construct with [`PolicySystemBroker::new`] and share via an `Arc`.
pub struct PolicySystemBroker {
    /// The full policy (static, locked at session creation).
    policy: SandboxPolicy,
    /// Dynamic network policy proxy (hot-reloadable via `EgressProxy::update_policy`).
    egress_proxy: Arc<EgressProxy>,
    /// Audit log — non-blocking, never fails the caller.
    audit: Arc<AuditLog>,
    /// Secrets store for credential resolution (env var name → secret value).
    secrets: HashMap<String, String>,
}

impl PolicySystemBroker {
    /// Create a new `PolicySystemBroker`.
    ///
    /// # Arguments
    /// * `policy`       — Sandbox policy; fixed for the lifetime of this broker.
    /// * `audit`        — Shared audit log for recording policy decisions.
    /// * `secrets`      — Secret values available for credential injection
    ///   (`${secret:KEY}` references in provider templates).
    pub fn new(
        policy: SandboxPolicy,
        audit: Arc<AuditLog>,
        secrets: HashMap<String, String>,
    ) -> Self {
        let egress_proxy = Arc::new(EgressProxy::new(policy.sandbox.network.clone()));
        Self {
            policy,
            egress_proxy,
            audit,
            secrets,
        }
    }

    /// Returns a clone of the shared `EgressProxy` so network tools can
    /// evaluate policy without going through shell execution.
    pub fn egress_proxy(&self) -> Arc<EgressProxy> {
        self.egress_proxy.clone()
    }

    // -----------------------------------------------------------------------
    // Private helpers
    // -----------------------------------------------------------------------

    /// Builds the final command string, optionally wrapping it with
    /// `sandbox-exec` on macOS.
    ///
    /// Returns `(command_string, Some(profile_path))` on macOS when wrapping
    /// succeeds, or `(original_command, None)` on other platforms / on error.
    fn build_sandboxed_command(
        &self,
        command: &str,
        session_id: &str,
    ) -> Result<(String, Option<PathBuf>)> {
        #[cfg(target_os = "macos")]
        {
            match sandbox_enforcer::write_sbpl_profile(&self.policy, session_id) {
                Ok(sb_path) => {
                    let wrapped = sandbox_enforcer::wrap_command_macos(command, &sb_path);
                    Ok((wrapped, Some(sb_path)))
                }
                Err(e) => {
                    tracing::warn!(
                        error = %e,
                        "failed to write seatbelt profile, running command without OS sandbox"
                    );
                    Ok((command.to_string(), None))
                }
            }
        }

        #[cfg(not(target_os = "macos"))]
        {
            let _ = session_id; // unused on non-macOS
            Ok((command.to_string(), None))
        }
    }

    /// Executes `command` via `sh -c` in the context supplied by `request`,
    /// injecting `extra_env` into the subprocess environment.
    ///
    /// Models `LocalSystemBroker::execute_shell` for CWD handling, timeout,
    /// and output capture.
    async fn execute_with_env(
        &self,
        command: &str,
        request: &ShellExecRequest,
        extra_env: &HashMap<String, String>,
    ) -> Result<ShellExecResult> {
        let cwd = resolve_cwd(request.host_cwd.as_deref())?;

        let mut cmd = Command::new("sh");
        cmd.args(["-c", command])
            .current_dir(&cwd)
            .envs(extra_env);

        let output = tokio::time::timeout(
            std::time::Duration::from_secs(request.timeout_secs),
            cmd.output(),
        )
        .await
        .map_err(|_| AppError::Agent("shell_exec timed out".to_owned()))?
        .map_err(|err| AppError::Agent(format!("shell_exec failed: {err}")))?;

        Ok(ShellExecResult {
            exit_status: output.status.to_string(),
            stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
            stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
            cwd,
        })
    }
}

// ---------------------------------------------------------------------------
// SystemBroker impl
// ---------------------------------------------------------------------------

#[async_trait]
impl SystemBroker for PolicySystemBroker {
    async fn execute_shell(&self, request: ShellExecRequest) -> Result<ShellExecResult> {
        let session_id = request.session_id.clone().unwrap_or_default();

        // 1. Check whether the command is denied by the process policy.
        if sandbox_enforcer::is_command_denied(&request.command, &self.policy.sandbox.process) {
            self.audit.record(AuditEntry {
                session_id: session_id.clone(),
                agent_id: None,
                category: AuditCategory::Process,
                decision: AuditDecision::Deny,
                binary: None,
                destination: None,
                method: None,
                path: None,
                reason: Some(format!(
                    "command denied by process policy: {}",
                    request.command
                )),
            });
            return Err(AppError::Agent(format!(
                "Command denied by sandbox policy: {}",
                request.command
            )));
        }

        // 2. Resolve credentials from configured providers and secrets store.
        let creds = credential_injector::CredentialInjector::resolve(&self.policy.providers, &self.secrets);

        // 3. Build the (optionally OS-sandboxed) command string.
        let (final_command, sb_profile_path) =
            self.build_sandboxed_command(&request.command, &session_id)?;

        // 4. Record allow decision in the audit log.
        self.audit.record(AuditEntry {
            session_id: session_id.clone(),
            agent_id: None,
            category: AuditCategory::Process,
            decision: AuditDecision::Allow,
            binary: None,
            destination: None,
            method: None,
            path: None,
            reason: Some("process policy allow".to_string()),
        });

        // 5. Execute the command with injected credentials.
        let result = self
            .execute_with_env(&final_command, &request, &creds)
            .await;

        // 6. Clean up the temporary seatbelt profile on macOS.
        if let Some(path) = sb_profile_path {
            let _ = std::fs::remove_file(&path);
        }

        result
    }
}

// ---------------------------------------------------------------------------
// CWD resolution (mirrors LocalSystemBroker)
// ---------------------------------------------------------------------------

fn resolve_cwd(requested: Option<&Path>) -> Result<PathBuf> {
    let candidate = match requested {
        Some(path) if path.is_absolute() => path.to_path_buf(),
        Some(path) => std::env::current_dir().map_err(AppError::Io)?.join(path),
        None => std::env::current_dir().map_err(AppError::Io)?,
    };

    let canonical = candidate.canonicalize().map_err(|err| {
        AppError::Validation(format!(
            "invalid shell_exec cwd '{}': {err}",
            candidate.display()
        ))
    })?;

    if !canonical.is_dir() {
        return Err(AppError::Validation(format!(
            "shell_exec cwd is not a directory: {}",
            canonical.display()
        )));
    }

    Ok(canonical)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use rushdino_security::{
        audit_log::AuditLog,
        policy::types::{
            FilesystemPolicy, InferencePolicy, NetworkPolicy, ProcessPolicy, SandboxConfig,
            SandboxPolicy,
        },
    };

    use super::*;

    // Build a no-op AuditLog that discards entries without SQLite.
    fn make_audit_log() -> Arc<AuditLog> {
        AuditLog::new_noop()
    }

    fn make_policy(deny_commands: Vec<String>) -> SandboxPolicy {
        SandboxPolicy {
            version: "1".to_string(),
            sandbox: SandboxConfig {
                process: ProcessPolicy {
                    deny_commands,
                    ..Default::default()
                },
                filesystem: FilesystemPolicy::default(),
                network: NetworkPolicy::default(),
                inference: InferencePolicy::default(),
            },
            providers: vec![],
        }
    }

    // -----------------------------------------------------------------------
    // Test: denied command returns an error
    // -----------------------------------------------------------------------
    #[tokio::test]
    async fn denied_command_returns_error() {
        let policy = make_policy(vec!["sudo".to_string()]);
        let audit = make_audit_log();
        let broker = PolicySystemBroker::new(policy, audit, HashMap::new());

        let result = broker
            .execute_shell(ShellExecRequest {
                command: "sudo rm -rf /".to_string(),
                host_cwd: None,
                timeout_secs: 5,
                session_id: Some("sess-test".to_string()),
                conversation_id: None,
                run_id: None,
            })
            .await;

        assert!(result.is_err(), "denied command should return an error");
        let msg = result.unwrap_err().to_string();
        assert!(
            msg.contains("denied"),
            "error message should mention 'denied', got: {msg}"
        );
    }

    // -----------------------------------------------------------------------
    // Test: egress_proxy() returns the proxy
    // -----------------------------------------------------------------------
    #[test]
    fn egress_proxy_returns_shared_arc() {
        let policy = make_policy(vec![]);
        let audit = make_audit_log();
        let broker = PolicySystemBroker::new(policy, audit, HashMap::new());

        // Calling egress_proxy() twice should give two Arcs pointing to the
        // same allocation.
        let p1 = broker.egress_proxy();
        let p2 = broker.egress_proxy();
        assert!(
            Arc::ptr_eq(&p1, &p2),
            "egress_proxy() must return the same Arc each time"
        );
    }

    // -----------------------------------------------------------------------
    // Test: build_sandboxed_command wraps on macOS, passes through elsewhere
    // -----------------------------------------------------------------------
    #[test]
    fn build_sandboxed_command_wraps_on_macos() {
        let policy = make_policy(vec![]);
        let audit = make_audit_log();
        let broker = PolicySystemBroker::new(policy, audit, HashMap::new());

        let (cmd, profile) = broker
            .build_sandboxed_command("echo hello", "sess-1")
            .expect("build_sandboxed_command should not fail");

        #[cfg(target_os = "macos")]
        {
            assert!(
                cmd.starts_with("sandbox-exec"),
                "on macOS, command must be wrapped with sandbox-exec"
            );
            assert!(
                profile.is_some(),
                "on macOS, a profile path must be returned"
            );
            // Clean up the temp file written by write_sbpl_profile
            if let Some(p) = profile {
                let _ = std::fs::remove_file(p);
            }
        }

        #[cfg(not(target_os = "macos"))]
        {
            assert_eq!(cmd, "echo hello", "on non-macOS the command is unchanged");
            assert!(profile.is_none(), "on non-macOS, no profile is written");
        }
    }
}
