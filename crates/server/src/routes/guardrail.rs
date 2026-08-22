// Guardrail management API routes — trust level read/write, policy rule management,
// and approval resolution for pending GuardrailBroker requests.
//
// All handlers use `State<AppState>` and will access `state.guardrail_registry`
// once AppState integration is complete (deferred from this task).

use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};

use crate::state::AppState;
use rushdino_security::guardrail::types::{ActionCategory, TrustLevel};

const ALL_CATEGORIES: [ActionCategory; 4] = [
    ActionCategory::Bash,
    ActionCategory::Network,
    ActionCategory::FsRead,
    ActionCategory::FsWrite,
];

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
#[serde(rename_all = "snake_case")]
pub enum RuleType {
    Deny,
    Allow,
}

#[derive(Deserialize)]
pub struct AddRuleRequest {
    pub rule_type: RuleType,
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
    State(state): State<AppState>,
    Path(agent_id): Path<String>,
) -> Result<Json<TrustLevelResponse>, StatusCode> {
    let ts_arc = state
        .guardrail_registry
        .get_or_init_agent_state(&agent_id)
        .await;
    // Recover from a poisoned mutex rather than propagating a panic to the request handler.
    let ts = ts_arc.lock().unwrap_or_else(|e| e.into_inner());

    let trust_levels = ALL_CATEGORIES
        .iter()
        .map(|&cat| CategoryTrustInfo {
            category: cat,
            level: ts.level(cat),
            consecutive_approvals: ts.consecutive_approvals(cat),
            approved_patterns: ts.approved_patterns(cat),
        })
        .collect();

    Ok(Json(TrustLevelResponse {
        agent_id,
        trust_levels,
    }))
}

/// PUT /api/agents/:agent_id/guardrail/trust
pub async fn set_trust_level(
    State(state): State<AppState>,
    Path(agent_id): Path<String>,
    Json(body): Json<SetTrustLevelRequest>,
) -> Result<StatusCode, StatusCode> {
    let ts_arc = state
        .guardrail_registry
        .get_or_init_agent_state(&agent_id)
        .await;
    let mut ts = ts_arc.lock().unwrap_or_else(|e| e.into_inner());
    ts.set_level(body.category, body.level);
    Ok(StatusCode::NO_CONTENT)
}

/// GET /api/agents/:agent_id/guardrail/policy
pub async fn get_policy_rules(
    State(_state): State<AppState>,
    Path(_agent_id): Path<String>,
) -> Result<Json<PolicyRulesResponse>, StatusCode> {
    // Policy rule persistence is not yet wired — return empty lists.
    Ok(Json(PolicyRulesResponse {
        deny_rules: vec![],
        allow_rules: vec![],
    }))
}

/// POST /api/agents/:agent_id/guardrail/policy/rule
pub async fn add_policy_rule(
    State(_state): State<AppState>,
    Path(_agent_id): Path<String>,
    Json(_body): Json<AddRuleRequest>,
) -> Result<StatusCode, StatusCode> {
    // Policy rule mutation is not yet wired.
    Err(StatusCode::NOT_IMPLEMENTED)
}

/// POST /api/sessions/:session_id/guardrail/approve
///
/// Resolves a pending approval request from GuardrailBroker.
pub async fn approve_action(
    State(_state): State<AppState>,
    Path(_session_id): Path<String>,
    Json(_body): Json<ApprovalDecisionRequest>,
) -> Result<StatusCode, StatusCode> {
    // Approval resolution is not yet wired.
    Err(StatusCode::NOT_IMPLEMENTED)
}
