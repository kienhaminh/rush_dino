use std::path::PathBuf;

use axum::{extract::State, Json};
use serde::Deserialize;
use walkdir::WalkDir;

use rushdino_common::{AppError, Result};
use rushdino_knowledge_graph::is_supported_text_file;
use rushdino_security::validation::validate_path;

use crate::state::AppState;

#[derive(Debug, Deserialize)]
pub struct IngestRequest {
    pub path: Option<String>,
}

pub async fn ingest_documents(
    State(state): State<AppState>,
    Json(request): Json<IngestRequest>,
) -> Result<Json<serde_json::Value>> {
    let default_root = state.config.data_dir.join("documents");

    let root = request
        .path
        .as_deref()
        .map(PathBuf::from)
        .unwrap_or_else(|| default_root.clone());

    // Build the list of allowed roots from config, plus the default documents dir.
    let mut allowed_roots = state.config.security.allowed_read_roots.clone();
    if allowed_roots.is_empty() {
        allowed_roots.push(state.config.data_dir.clone());
    }

    // Validate the requested path to prevent path traversal attacks.
    let safe_root = validate_path(&root, &allowed_roots).map_err(|e| {
        tracing::warn!("document ingest path rejected: {e}");
        AppError::Validation(format!("forbidden path: {e}"))
    })?;

    let mut scanned = 0_u32;
    let mut failed = 0_u32;
    let mut ingested = 0_u32;
    let mut skipped = 0_u32;
    for entry in WalkDir::new(safe_root).into_iter() {
        match entry {
            Ok(e) if e.file_type().is_file() => {
                scanned += 1;
                if !is_supported_text_file(e.path()) {
                    skipped = skipped.saturating_add(1);
                    continue;
                }

                if let Some(kg) = &state.knowledge_graph {
                    match kg.ingest_document_file(e.path()).await {
                        Ok(result) => {
                            ingested = ingested.saturating_add(result.ingested);
                            skipped = skipped.saturating_add(result.skipped);
                            failed = failed.saturating_add(result.failed);
                        }
                        Err(err) => {
                            tracing::warn!(
                                "document ingest failed for {}: {err}",
                                e.path().display()
                            );
                            failed = failed.saturating_add(1);
                        }
                    }
                } else {
                    skipped = skipped.saturating_add(1);
                }
            }
            Ok(_) => {}
            Err(_) => failed += 1,
        }
    }

    Ok(Json(serde_json::json!({
        "scanned": scanned,
        "failed": failed,
        "ingested": ingested,
        "skipped": skipped,
    })))
}
