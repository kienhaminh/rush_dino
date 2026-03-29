use std::sync::{Arc, Mutex};

use super::trust_state::TrustState;
use super::types::*;

/// Input filter that checks trust level and decides whether to prompt the user.
pub struct TrustGate {
    state: Arc<Mutex<TrustState>>,
}

impl TrustGate {
    pub fn new(state: Arc<Mutex<TrustState>>) -> Self {
        Self { state }
    }

    /// Check whether this action should proceed, need approval, or be denied.
    pub fn check(&self, action: &GuardrailAction) -> FilterDecision {
        let state = self.state.lock().unwrap();
        let level = state.level(action.category);

        match level {
            TrustLevel::Trusted => FilterDecision::Allow,
            TrustLevel::Supervised => {
                if state.matches_pattern(action.category, &action.description) {
                    FilterDecision::Allow
                } else {
                    FilterDecision::NeedsApproval(format!(
                        "[{}] New pattern: {}",
                        category_label(action.category),
                        action.description
                    ))
                }
            }
            TrustLevel::Untrusted => FilterDecision::NeedsApproval(format!(
                "[{}] {}",
                category_label(action.category),
                action.description
            )),
        }
    }

    /// Record the user's approval or denial decision.
    pub fn record_user_decision(&self, action: &GuardrailAction, approved: bool) {
        let mut state = self.state.lock().unwrap();
        if approved {
            state.record_approval(action.category);
        } else {
            state.record_denial(action.category);
        }
    }

    /// Check if the system should suggest promoting this category.
    pub fn should_suggest_promotion(&self, category: ActionCategory) -> bool {
        let state = self.state.lock().unwrap();
        state.should_suggest_promotion(category)
    }
}

fn category_label(category: ActionCategory) -> &'static str {
    match category {
        ActionCategory::Bash => "bash",
        ActionCategory::Network => "network",
        ActionCategory::FsRead => "fs_read",
        ActionCategory::FsWrite => "fs_write",
    }
}
