use std::path::PathBuf;

use axum::{extract::State, Json};
use serde::Deserialize;
use walkdir::WalkDir;

use rushdino_common::Result;

use crate::state::AppState;

#[derive(Debug, Deserialize)]
pub struct IngestRequest {
    pub path: Option<String>,
}

pub async fn ingest_documents(
    State(state): State<AppState>,
    Json(request): Json<IngestRequest>,
) -> Result<Json<serde_json::Value>> {
    let root = request
        .path
        .map(PathBuf::from)
        .unwrap_or_else(|| state.config.data_dir.join("documents"));

    let mut scanned = 0_u32;
    let mut failed = 0_u32;
    for entry in WalkDir::new(root).into_iter() {
        match entry {
            Ok(e) if e.file_type().is_file() => scanned += 1,
            Ok(_) => {}
            Err(_) => failed += 1,
        }
    }

    Ok(Json(serde_json::json!({
        "scanned": scanned,
        "failed": failed,
        "ingested": scanned.saturating_sub(failed),
    })))
}
