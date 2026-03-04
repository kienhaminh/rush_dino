use axum::{extract::{Path, Query, State}, Json};
use serde::Deserialize;

use rushdino_common::{AppError, Result};

use crate::state::AppState;

#[derive(Debug, Deserialize)]
pub struct SearchQuery {
    pub q: Option<String>,
    pub limit: Option<usize>,
}

#[derive(Debug, Deserialize)]
pub struct FactsQuery {
    pub q: Option<String>,
    pub conversation_id: Option<String>,
    pub limit: Option<usize>,
    pub hops: Option<u8>,
}

#[derive(Debug, Deserialize)]
pub struct NodeQuery {
    pub limit: Option<usize>,
}

pub async fn search(
    State(state): State<AppState>,
    Query(query): Query<SearchQuery>,
) -> Result<Json<serde_json::Value>> {
    let service = state
        .knowledge_graph
        .as_ref()
        .ok_or_else(|| AppError::Validation("knowledge graph is disabled".to_owned()))?;
    let q = query.q.unwrap_or_default();
    let limit = query.limit.unwrap_or(20).clamp(1, 100);
    let items = service.search(&q, limit).await?;
    Ok(Json(serde_json::json!({ "items": items })))
}

pub async fn facts(
    State(state): State<AppState>,
    Query(query): Query<FactsQuery>,
) -> Result<Json<serde_json::Value>> {
    let service = state
        .knowledge_graph
        .as_ref()
        .ok_or_else(|| AppError::Validation("knowledge graph is disabled".to_owned()))?;
    let q = query.q.unwrap_or_default();
    let limit = query.limit.unwrap_or(20).clamp(1, 100);
    let _conversation_id = query.conversation_id;
    let _hops = query.hops.unwrap_or(1).clamp(1, 2);
    let items = service.facts(&q, limit).await?;
    Ok(Json(serde_json::json!({ "items": items })))
}

pub async fn node(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Query(query): Query<NodeQuery>,
) -> Result<Json<serde_json::Value>> {
    let service = state
        .knowledge_graph
        .as_ref()
        .ok_or_else(|| AppError::Validation("knowledge graph is disabled".to_owned()))?;
    let limit = query.limit.unwrap_or(20).clamp(1, 100);
    let item = service.node(&id, limit).await?;
    Ok(Json(serde_json::json!({ "item": item })))
}

pub async fn stats(State(state): State<AppState>) -> Result<Json<serde_json::Value>> {
    let service = state
        .knowledge_graph
        .as_ref()
        .ok_or_else(|| AppError::Validation("knowledge graph is disabled".to_owned()))?;
    let stats = service.stats().await?;
    Ok(Json(serde_json::json!(stats)))
}

pub async fn backfill(State(state): State<AppState>) -> Result<Json<serde_json::Value>> {
    let service = state
        .knowledge_graph
        .as_ref()
        .ok_or_else(|| AppError::Validation("knowledge graph is disabled".to_owned()))?;
    let result = service.run_backfill().await?;
    Ok(Json(serde_json::json!(result)))
}
