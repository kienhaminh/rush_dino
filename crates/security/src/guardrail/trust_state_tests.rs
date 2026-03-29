use super::trust_state::*;
use super::types::{ActionCategory, TrustLevel};
use tempfile::TempDir;

#[test]
fn new_trust_state_defaults_to_l0() {
    let state = TrustState::new("agent-1");
    assert_eq!(state.level(ActionCategory::Bash), TrustLevel::Untrusted);
    assert_eq!(state.level(ActionCategory::Network), TrustLevel::Untrusted);
    assert_eq!(state.level(ActionCategory::FsRead), TrustLevel::Untrusted);
    assert_eq!(state.level(ActionCategory::FsWrite), TrustLevel::Untrusted);
}

#[test]
fn record_approval_increments_counter() {
    let mut state = TrustState::new("agent-1");
    state.record_approval(ActionCategory::Bash);
    assert_eq!(state.consecutive_approvals(ActionCategory::Bash), 1);
    state.record_approval(ActionCategory::Bash);
    assert_eq!(state.consecutive_approvals(ActionCategory::Bash), 2);
}

#[test]
fn record_denial_resets_counter_and_demotes() {
    let mut state = TrustState::new("agent-1");
    state.set_level(ActionCategory::Bash, TrustLevel::Supervised);
    state.record_approval(ActionCategory::Bash);
    state.record_approval(ActionCategory::Bash);

    state.record_denial(ActionCategory::Bash);

    assert_eq!(state.level(ActionCategory::Bash), TrustLevel::Untrusted);
    assert_eq!(state.consecutive_approvals(ActionCategory::Bash), 0);
}

#[test]
fn denial_at_l0_stays_at_l0() {
    let mut state = TrustState::new("agent-1");
    state.record_denial(ActionCategory::Bash);
    assert_eq!(state.level(ActionCategory::Bash), TrustLevel::Untrusted);
}

#[test]
fn should_suggest_promotion_after_threshold() {
    let mut state = TrustState::new("agent-1");
    for _ in 0..5 {
        state.record_approval(ActionCategory::Bash);
    }
    assert!(state.should_suggest_promotion(ActionCategory::Bash));
}

#[test]
fn no_promotion_suggestion_below_threshold() {
    let mut state = TrustState::new("agent-1");
    for _ in 0..4 {
        state.record_approval(ActionCategory::Bash);
    }
    assert!(!state.should_suggest_promotion(ActionCategory::Bash));
}

#[test]
fn l1_promotion_threshold_is_10() {
    let mut state = TrustState::new("agent-1");
    state.set_level(ActionCategory::Network, TrustLevel::Supervised);
    for _ in 0..9 {
        state.record_approval(ActionCategory::Network);
    }
    assert!(!state.should_suggest_promotion(ActionCategory::Network));
    state.record_approval(ActionCategory::Network);
    assert!(state.should_suggest_promotion(ActionCategory::Network));
}

#[test]
fn no_promotion_from_l2() {
    let mut state = TrustState::new("agent-1");
    state.set_level(ActionCategory::Bash, TrustLevel::Trusted);
    for _ in 0..20 {
        state.record_approval(ActionCategory::Bash);
    }
    assert!(!state.should_suggest_promotion(ActionCategory::Bash));
}

#[test]
fn add_and_match_pattern() {
    let mut state = TrustState::new("agent-1");
    state.add_pattern(ActionCategory::Bash, "git *".to_string());
    assert!(state.matches_pattern(ActionCategory::Bash, "git status"));
    assert!(state.matches_pattern(ActionCategory::Bash, "git push origin main"));
    assert!(!state.matches_pattern(ActionCategory::Bash, "npm install"));
}

#[test]
fn set_level_manually() {
    let mut state = TrustState::new("agent-1");
    state.set_level(ActionCategory::Network, TrustLevel::Trusted);
    assert_eq!(state.level(ActionCategory::Network), TrustLevel::Trusted);
}

#[test]
fn save_and_load_roundtrip() {
    let dir = TempDir::new().unwrap();
    let path = dir.path().join("trust.json");

    let mut state = TrustState::new("agent-1");
    state.set_level(ActionCategory::Bash, TrustLevel::Supervised);
    state.add_pattern(ActionCategory::Bash, "git *".to_string());
    state.record_approval(ActionCategory::Bash);
    state.save(&path).unwrap();

    let loaded = TrustState::load(&path).unwrap();
    assert_eq!(loaded.level(ActionCategory::Bash), TrustLevel::Supervised);
    assert_eq!(loaded.consecutive_approvals(ActionCategory::Bash), 1);
    assert!(loaded.matches_pattern(ActionCategory::Bash, "git status"));
}
