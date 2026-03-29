use super::trust_gate::*;
use super::trust_state::TrustState;
use super::types::*;
use std::sync::{Arc, Mutex};

fn make_action(category: ActionCategory, description: &str) -> GuardrailAction {
    GuardrailAction {
        category,
        description: description.to_string(),
        raw_content: description.to_string(),
        source_tag: SourceTag::LocalFile,
        session_id: "session-1".to_string(),
        agent_id: "agent-1".to_string(),
    }
}

#[test]
fn l0_requires_approval() {
    let state = Arc::new(Mutex::new(TrustState::new("agent-1")));
    let gate = TrustGate::new(state);
    let action = make_action(ActionCategory::Bash, "rm -rf /tmp/test");
    let decision = gate.check(&action);
    assert!(matches!(decision, FilterDecision::NeedsApproval(_)));
}

#[test]
fn l2_auto_approves() {
    let state = Arc::new(Mutex::new(TrustState::new("agent-1")));
    {
        let mut s = state.lock().unwrap();
        s.set_level(ActionCategory::Bash, TrustLevel::Trusted);
    }
    let gate = TrustGate::new(state);
    let action = make_action(ActionCategory::Bash, "rm -rf /tmp/test");
    let decision = gate.check(&action);
    assert_eq!(decision, FilterDecision::Allow);
}

#[test]
fn l1_auto_approves_matching_pattern() {
    let state = Arc::new(Mutex::new(TrustState::new("agent-1")));
    {
        let mut s = state.lock().unwrap();
        s.set_level(ActionCategory::Bash, TrustLevel::Supervised);
        s.add_pattern(ActionCategory::Bash, "git *".to_string());
    }
    let gate = TrustGate::new(state);
    let action = make_action(ActionCategory::Bash, "git status");
    let decision = gate.check(&action);
    assert_eq!(decision, FilterDecision::Allow);
}

#[test]
fn l1_requires_approval_for_unknown_pattern() {
    let state = Arc::new(Mutex::new(TrustState::new("agent-1")));
    {
        let mut s = state.lock().unwrap();
        s.set_level(ActionCategory::Bash, TrustLevel::Supervised);
        s.add_pattern(ActionCategory::Bash, "git *".to_string());
    }
    let gate = TrustGate::new(state);
    let action = make_action(ActionCategory::Bash, "npm install");
    let decision = gate.check(&action);
    assert!(matches!(decision, FilterDecision::NeedsApproval(_)));
}

#[test]
fn records_approval_in_state() {
    let state = Arc::new(Mutex::new(TrustState::new("agent-1")));
    let gate = TrustGate::new(state.clone());
    let action = make_action(ActionCategory::Bash, "git status");
    gate.record_user_decision(&action, true);
    let s = state.lock().unwrap();
    assert_eq!(s.consecutive_approvals(ActionCategory::Bash), 1);
}

#[test]
fn records_denial_in_state() {
    let state = Arc::new(Mutex::new(TrustState::new("agent-1")));
    {
        let mut s = state.lock().unwrap();
        s.set_level(ActionCategory::Bash, TrustLevel::Supervised);
    }
    let gate = TrustGate::new(state.clone());
    let action = make_action(ActionCategory::Bash, "bad-command");
    gate.record_user_decision(&action, false);
    let s = state.lock().unwrap();
    assert_eq!(s.level(ActionCategory::Bash), TrustLevel::Untrusted);
}
