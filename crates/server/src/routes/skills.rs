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
    let engine = state.engine()?;
    let config = state.config();
    let skill = Skill {
        name: payload.name,
        description: payload.description,
        instructions: payload.instructions,
        tools: payload.tools,
    };
    engine.save_skill(&skill)?;
    Ok(Json(map_skill(config.as_ref(), skill)))
}

pub async fn delete_skill(
    Path(name): Path<String>,
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>> {
    if name.is_empty() {
        return Err(AppError::Validation("invalid skill name".to_owned()));
    }
    let engine = state.engine()?;
    engine.delete_skill(&name)?;
    Ok(Json(serde_json::json!({ "deleted": true, "name": name })))
}

fn map_skill(config: &rushdino_common::AppConfig, skill: Skill) -> SkillRecord {
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
    }
}
