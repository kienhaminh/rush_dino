use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use super::data_redactor::DataRedactor;
use super::output_scanner::OutputScanner;
use super::pattern_registry::PatternRegistry;
use super::policy_enforcer::PolicyEnforcer;
use super::prompt_shield::PromptShield;
use super::trust_gate::TrustGate;
use super::trust_state::TrustState;
use super::types::*;

/// Result of input filter chain.
#[derive(Debug)]
pub enum InputDecision {
    /// Action is allowed to proceed. Contains redacted content for LLM display.
    Allowed { redacted_content: String },
    /// Action needs user approval. Contains redacted content for the approval prompt.
    NeedsApproval {
        redacted_content: String,
        prompt_message: String,
    },
    /// Action is hard-denied by policy.
    Denied(String),
}

/// Result of output filter chain.
#[derive(Debug)]
pub struct OutputResult {
    /// Content with secrets redacted.
    pub content: String,
    /// If prompt injection was detected, the warning message.
    pub injection_warning: Option<String>,
}

/// The complete guardrail pipeline orchestrating all filters.
pub struct GuardrailPipeline {
    trust_gate: TrustGate,
    data_redactor: DataRedactor,
    policy_enforcer: PolicyEnforcer,
    output_scanner: OutputScanner,
    prompt_shield: PromptShield,
    trust_state: Arc<Mutex<TrustState>>,
}

impl GuardrailPipeline {
    pub fn new(agent_id: &str, trust_state_path: Option<PathBuf>) -> Self {
        let trust_state = match trust_state_path {
            Some(ref p) => TrustState::load_or_default(p, agent_id),
            None => TrustState::new(agent_id),
        };
        let trust_state = Arc::new(Mutex::new(trust_state));

        let registry = Arc::new(PatternRegistry::default());

        Self {
            trust_gate: TrustGate::new(trust_state.clone()),
            data_redactor: DataRedactor::new(registry.clone()),
            policy_enforcer: PolicyEnforcer::default(),
            output_scanner: OutputScanner::new(registry),
            prompt_shield: PromptShield::default(),
            trust_state,
        }
    }

    /// Run input filters: PolicyEnforcer check → DataRedactor → TrustGate.
    ///
    /// Order:
    /// 1. PolicyEnforcer: hard deny/allow rules (always-deny blocks immediately; always-allow bypasses TrustGate)
    /// 2. DataRedactor: redact secrets for display in approval prompt
    /// 3. TrustGate: check trust level, prompt if needed
    pub fn check_input(&self, action: &GuardrailAction) -> InputDecision {
        // 1. PolicyEnforcer — check hard rules first
        let policy_decision = self.policy_enforcer.check(action);
        match &policy_decision {
            FilterDecision::Deny(reason) => return InputDecision::Denied(reason.clone()),
            FilterDecision::Allow => {
                // Check if this is an always-allow (has explicit allow rule)
                if self.is_explicitly_allowed(action) {
                    let redacted = self.data_redactor.redact(&action.raw_content);
                    return InputDecision::Allowed { redacted_content: redacted };
                }
            }
            _ => {}
        }

        // 2. DataRedactor — redact secrets for display
        let redacted_content = self.data_redactor.redact(&action.raw_content);

        // 3. TrustGate — check trust level
        match self.trust_gate.check(action) {
            FilterDecision::Allow => InputDecision::Allowed { redacted_content },
            FilterDecision::NeedsApproval(msg) => InputDecision::NeedsApproval {
                redacted_content,
                prompt_message: msg,
            },
            FilterDecision::Deny(reason) => InputDecision::Denied(reason),
            _ => InputDecision::Allowed { redacted_content },
        }
    }

    /// Run output filters: OutputScanner → PromptShield.
    pub fn check_output(&self, output: &str, source: &SourceTag) -> OutputResult {
        // 1. OutputScanner — redact secrets
        let content = self.output_scanner.scan(output);

        // 2. PromptShield — detect injection in external content
        let injection_warning = match self.prompt_shield.filter(&content, source) {
            FilterDecision::NeedsApproval(msg) | FilterDecision::Flagged(msg) => Some(msg),
            _ => None,
        };

        OutputResult {
            content,
            injection_warning,
        }
    }

    /// Record user's approval/denial decision and update trust state.
    pub fn record_decision(&self, action: &GuardrailAction, approved: bool) {
        self.trust_gate.record_user_decision(action, approved);
    }

    /// Check if the system should suggest promoting a category.
    pub fn should_suggest_promotion(&self, category: ActionCategory) -> bool {
        self.trust_gate.should_suggest_promotion(category)
    }

    /// Get a reference to the trust state for persistence.
    pub fn trust_state(&self) -> Arc<Mutex<TrustState>> {
        self.trust_state.clone()
    }

    /// Check if an action matches an always-allow rule in PolicyEnforcer.
    fn is_explicitly_allowed(&self, action: &GuardrailAction) -> bool {
        if let Some(rules) = self.policy_enforcer.allow_rules().get(&action.category) {
            use super::glob::glob_match;
            return rules.iter().any(|r| glob_match(r, &action.description));
        }
        false
    }
}
