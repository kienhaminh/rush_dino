use axum::{
    extract::{Path, Query, State},
    Json,
};
use serde::Deserialize;

use rushdino_common::Result;
use rushdino_skill_graph::{EdgeOrigin, EdgeType, NodeType};

use crate::state::AppState;

#[derive(Debug, Deserialize)]
pub struct SkillQueryParams {
    pub q: Option<String>,
    pub limit: Option<usize>,
}

#[derive(Debug, Deserialize)]
pub struct UpsertNodeRequest {
    pub name: String,
    pub node_type: String,
    pub description: Option<String>,
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
pub struct UpsertEdgeRequest {
    pub source_id: String,
    pub target_id: String,
    pub edge_type: String,
    pub weight: Option<f64>,
    pub origin: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct AssignCategoryRequest {
    pub skill_name: String,
    pub category_name: String,
}

pub async fn get_graph(State(state): State<AppState>) -> Result<Json<serde_json::Value>> {
    let graph = state.skill_graph().get_graph().await?;
    Ok(Json(serde_json::json!(graph)))
}

pub async fn query_skills(
    State(state): State<AppState>,
    Query(params): Query<SkillQueryParams>,
) -> Result<Json<serde_json::Value>> {
    let q = params.q.unwrap_or_default();
    let limit = params.limit.unwrap_or(5).clamp(1, 20);
    let results = state.skill_graph().query_top_skills(&q, limit).await?;
    Ok(Json(serde_json::json!({ "items": results })))
}

pub async fn upsert_node(
    State(state): State<AppState>,
    Json(body): Json<UpsertNodeRequest>,
) -> Result<Json<serde_json::Value>> {
    let node_type = NodeType::from_str(&body.node_type).ok_or_else(|| {
        rushdino_common::AppError::Validation(format!("invalid node_type: {}", body.node_type))
    })?;
    let node = state
        .skill_graph()
        .upsert_node(
            &body.name,
            node_type,
            body.description.as_deref().unwrap_or(""),
            &body.tags.unwrap_or_default(),
        )
        .await?;
    Ok(Json(serde_json::json!(node)))
}

pub async fn delete_node(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>> {
    state.skill_graph().delete_node(&id).await?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

pub async fn upsert_edge(
    State(state): State<AppState>,
    Json(body): Json<UpsertEdgeRequest>,
) -> Result<Json<serde_json::Value>> {
    let edge_type = EdgeType::from_str(&body.edge_type).ok_or_else(|| {
        rushdino_common::AppError::Validation(format!("invalid edge_type: {}", body.edge_type))
    })?;
    let origin = body
        .origin
        .as_deref()
        .and_then(EdgeOrigin::from_str)
        .unwrap_or(EdgeOrigin::Manual);
    let id = state
        .skill_graph()
        .upsert_edge(
            &body.source_id,
            &body.target_id,
            edge_type,
            body.weight.unwrap_or(1.0),
            origin,
        )
        .await?;
    Ok(Json(serde_json::json!({ "id": id })))
}

pub async fn delete_edge(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>> {
    state.skill_graph().delete_edge(&id).await?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

pub async fn assign_category(
    State(state): State<AppState>,
    Json(body): Json<AssignCategoryRequest>,
) -> Result<Json<serde_json::Value>> {
    state
        .skill_graph()
        .assign_category(&body.skill_name, &body.category_name)
        .await?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

pub async fn reseed(State(state): State<AppState>) -> Result<Json<serde_json::Value>> {
    state.skill_graph().reseed().await?;
    Ok(Json(serde_json::json!({ "ok": true })))
}
