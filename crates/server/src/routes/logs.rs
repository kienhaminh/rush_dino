use axum::{extract::Query, extract::State, Json};
use serde::{Deserialize, Serialize};

use rushdino_common::Result;

use crate::state::AppState;

const DEFAULT_LIMIT: usize = 100;
const MAX_LIMIT: usize = 1000;

#[derive(Debug, Deserialize)]
pub struct LogsQuery {
    pub level: Option<String>,
    pub q: Option<String>,
    pub limit: Option<usize>,
    pub cursor: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeLogView {
    pub id: String,
    pub level: String,
    pub target: String,
    pub message: String,
    pub fields: Option<serde_json::Value>,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogsResponse {
    pub items: Vec<RuntimeLogView>,
    pub next_cursor: Option<String>,
}

pub async fn get_logs(
    State(state): State<AppState>,
    Query(query): Query<LogsQuery>,
) -> Result<Json<LogsResponse>> {
    let limit = query.limit.unwrap_or(DEFAULT_LIMIT).clamp(1, MAX_LIMIT);
    let requested = i64::try_from(limit + 1).unwrap_or((MAX_LIMIT + 1) as i64);

    let (cursor_ts, cursor_id) = parse_cursor(query.cursor.as_deref());
    let rows = state
        .runtime_logs
        .list(
            query.level.as_deref(),
            query.q.as_deref(),
            cursor_ts,
            cursor_id,
            requested,
        )
        .await?;

    let has_more = rows.len() > limit;
    let page_rows = if has_more {
        &rows[..limit]
    } else {
        rows.as_slice()
    };
    let next_cursor = page_rows
        .last()
        .and_then(|last| has_more.then(|| format!("{}|{}", last.created_at, last.id)));

    let items = page_rows
        .iter()
        .map(|row| RuntimeLogView {
            id: row.id.clone(),
            level: row.level.clone(),
            target: row.target.clone(),
            message: row.message.clone(),
            fields: row
                .fields
                .as_ref()
                .and_then(|raw| serde_json::from_str(raw).ok()),
            created_at: row.created_at.clone(),
        })
        .collect();

    Ok(Json(LogsResponse { items, next_cursor }))
}

fn parse_cursor(cursor: Option<&str>) -> (Option<&str>, Option<&str>) {
    let Some(cursor) = cursor else {
        return (None, None);
    };
    if let Some((ts, id)) = cursor.split_once('|') {
        return (Some(ts), Some(id));
    }
    (None, None)
}
