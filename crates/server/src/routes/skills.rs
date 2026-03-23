use axum::{
    extract::{Path, State},
    Json,
};
use serde::{Deserialize, Serialize};

use rushdino_agent::Skill;
use rushdino_common::{AppError, Result};

use crate::state::AppState;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillRecord {
    pub name: String,
    pub description: String,
    pub instructions: String,
    pub path: String,
    pub tools: Vec<String>,
    /// Bundled / system skills — not editable or deletable via the dashboard API.
    pub is_built_in: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillsListResponse {
    pub items: Vec<SkillRecord>,
}

#[derive(Debug, Deserialize)]
pub struct UpsertSkillRequest {
    pub name: String,
    pub description: String,
    pub instructions: String,
    pub tools: Option<Vec<String>>,
}

pub async fn list_skills(State(state): State<AppState>) -> Result<Json<SkillsListResponse>> {
    let engine = state.engine()?;
    let config = state.config();
    let mut items = engine
        .list_skills()?
        .into_iter()
        .map(|skill| map_skill(config.as_ref(), skill))
        .collect::<Vec<_>>();
    items.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(Json(SkillsListResponse { items }))
}

pub async fn upsert_skill(
    State(state): State<AppState>,
    Json(payload): Json<UpsertSkillRequest>,
) -> Result<Json<SkillRecord>> {
    if is_built_in_skill_name(&payload.name) {
        return Err(AppError::Validation(format!(
            "cannot modify built-in skill {:?}",
            payload.name
        )));
    }
    let engine = state.engine()?;
    let config = state.config();
    let skill = Skill {
        name: payload.name,
        description: payload.description,
        instructions: payload.instructions,
        tools: payload.tools,
        category: None,
        tags: None,
    };
    engine.save_skill(&skill)?;

    // Sync skill description to the skill graph
    let sg = state.skill_graph().clone();
    let skill_name = skill.name.clone();
    let skill_desc = skill.description.clone();
    tokio::spawn(async move {
        if let Err(err) = sg.sync_skill_description(&skill_name, &skill_desc).await {
            tracing::warn!("failed to sync skill to graph: {err}");
        }
    });

    Ok(Json(map_skill(config.as_ref(), skill)))
}

pub async fn delete_skill(
    Path(name): Path<String>,
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>> {
    if name.is_empty() {
        return Err(AppError::Validation("invalid skill name".to_owned()));
    }
    if is_built_in_skill_name(&name) {
        return Err(AppError::Validation(format!(
            "cannot delete built-in skill {:?}",
            name
        )));
    }
    let engine = state.engine()?;
    engine.delete_skill(&name)?;

    // Remove from skill graph
    let sg = state.skill_graph().clone();
    let skill_name = name.clone();
    tokio::spawn(async move {
        if let Err(err) = sg.delete_skill_node(&skill_name).await {
            tracing::warn!("failed to remove skill from graph: {err}");
        }
    });

    Ok(Json(serde_json::json!({ "deleted": true, "name": name })))
}

/// Built-in skills are those shipped under `rushdino_common::skills::SKILL_PATHS` (top-level folder
/// per entry), plus explicit system skills like `image-generator`.
pub fn is_built_in_skill_name(name: &str) -> bool {
    if name == "image-generator" {
        return true;
    }
    rushdino_common::skills::SKILL_PATHS
        .iter()
        .any(|rel| rel.split('/').next() == Some(name))
}

fn map_skill(config: &rushdino_common::AppConfig, skill: Skill) -> SkillRecord {
    let is_built_in = is_built_in_skill_name(&skill.name);
    SkillRecord {
        path: config
            .data_dir
            .join("skills")
            .join(format!("{}.toml", skill.name))
            .display()
            .to_string(),
        name: skill.name,
        description: skill.description,
        instructions: skill.instructions,
        tools: skill.tools.unwrap_or_default(),
        is_built_in,
    }
}
