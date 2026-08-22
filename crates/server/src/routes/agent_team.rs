//! Operator team HQ routes: persist teammates, assign work, and hand off tasks.

use axum::{extract::Path, extract::State, Json};
use serde::{Deserialize, Serialize};

use rushdino_agent::{AssignWorkInput, AssignmentRecord, HandoffInput, PersistTeammateInput};
use rushdino_common::{AppError, Result};

use crate::routes::agents::{agent_to_list_item, agent_workspace, AgentListItem};
use crate::state::AppState;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistTeammateRequest {
    pub name: String,
    pub description: String,
    #[serde(default)]
    pub system_prompt: String,
    pub icon: Option<String>,
    pub tools: Option<String>,
    pub skills: Option<String>,
    pub inbox_enabled: Option<bool>,
    pub claims_tasks: Option<bool>,
    #[serde(default)]
    pub claim_tags: Vec<String>,
    #[serde(default)]
    pub data_capable: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssignWorkRequest {
    pub message: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HandoffRequest {
    pub to: String,
    pub message: String,
    pub from: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssignmentResponse {
    pub assignment_id: String,
    pub agent_id: String,
    pub agent_name: String,
    pub conversation_id: String,
    pub from: String,
    pub to: String,
    pub message: String,
}

impl From<AssignmentRecord> for AssignmentResponse {
    fn from(record: AssignmentRecord) -> Self {
        Self {
            assignment_id: record.assignment_id,
            agent_id: record.agent_id,
            agent_name: record.agent_name,
            conversation_id: record.conversation_id,
            from: record.from,
            to: record.to,
            message: record.message,
        }
    }
}

/// POST /api/agents — create or update a named teammate on this machine.
pub async fn persist_agent(
    State(state): State<AppState>,
    Json(payload): Json<PersistTeammateRequest>,
) -> Result<Json<AgentListItem>> {
    let engine = state.engine()?;
    let config = state.config();
    let template = engine.persist_teammate(PersistTeammateInput {
        name: payload.name,
        description: payload.description,
        system_prompt: payload.system_prompt,
        icon: payload.icon,
        tools: payload.tools,
        skills: payload.skills,
        inbox_enabled: payload.inbox_enabled,
        claims_tasks: payload.claims_tasks,
        claim_tags: payload.claim_tags,
        data_capable: payload.data_capable,
    })?;
    let workspace = agent_workspace(&config.data_dir.join("agents"), &template.name);
    Ok(Json(agent_to_list_item(template, workspace, false)))
}

/// POST /api/agents/:id/assign — persist work targeted at a named teammate.
pub async fn assign_agent_work(
    Path(id): Path<String>,
    State(state): State<AppState>,
    Json(payload): Json<AssignWorkRequest>,
) -> Result<Json<AssignmentResponse>> {
    let engine = state.engine()?;
    if id.trim().is_empty() {
        return Err(AppError::Validation("invalid agent id".to_owned()));
    }
    let record = engine
        .assign_work_to_agent(AssignWorkInput {
            agent_id: id,
            message: payload.message,
        })
        .await?;
    Ok(Json(AssignmentResponse::from(record)))
}

/// POST /api/agents/:id/handoff — persist a sender→receiver handoff.
pub async fn handoff_agent_work(
    Path(id): Path<String>,
    State(state): State<AppState>,
    Json(payload): Json<HandoffRequest>,
) -> Result<Json<rushdino_agent::AgentMessage>> {
    let engine = state.engine()?;
    let from = payload
        .from
        .filter(|value| !value.trim().is_empty())
        .unwrap_or(id);
    let record = engine
        .handoff_between_agents(HandoffInput {
            from,
            to: payload.to,
            message: payload.message,
        })
        .await?;
    Ok(Json(record))
}
