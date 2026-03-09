use std::{fs, path::Path};

use axum::{extract::State, Json};
use chrono::{DateTime, Utc};
use serde::Serialize;

use rushdino_common::Result;

use crate::state::AppState;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SoulMemoryFile {
    pub name: String,
    pub path: String,
    pub exists: bool,
    pub updated_at: Option<String>,
    pub size_bytes: u64,
    pub line_count: usize,
    pub content: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SoulMemoryStateResponse {
    pub data_dir: String,
    pub soul: SoulMemoryFile,
    pub memory: SoulMemoryFile,
    pub identity_files: Vec<SoulMemoryFile>,
    pub daily_files: Vec<SoulMemoryFile>,
}

pub async fn get_soul_memory_state(
    State(state): State<AppState>,
) -> Result<Json<SoulMemoryStateResponse>> {
    let data_dir = state.config().data_dir.clone();

    let soul = read_file_snapshot(&data_dir.join("SOUL.md"), "SOUL.md")?;
    let memory = read_memory_snapshot(&data_dir)?;

    let identity_files = ["IDENTITY.md", "USER.md", "AGENTS.md", "TOOLS.md", "HEARTBEAT.md"]
        .into_iter()
        .map(|name| read_file_snapshot(&data_dir.join(name), name))
        .collect::<Result<Vec<_>>>()?;

    let mut daily_files = fs::read_dir(data_dir.join("memory").join("daily"))?
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.path())
        .filter(|path| path.extension().and_then(|ext| ext.to_str()) == Some("md"))
        .map(|path| {
            let label = path
                .strip_prefix(&data_dir)
                .ok()
                .map(|relative| relative.display().to_string())
                .unwrap_or_else(|| path.display().to_string());
            read_file_snapshot(&path, &label)
        })
        .collect::<Result<Vec<_>>>()?;

    daily_files.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));

    Ok(Json(SoulMemoryStateResponse {
        data_dir: data_dir.display().to_string(),
        soul,
        memory,
        identity_files,
        daily_files,
    }))
}

fn read_file_snapshot(path: &Path, label: &str) -> Result<SoulMemoryFile> {
    if !path.exists() {
        return Ok(SoulMemoryFile {
            name: label.to_owned(),
            path: path.display().to_string(),
            exists: false,
            updated_at: None,
            size_bytes: 0,
            line_count: 0,
            content: String::new(),
        });
    }

    let metadata = fs::metadata(path)?;
    let updated_at = metadata
        .modified()
        .ok()
        .map(DateTime::<Utc>::from)
        .map(|dt| dt.to_rfc3339());
    let content = fs::read_to_string(path)?;
    let line_count = content.lines().count();

    Ok(SoulMemoryFile {
        name: label.to_owned(),
        path: path.display().to_string(),
        exists: true,
        updated_at,
        size_bytes: metadata.len(),
        line_count,
        content,
    })
}

fn read_memory_snapshot(data_dir: &Path) -> Result<SoulMemoryFile> {
    let canonical = data_dir.join("MEMORY.md");
    if canonical.exists() {
        return read_file_snapshot(&canonical, "MEMORY.md");
    }

    read_file_snapshot(&data_dir.join("memory").join("MEMORY.md"), "MEMORY.md")
}
