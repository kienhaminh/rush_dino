// Sandbox policy module: type definitions and YAML loading utilities.
//
// Agents load their sandbox configuration from a YAML file on disk. The file
// format is described by the types in `types.rs`. This module exposes those
// types and provides convenience constructors for loading policies.

pub mod types;
pub use types::*;

use std::path::{Path, PathBuf};

use thiserror::Error;

/// Errors that can occur when loading a sandbox policy file.
#[derive(Debug, Error)]
pub enum PolicyError {
    #[error("failed to read policy file {path}: {source}")]
    Io {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },
    #[error("failed to parse policy file {path}: {source}")]
    Parse {
        path: PathBuf,
        #[source]
        source: serde_yaml::Error,
    },
    #[error("{0}")]
    Policy(String),
}

impl SandboxPolicy {
    /// Load a `SandboxPolicy` from a YAML file at the given path.
    ///
    /// `~` in filesystem `path` and `deny` entries is expanded to the user's
    /// home directory before the policy is returned.
    pub fn load(path: &Path) -> Result<Self, PolicyError> {
        let raw = std::fs::read_to_string(path).map_err(|source| PolicyError::Io {
            path: path.to_owned(),
            source,
        })?;

        let mut policy: SandboxPolicy =
            serde_yaml::from_str(&raw).map_err(|source| PolicyError::Parse {
                path: path.to_owned(),
                source,
            })?;

        expand_tilde_in_policy(&mut policy)?;

        Ok(policy)
    }

    /// Look up a sandbox policy file for a specific agent.
    ///
    /// Checks for `<agents_dir>/<agent_id>/sandbox.yaml`. Returns `Ok(None)`
    /// if the file does not exist (meaning no sandbox is configured for that
    /// agent).
    pub fn load_for_agent(
        agents_dir: &Path,
        agent_id: &str,
    ) -> Result<Option<Self>, PolicyError> {
        let policy_path = agents_dir.join(agent_id).join("sandbox.yaml");

        if !policy_path.exists() {
            return Ok(None);
        }

        Self::load(&policy_path).map(Some)
    }
}

// ---------------------------------------------------------------------------
// Tilde expansion helpers
// ---------------------------------------------------------------------------

/// Expand `~` at the start of a path string to the user's home directory.
///
/// Returns an error if `HOME` is not set and the path starts with `~`.
fn expand_tilde(path: &Path) -> Result<PathBuf, PolicyError> {
    let s = path.to_string_lossy();
    if s.starts_with('~') {
        let home = std::env::var("HOME")
            .map_err(|_| PolicyError::Policy("HOME environment variable not set; cannot expand '~' in policy paths".to_string()))?;
        let without_tilde = s.trim_start_matches('~');
        Ok(PathBuf::from(format!("{home}{without_tilde}")))
    } else {
        Ok(path.to_owned())
    }
}

/// Walk the entire policy and expand `~` in every path field.
fn expand_tilde_in_policy(policy: &mut SandboxPolicy) -> Result<(), PolicyError> {
    let fs = &mut policy.sandbox.filesystem;

    for rule in &mut fs.allow {
        rule.path = expand_tilde(&rule.path)?;
    }

    for deny_path in &mut fs.deny {
        *deny_path = expand_tilde(deny_path)?;
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    /// Full YAML fixture covering all policy sections.
    const FULL_YAML: &str = r#"
version: "1"
sandbox:
  filesystem:
    default: deny
    allow:
      - path: "~/documents"
        mode: read-write
    deny:
      - "~/.ssh"
  process:
    allow_privileged: false
    max_concurrent: 5
    deny_commands:
      - "sudo"
  network:
    default: deny
    on_block: prompt
    allow:
      - host: "api.openai.com"
        port: 443
        methods: [GET, POST]
        paths:
          - "/v1/chat/completions"
  inference:
    enabled: true
    route_via: "inference.local"
    strip_agent_credentials: true
    inject_provider: "local-ollama"
providers:
  - name: "openai"
    inject:
      OPENAI_API_KEY: "${secret:openai_api_key}"
"#;

    #[test]
    fn full_yaml_parses_correctly() {
        let policy: SandboxPolicy =
            serde_yaml::from_str(FULL_YAML).expect("YAML should parse without error");

        assert_eq!(policy.version, "1");

        // Filesystem
        let fs = &policy.sandbox.filesystem;
        assert_eq!(fs.default, DefaultAction::Deny);
        assert_eq!(fs.allow.len(), 1);
        assert_eq!(fs.allow[0].mode, AccessMode::ReadWrite);
        assert_eq!(fs.deny.len(), 1);

        // Process
        let proc = &policy.sandbox.process;
        assert!(!proc.allow_privileged);
        assert_eq!(proc.max_concurrent, 5);
        assert_eq!(proc.deny_commands, vec!["sudo"]);

        // Network
        let net = &policy.sandbox.network;
        assert_eq!(net.default, DefaultAction::Deny);
        assert_eq!(net.on_block, BlockBehavior::Prompt);
        assert_eq!(net.allow.len(), 1);
        let rule = &net.allow[0];
        assert_eq!(rule.host, "api.openai.com");
        assert_eq!(rule.port, 443);
        assert_eq!(rule.methods, vec!["GET", "POST"]);
        assert_eq!(rule.paths, vec!["/v1/chat/completions"]);

        // Inference
        let inf = &policy.sandbox.inference;
        assert!(inf.enabled);
        assert_eq!(inf.route_via, "inference.local");
        assert!(inf.strip_agent_credentials);
        assert_eq!(inf.inject_provider, "local-ollama");

        // Providers
        assert_eq!(policy.providers.len(), 1);
        let prov = &policy.providers[0];
        assert_eq!(prov.name, "openai");
        assert_eq!(
            prov.inject.get("OPENAI_API_KEY").map(String::as_str),
            Some("${secret:openai_api_key}")
        );
    }

    #[test]
    fn tilde_is_expanded_in_filesystem_paths() {
        let home = std::env::var("HOME").unwrap_or_else(|_| "/home/test".to_string());

        let mut policy: SandboxPolicy =
            serde_yaml::from_str(FULL_YAML).expect("YAML should parse");

        expand_tilde_in_policy(&mut policy).expect("tilde expansion should succeed when HOME is set");

        let allow_path = policy.sandbox.filesystem.allow[0].path.to_string_lossy();
        assert!(
            allow_path.starts_with(&home),
            "allow path '{allow_path}' should start with home dir '{home}'"
        );
        assert!(!allow_path.starts_with('~'), "allow path should not contain literal ~");

        let deny_path = policy.sandbox.filesystem.deny[0].to_string_lossy();
        assert!(
            deny_path.starts_with(&home),
            "deny path '{deny_path}' should start with home dir '{home}'"
        );
        assert!(!deny_path.starts_with('~'), "deny path should not contain literal ~");
    }

    #[test]
    fn load_for_agent_returns_none_for_nonexistent_file() {
        let tmp = std::env::temp_dir();
        // Use a path that definitely won't exist
        let result = SandboxPolicy::load_for_agent(&tmp, "nonexistent-agent-xyz-99999");
        assert!(
            result.is_ok(),
            "should not error for missing file, got: {:?}",
            result
        );
        assert!(
            result.unwrap().is_none(),
            "should return None for missing file"
        );
    }
}
