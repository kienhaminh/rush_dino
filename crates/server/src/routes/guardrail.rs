use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};

use crate::state::AppState;
use rushdino_security::guardrail::types::{ActionCategory, TrustLevel};

#[derive(Serialize)]
pub struct TrustLevelResponse {
    pub agent_id: String,
    pub trust_levels: Vec<CategoryTrustInfo>,
}

#[derive(Serialize)]
pub struct CategoryTrustInfo {
    pub category: ActionCategory,
    pub level: TrustLevel,
    pub consecutive_approvals: u32,
    pub approved_patterns: Vec<String>,
}

#[derive(Deserialize)]
pub struct SetTrustLevelRequest {
    pub category: ActionCategory,
    pub level: TrustLevel,
}

#[derive(Deserialize)]
pub struct AddPatternRequest {
    pub category: ActionCategory,
    pub pattern: String,
}

#[derive(Serialize)]
pub struct PolicyRulesResponse {
    pub deny_rules: Vec<CategoryRules>,
    pub allow_rules: Vec<CategoryRules>,
}

#[derive(Serialize, Deserialize)]
pub struct CategoryRules {
    pub category: ActionCategory,
    pub patterns: Vec<String>,
}

#[derive(Deserialize)]
pub struct AddRuleRequest {
    /// "deny" or "allow"
    pub rule_type: String,
    pub category: ActionCategory,
    pub pattern: String,
}

#[derive(Deserialize)]
pub struct ApprovalDecisionRequest {
    pub request_id: String,
    pub approved: bool,
}

/// GET /api/agents/:agent_id/guardrail/trust
pub async fn get_trust_levels(
    State(_state): State<AppState>,
    Path(_agent_id): Path<String>,
) -> Result<Json<TrustLevelResponse>, StatusCode> {
    // TODO(Task 10 AppState integration): load trust state from guardrail registry
    todo!("Implement after AppState integration")
}

/// PUT /api/agents/:agent_id/guardrail/trust
pub async fn set_trust_level(
    State(_state): State<AppState>,
    Path(_agent_id): Path<String>,
    Json(_body): Json<SetTrustLevelRequest>,
) -> Result<StatusCode, StatusCode> {
    // TODO(Task 10 AppState integration): set trust level for category
    todo!("Implement after AppState integration")
}

/// GET /api/agents/:agent_id/guardrail/policy
pub async fn get_policy_rules(
    State(_state): State<AppState>,
    Path(_agent_id): Path<String>,
) -> Result<Json<PolicyRulesResponse>, StatusCode> {
    // TODO(Task 10 AppState integration): return deny/allow rules for agent
    todo!("Implement after AppState integration")
}

/// POST /api/agents/:agent_id/guardrail/policy/rule
pub async fn add_policy_rule(
    State(_state): State<AppState>,
    Path(_agent_id): Path<String>,
    Json(_body): Json<AddRuleRequest>,
) -> Result<StatusCode, StatusCode> {
    // TODO(Task 10 AppState integration): add deny or allow rule
    todo!("Implement after AppState integration")
}

/// POST /api/sessions/:session_id/guardrail/approve
///
/// Resolves a pending approval request from GuardrailBroker.
pub async fn approve_action(
    State(_state): State<AppState>,
    Path(_session_id): Path<String>,
    Json(_body): Json<ApprovalDecisionRequest>,
) -> Result<StatusCode, StatusCode> {
    // TODO(Task 10 AppState integration): call guardrail_broker.resolve_approval(request_id, approved)
    todo!("Implement after AppState integration")
}
