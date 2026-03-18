// Policy type definitions for the agent sandbox system.
//
// These types map directly to the YAML sandbox policy format and are used
// to configure filesystem, process, network, and inference constraints
// for agent execution environments.

use std::collections::HashMap;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

/// Top-level sandbox policy document. Corresponds to a single YAML policy file.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SandboxPolicy {
    /// Schema version, e.g. "1".
    pub version: String,
    /// Core sandbox configuration.
    pub sandbox: SandboxConfig,
    /// Credential providers to inject into the agent environment.
    #[serde(default)]
    pub providers: Vec<CredentialProvider>,
}

/// Aggregates all sandbox sub-policies.
#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
pub struct SandboxConfig {
    #[serde(default)]
    pub filesystem: FilesystemPolicy,
    #[serde(default)]
    pub process: ProcessPolicy,
    #[serde(default)]
    pub network: NetworkPolicy,
    #[serde(default)]
    pub inference: InferencePolicy,
}

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

/// Whether an unlisted resource is allowed or denied by default.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum DefaultAction {
    Allow,
    Deny,
}

impl Default for DefaultAction {
    fn default() -> Self {
        DefaultAction::Deny
    }
}

// ---------------------------------------------------------------------------
// Filesystem
// ---------------------------------------------------------------------------

/// Read/write access mode for a filesystem path rule.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum AccessMode {
    ReadOnly,
    ReadWrite,
}

impl Default for AccessMode {
    fn default() -> Self {
        AccessMode::ReadOnly
    }
}

/// A single filesystem allow-rule pairing a path with an access mode.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PathRule {
    /// Filesystem path; `~` will be expanded to the user's home directory.
    pub path: PathBuf,
    /// Whether the path may be written to or only read.
    #[serde(default)]
    pub mode: AccessMode,
}

/// Filesystem access policy: allow-list, deny-list, and a default action.
#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
pub struct FilesystemPolicy {
    /// Behaviour for paths not covered by allow/deny rules.
    #[serde(default)]
    pub default: DefaultAction,
    /// Paths explicitly permitted (subject to `mode`).
    #[serde(default)]
    pub allow: Vec<PathRule>,
    /// Paths unconditionally blocked regardless of allow rules.
    #[serde(default)]
    pub deny: Vec<PathBuf>,
}

// ---------------------------------------------------------------------------
// Process
// ---------------------------------------------------------------------------

/// Policy governing subprocess creation and execution.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ProcessPolicy {
    /// Whether processes may run with elevated privileges.
    #[serde(default)]
    pub allow_privileged: bool,
    /// Maximum number of concurrent subprocesses (0 = unlimited).
    #[serde(default = "default_max_concurrent")]
    pub max_concurrent: u32,
    /// Command names (argv[0]) that are unconditionally rejected.
    #[serde(default)]
    pub deny_commands: Vec<String>,
}

fn default_max_concurrent() -> u32 {
    10
}

impl Default for ProcessPolicy {
    fn default() -> Self {
        Self {
            allow_privileged: false,
            max_concurrent: default_max_concurrent(),
            deny_commands: Vec::new(),
        }
    }
}

// ---------------------------------------------------------------------------
// Network
// ---------------------------------------------------------------------------

/// What the runtime should do when a network request is blocked.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum BlockBehavior {
    /// Pause and prompt a human for approval before proceeding.
    Prompt,
    /// Silently reject the request.
    Deny,
    /// Terminate the agent process immediately.
    HardStop,
}

impl Default for BlockBehavior {
    fn default() -> Self {
        BlockBehavior::Deny
    }
}

/// A single network allow-rule. Supports glob host patterns (e.g. `*.anthropic.com`).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct NetworkRule {
    /// Hostname or glob pattern to match against the request target.
    pub host: String,
    /// TCP port the rule applies to.
    pub port: u16,
    /// HTTP methods permitted (e.g. `["GET", "POST"]`). Empty = all methods.
    #[serde(default)]
    pub methods: Vec<String>,
    /// URL path prefixes permitted. Empty = all paths.
    #[serde(default)]
    pub paths: Vec<String>,
}

/// Network access policy: allow-list, default action, and block behavior.
#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
pub struct NetworkPolicy {
    /// Behaviour for hosts/ports not covered by allow rules.
    #[serde(default)]
    pub default: DefaultAction,
    /// How to handle a blocked network request.
    #[serde(default)]
    pub on_block: BlockBehavior,
    /// Explicitly permitted network destinations.
    #[serde(default)]
    pub allow: Vec<NetworkRule>,
}

// ---------------------------------------------------------------------------
// Inference
// ---------------------------------------------------------------------------

/// Policy governing access to LLM inference endpoints.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct InferencePolicy {
    /// Whether the agent is permitted to call inference APIs at all.
    #[serde(default = "default_true")]
    pub enabled: bool,
    /// Internal gateway hostname/address through which inference calls are routed.
    #[serde(default)]
    pub route_via: String,
    /// If true, the agent's own API credentials are stripped before forwarding.
    #[serde(default)]
    pub strip_agent_credentials: bool,
    /// Name of the credential provider to inject for inference calls.
    #[serde(default)]
    pub inject_provider: String,
}

fn default_true() -> bool {
    true
}

impl Default for InferencePolicy {
    fn default() -> Self {
        Self {
            enabled: true,
            route_via: String::new(),
            strip_agent_credentials: false,
            inject_provider: String::new(),
        }
    }
}

// ---------------------------------------------------------------------------
// Credentials
// ---------------------------------------------------------------------------

/// A named set of environment variables to inject into the agent process.
/// Values may reference secrets via `${secret:key}` syntax.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CredentialProvider {
    /// Logical name identifying this provider (e.g. "openai").
    pub name: String,
    /// Map of environment variable name to value or secret reference.
    #[serde(default)]
    pub inject: HashMap<String, String>,
}
