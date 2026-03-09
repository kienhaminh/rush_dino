use std::{
    fs,
    path::{Path, PathBuf},
    sync::Arc,
};

use async_trait::async_trait;
use serde_json::json;
use tokio::process::Command;
use walkdir::WalkDir;

use rushdino_agent::{
    tools::shell_exec::is_dangerous_command, AgentRuntime, RunPolicySnapshot, ShellExecRequest,
    ShellExecResult, SystemBroker,
};
use rushdino_common::{init, AppConfig, AppError, Result};
use rushdino_security::sandbox::{
    apply_subprocess_isolation, platform_supports_sandbox, SandboxPolicy,
};

use crate::approval_gate::ApprovalGate;

pub struct LocalSystemBroker {
    config_path: PathBuf,
    approval_gate: Arc<ApprovalGate>,
    runtime: Arc<AgentRuntime>,
}

impl LocalSystemBroker {
    pub fn new(
        config_path: PathBuf,
        approval_gate: Arc<ApprovalGate>,
        runtime: Arc<AgentRuntime>,
    ) -> Self {
        Self {
            config_path,
            approval_gate,
            runtime,
        }
    }

    async fn ensure_approval(
        &self,
        request: &ShellExecRequest,
        host_cwd: &Path,
        sandbox_enabled: bool,
    ) -> Result<()> {
        if !is_dangerous_command(&request.command) {
            return Ok(());
        }

        let session_id = request.session_id.as_deref().ok_or_else(|| {
            AppError::Agent(
                "shell_exec blocked: dangerous command outside websocket session".to_owned(),
            )
        })?;
        let conversation_id = request.conversation_id.as_deref().ok_or_else(|| {
            AppError::Agent("shell_exec blocked: missing conversation context".to_owned())
        })?;

        if let Some(run_id) = request.run_id.as_deref() {
            let _ = self
                .runtime
                .mark_awaiting_approval(
                    run_id,
                    "shell_exec",
                    RunPolicySnapshot {
                        decision: "ask".to_owned(),
                        approval_state: "pending".to_owned(),
                        sandbox_state: if sandbox_enabled {
                            "isolated".to_owned()
                        } else {
                            "host".to_owned()
                        },
                        effective_scope: "mirrored_workspace".to_owned(),
                        reason: Some(
                            "Dangerous shell execution requires explicit operator approval."
                                .to_owned(),
                        ),
                    },
                )
                .await;
        }

        let approval_result = self
            .approval_gate
            .request_approval(
                session_id,
                conversation_id,
                request.run_id.as_deref(),
                "shell_exec",
                json!({
                    "command": request.command,
                    "cwd": host_cwd.display().to_string(),
                }),
            )
            .await;

        if let Some(run_id) = request.run_id.as_deref() {
            let _ = self
                .runtime
                .record_approval_resolution(
                    run_id,
                    approval_result.is_ok(),
                    approval_result
                        .as_ref()
                        .err()
                        .map(ToString::to_string)
                        .or_else(|| {
                            Some("Operator approved dangerous shell execution.".to_owned())
                        }),
                )
                .await;
        }

        approval_result
    }
}

#[async_trait]
impl SystemBroker for LocalSystemBroker {
    async fn execute_shell(&self, request: ShellExecRequest) -> Result<ShellExecResult> {
        let config = AppConfig::load_from_path(&self.config_path)?;
        let host_cwd = resolve_host_cwd(request.host_cwd.as_deref())?;
        let sandbox_cfg = &config.execution.shell_exec_sandbox;
        self.ensure_approval(&request, &host_cwd, sandbox_cfg.enabled)
            .await?;

        let workspace_root = resolve_workspace_root(&sandbox_cfg.workspace_root);
        let sandbox_cwd = map_host_path_to_workspace(&host_cwd, &workspace_root)?;

        if sandbox_cfg.enabled {
            sync_workspace(&host_cwd, &sandbox_cwd)?;
        }

        let run_cwd = if sandbox_cfg.enabled {
            sandbox_cwd.clone()
        } else {
            host_cwd.clone()
        };

        let mut cmd = Command::new("sh");
        cmd.arg("-lc").arg(&request.command).current_dir(&run_cwd);

        if sandbox_cfg.enabled {
            if !platform_supports_sandbox() {
                return Err(AppError::Agent(
                    "shell_exec sandbox is enabled but this platform is unsupported".to_owned(),
                ));
            }

            let policy = build_sandbox_policy(&run_cwd, sandbox_cfg)?;
            #[cfg(unix)]
            unsafe {
                let policy = policy.clone();
                cmd.pre_exec(move || {
                    apply_subprocess_isolation(&policy).map_err(std::io::Error::other)
                });
            }
        }

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
            host_cwd,
            sandbox_cwd: run_cwd,
        })
    }
}

