use std::{fs, path::Path};

use axum::{extract::State, Json};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use rushdino_agent::engine_bootstrap::system_message;
use rushdino_agent::engine_deps::CORE_TOOLS;
use rushdino_agent::memory_bootstrap::{build_bootstrap_context, build_truncation_warning_lines};
use rushdino_agent::system_prompt::SkillEntry;
use rushdino_common::{AppError, Result};

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

/// A single context file as actually injected into the system prompt (post-truncation).
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InjectedContextFile {
    pub label: String,
    pub content: String,
    pub truncated: bool,
    pub original_len: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SoulMemoryStateResponse {
    pub data_dir: String,
    pub bootstrap: SoulMemoryFile,
    pub soul: SoulMemoryFile,
    pub memory: SoulMemoryFile,
    pub identity_files: Vec<SoulMemoryFile>,
    pub daily_files: Vec<SoulMemoryFile>,
    /// Files as actually injected into the system prompt (truncation applied).
    pub injected_context: Vec<InjectedContextFile>,
    pub truncation_warnings: Vec<String>,
}

pub async fn get_soul_memory_state(
    State(state): State<AppState>,
) -> Result<Json<SoulMemoryStateResponse>> {
    let data_dir = state.config().data_dir.clone();

    let bootstrap = read_file_snapshot(&data_dir.join("BOOTSTRAP.md"), "BOOTSTRAP.md")?;
    let soul = read_file_snapshot(&data_dir.join("SOUL.md"), "SOUL.md")?;
    let memory = read_memory_snapshot(&data_dir)?;

    let identity_files = [
        "IDENTITY.md",
        "USER.md",
        "AGENTS.md",
        "TOOLS.md",
        "HEARTBEAT.md",
    ]
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

    // Build the injected context exactly as the engine does — same truncation applied.
    let (injected_context, truncation_warnings) = if let Ok(engine) = state.runtime.engine() {
        let startup_files = engine.memory().collect_startup_files();
        let ctx_files = build_bootstrap_context(
            startup_files,
            engine.config().bootstrap_max_chars,
            engine.config().bootstrap_total_max_chars,
        );
        let warnings = build_truncation_warning_lines(&ctx_files);
        let injected = ctx_files
            .into_iter()
            .map(|f| InjectedContextFile {
                label: f.label,
                content: f.content,
                truncated: f.truncated,
                original_len: f.original_len,
            })
            .collect();
        (injected, warnings)
    } else {
        (vec![], vec![])
    };

    Ok(Json(SoulMemoryStateResponse {
        data_dir: data_dir.display().to_string(),
        bootstrap,
        soul,
        memory,
        identity_files,
        daily_files,
        injected_context,
        truncation_warnings,
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
    read_file_snapshot(&data_dir.join("MEMORY.md"), "MEMORY.md")
}

/// Returns the effective system prompt that is sent to the provider on every
/// request but never persisted to the conversation store.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemPromptResponse {
    pub content: String,
    pub token_estimate: usize,
}

pub async fn get_system_prompt(
    State(state): State<AppState>,
) -> Result<Json<SystemPromptResponse>> {
    let engine = state.runtime.engine()?;
    let skills = engine
        .skill_manager()
        .list()
        .unwrap_or_default()
        .into_iter()
        .map(|s| SkillEntry {
            name: s.name,
            description: s.description,
        })
        .collect();
    let agents = engine.list_agent_templates();
    let msg = system_message(
        engine.config(),
        engine.memory(),
        skills,
        engine.session_ctx(),
        &agents,
    );
    let content = msg.content.clone();
    let token_estimate = content.len() / 4;
    Ok(Json(SystemPromptResponse {
        content,
        token_estimate,
    }))
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisteredToolItem {
    pub name: String,
    pub description: String,
    /// True if this tool is active from session start; false = pool-only, activated via tool_search.
    pub is_core: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisteredToolsResponse {
    pub tools: Vec<RegisteredToolItem>,
}

pub async fn get_registered_tools(
    State(state): State<AppState>,
) -> Result<Json<RegisteredToolsResponse>> {
    let engine = state.runtime.engine()?;
    let mut tools: Vec<RegisteredToolItem> = engine
        .tool_registry()
        .definitions()
        .into_iter()
        .map(|def| RegisteredToolItem {
            is_core: CORE_TOOLS.contains(&def.name.as_str()),
            name: def.name,
            description: def.description,
        })
        .collect();
    tools.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(Json(RegisteredToolsResponse { tools }))
}

/// Allowed core file names that can be written via the API.
const ALLOWED_CORE_FILES: &[&str] = &[
    "BOOTSTRAP.md",
    "SOUL.md",
    "MEMORY.md",
    "IDENTITY.md",
    "USER.md",
    "AGENTS.md",
    "TOOLS.md",
    "HEARTBEAT.md",
];

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PatchCoreFileRequest {
    pub filename: String,
    pub content: String,
}

pub async fn patch_core_file(
    State(state): State<AppState>,
    Json(req): Json<PatchCoreFileRequest>,
) -> Result<Json<SoulMemoryFile>> {
    // Validate that filename is in the allowed list (no path traversal)
    if !ALLOWED_CORE_FILES.contains(&req.filename.as_str()) {
        return Err(AppError::Validation(format!(
            "filename '{}' is not an allowed core file",
            req.filename
        )));
    }

    let data_dir = state.config().data_dir.clone();
    let path = data_dir.join(&req.filename);

    fs::write(&path, &req.content)?;

    let snapshot = read_file_snapshot(&path, &req.filename)?;
    Ok(Json(snapshot))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_data_dir() -> std::path::PathBuf {
        std::env::temp_dir().join(format!("rushdino-soul-memory-{}", uuid::Uuid::new_v4()))
    }

    #[test]
    fn reads_root_memory_snapshot() {
        let data_dir = temp_data_dir();
        fs::create_dir_all(&data_dir).expect("data dir");
        fs::write(data_dir.join("MEMORY.md"), "# MEMORY\n\nroot\n").expect("root memory");

        let snapshot = read_memory_snapshot(&data_dir).expect("memory snapshot");

        assert!(snapshot.exists);
        assert_eq!(snapshot.name, "MEMORY.md");
        assert!(snapshot.content.contains("root"));

        let _ = fs::remove_dir_all(data_dir);
    }
}
