use serde::{Deserialize, Serialize};

/// Categories of actions the guardrail pipeline intercepts.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ActionCategory {
    Bash,
    Network,
    FsRead,
    FsWrite,
}

/// Trust levels for the TrustGate filter.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub enum TrustLevel {
    /// L0: Every action requires user approval.
    Untrusted = 0,
    /// L1: Auto-approve if pattern matches a previously approved pattern.
    Supervised = 1,
    /// L2: Auto-approve everything in this category.
    Trusted = 2,
}

/// The action being requested, with enough info for each filter to decide.
#[derive(Debug, Clone)]
pub struct GuardrailAction {
    pub category: ActionCategory,
    pub description: String,
    pub raw_content: String,
    pub source_tag: SourceTag,
    pub session_id: String,
    pub agent_id: String,
}

/// Tags content by origin to determine PromptShield scanning.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SourceTag {
    LocalFile,
    UserInput,
    ExternalWeb,
    ExternalApi,
    ExternalEmail,
    ShellExternal,
}

impl SourceTag {
    pub fn is_untrusted(&self) -> bool {
        matches!(
            self,
            SourceTag::ExternalWeb
                | SourceTag::ExternalApi
                | SourceTag::ExternalEmail
                | SourceTag::ShellExternal
        )
    }
}

/// Decision from a filter in the pipeline.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FilterDecision {
    /// Allow the action to proceed.
    Allow,
    /// Action needs user approval. Contains the prompt message.
    NeedsApproval(String),
    /// Hard deny. Action cannot proceed.
    Deny(String),
    /// Content was transformed (redacted). Contains the modified content.
    Transformed(String),
    /// Flagged for user review but not blocked. Contains warning message.
    Flagged(String),
}

/// Types of secrets detected by PatternRegistry.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SecretType {
    PrivateKey,
    ApiKey,
    Password,
    CreditCard,
    Ssn,
    Pii,
    Custom(String),
}

/// Sensitivity level for DataRedactor.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Sensitivity {
    /// Redact all detected patterns, no exceptions.
    Strict,
    /// Redact keys, tokens, passwords. Skip PII.
    #[default]
    Standard,
    /// Only redact private keys and high-confidence secrets.
    Relaxed,
}

/// Confidence level for PromptShield detection.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Confidence(pub f32);

impl Confidence {
    /// Create a new Confidence, clamping the value to [0.0, 1.0].
    pub fn new(value: f32) -> Self {
        Self(value.clamp(0.0, 1.0))
    }
    pub fn high(&self) -> bool {
        self.0 > 0.8
    }
    pub fn medium(&self) -> bool {
        self.0 > 0.5 && self.0 <= 0.8
    }
    pub fn low(&self) -> bool {
        self.0 <= 0.5
    }
}