fn resolve_host_cwd(requested: Option<&Path>) -> Result<PathBuf> {
    let candidate = if let Some(path) = requested {
        if path.is_absolute() {
            path.to_path_buf()
        } else {
            std::env::current_dir().map_err(AppError::Io)?.join(path)
        }
    } else {
        std::env::current_dir().map_err(AppError::Io)?
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

fn resolve_workspace_root(workspace_root: &Path) -> PathBuf {
    if workspace_root.is_absolute() {
        workspace_root.to_path_buf()
    } else {
        init::canonical_home_dir().join(workspace_root)
    }
}

fn map_host_path_to_workspace(host_cwd: &Path, workspace_root: &Path) -> Result<PathBuf> {
    if !host_cwd.is_absolute() {
        return Err(AppError::Validation(format!(
            "host cwd must be absolute: {}",
            host_cwd.display()
        )));
    }

    let mut sandbox_path = workspace_root.to_path_buf();
    for component in host_cwd.components() {
        if matches!(component, std::path::Component::RootDir) {
            continue;
        }
        sandbox_path.push(component.as_os_str());
    }
    Ok(sandbox_path)
}

fn sync_workspace(host_cwd: &Path, sandbox_cwd: &Path) -> Result<()> {
    if sandbox_cwd.exists() {
        fs::remove_dir_all(sandbox_cwd).map_err(AppError::Io)?;
    }
    fs::create_dir_all(sandbox_cwd).map_err(AppError::Io)?;

    for entry in WalkDir::new(host_cwd).follow_links(false) {
        let entry =
            entry.map_err(|err| AppError::Agent(format!("workspace walk failed: {err}")))?;
        let source = entry.path();
        if source == host_cwd {
            continue;
        }

        let relative = source.strip_prefix(host_cwd).map_err(|err| {
            AppError::Agent(format!("failed to derive sandbox workspace path: {err}"))
        })?;
        let target = sandbox_cwd.join(relative);
        let file_type = entry.file_type();

        if file_type.is_dir() {
            fs::create_dir_all(&target).map_err(AppError::Io)?;
            continue;
        }

        if file_type.is_file() {
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent).map_err(AppError::Io)?;
            }
            fs::copy(source, &target).map_err(AppError::Io)?;
            let permissions = fs::metadata(source).map_err(AppError::Io)?.permissions();
            fs::set_permissions(&target, permissions).map_err(AppError::Io)?;
            continue;
        }

        tracing::warn!(path = %source.display(), "skipping non-regular path during sandbox sync");
    }

    Ok(())
}

fn build_sandbox_policy(
    sandbox_cwd: &Path,
    config: &rushdino_common::ShellExecSandboxConfig,
) -> Result<SandboxPolicy> {
    let mut writable_roots = vec![sandbox_cwd.to_path_buf()];
    writable_roots.extend(config.extra_write_roots.iter().map(|path| {
        if path.is_absolute() {
            path.to_path_buf()
        } else {
            init::canonical_home_dir().join(path)
        }
    }));

    let temp_dir = std::env::temp_dir();
    writable_roots.push(temp_dir.clone());
    if let Ok(canonical_temp) = temp_dir.canonicalize() {
        writable_roots.push(canonical_temp);
    }

    Ok(SandboxPolicy::new(writable_roots, config.allow_network))
}

#[cfg(test)]
mod tests {
    use std::{fs, time::Duration};

    use serde_json::json;
    use sqlx::SqlitePool;

    use super::*;
    use crate::approval_gate::ApprovalGate;

    #[test]
    fn workspace_mapping_preserves_host_path_shape() {
        let mapped = map_host_path_to_workspace(
            Path::new("/Users/kien.ha/Code/RushDino"),
            Path::new("/tmp/rushdino-workspaces"),
        )
        .expect("mapping should succeed");

        assert_eq!(
            mapped,
            PathBuf::from("/tmp/rushdino-workspaces/Users/kien.ha/Code/RushDino")
        );
    }

    #[test]
    fn sync_workspace_copies_files_without_touching_source() {
        let root = std::env::temp_dir().join(format!("rushdino-broker-{}", uuid::Uuid::new_v4()));
        let host = root.join("host");
        let sandbox = root.join("sandbox");
        fs::create_dir_all(host.join("nested")).expect("host dir should be created");
        fs::write(host.join("nested/file.txt"), "hello").expect("host file should be written");

        sync_workspace(&host, &sandbox).expect("workspace sync should succeed");

        assert_eq!(
            fs::read_to_string(sandbox.join("nested/file.txt")).expect("sandbox file should exist"),
            "hello"
        );
        assert_eq!(
            fs::read_to_string(host.join("nested/file.txt")).expect("host file should still exist"),
            "hello"
        );

        let _ = fs::remove_dir_all(root);
    }

    #[tokio::test]
    async fn dangerous_commands_are_routed_through_approval_gate() {
        let gate = ApprovalGate::with_timeout(Duration::from_secs(1));
        let pool = Arc::new(
            SqlitePool::connect("sqlite::memory:")
                .await
                .expect("in-memory sqlite should connect"),
        );
        let runtime = Arc::new(AgentRuntime::new(pool));
        let broker =
            LocalSystemBroker::new(PathBuf::from("/tmp/config.toml"), gate.clone(), runtime);
        let mut rx = gate.register_session("session-1").await;

        let approval_task = tokio::spawn(async move {
            broker
                .ensure_approval(
                    &ShellExecRequest {
                        command: "rm -rf /tmp/test".to_owned(),
                        host_cwd: None,
                        timeout_secs: 30,
                        session_id: Some("session-1".to_owned()),
                        conversation_id: Some("conv-1".to_owned()),
                        run_id: Some("run-1".to_owned()),
                    },
                    Path::new("/tmp"),
                    true,
                )
                .await
        });

        let request = rx.recv().await.expect("approval request should be emitted");
        assert_eq!(request.tool, "shell_exec");
        assert_eq!(request.run_id.as_deref(), Some("run-1"));
        assert_eq!(
            request.args,
            json!({"command": "rm -rf /tmp/test", "cwd": "/tmp"})
        );
        gate.resolve("session-1", &request.request_id, true)
            .await
            .expect("approval should resolve");

        assert!(approval_task
            .await
            .expect("approval task should complete")
            .is_ok());
    }
}
