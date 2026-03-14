use std::{fs, path::PathBuf};

use axum::{extract::Path, extract::State, Json};
use chrono::{DateTime, Utc};
use serde::Serialize;

use rushdino_common::{AppConfig, AppError, Result};

use crate::provider_runtime::default_profile_model;
use crate::state::AppState;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentListItem {
    pub id: String,
    pub name: String,
    pub emoji: String,
    pub is_default: bool,
    pub workspace: String,
    pub model: String,
    pub description: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRuntimeResponse {
    pub files: Vec<AgentFileRecord>,
    pub tools_profile: String,
    pub tool_sections: Vec<AgentToolSection>,
    pub skills: Vec<AgentSkillRecord>,
    pub channels: Vec<AgentChannelRecord>,
    pub cron_status: AgentCronStatus,
    pub cron_jobs: Vec<AgentCronJob>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentFileRecord {
    pub name: String,
    pub path: String,
    pub size: String,
    pub updated_at: String,
    pub missing: bool,
    pub content: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentToolRecord {
    pub id: String,
    pub label: String,
    pub description: String,
    pub enabled: bool,
    pub source: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentToolSection {
    pub id: String,
    pub label: String,
    pub tools: Vec<AgentToolRecord>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSkillRecord {
    pub name: String,
    pub description: String,
    pub group: String,
    pub source: String,
    pub enabled: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentChannelRecord {
    pub id: String,
    pub label: String,
    pub accounts: Vec<AgentChannelAccount>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentChannelAccount {
    pub account_id: String,
    pub name: String,
    pub connected: bool,
    pub configured: bool,
    pub enabled: bool,
    pub last_error: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentCronStatus {
    pub enabled: bool,
    pub jobs: i64,
    pub next_wake: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentCronJob {
    pub id: String,
    pub name: String,
    pub description: String,
    pub schedule: String,
    pub enabled: bool,
    pub next_run: String,
    pub state: String,
    pub payload: String,
}

#[derive(Debug, serde::Deserialize)]
struct SkillDoc {
    name: String,
    description: String,
}

pub async fn list_agents(State(state): State<AppState>) -> Result<Json<serde_json::Value>> {
    let engine = state.engine()?;
    let config = state.config();
    let mut items = engine.list_agent_templates();
    items.sort_by(|a, b| a.name.cmp(&b.name));
    let default_model = active_model(config.as_ref());

    let mapped = items
        .into_iter()
        .map(|agent| AgentListItem {
            id: agent.name.clone(),
            name: humanize_agent_name(&agent.name),
            emoji: agent.icon.unwrap_or_else(|| "🤖".to_owned()),
            is_default: agent.name == "general-assistant",
            workspace: config
                .data_dir
                .join("agents")
                .join(format!("{}.toml", agent.name))
                .display()
                .to_string(),
            model: default_model.clone(),
            description: agent.description,
        })
        .collect::<Vec<_>>();

    Ok(Json(serde_json::json!({ "items": mapped })))
}

pub async fn get_agent_runtime(
    Path(id): Path<String>,
    State(state): State<AppState>,
) -> Result<Json<AgentRuntimeResponse>> {
    let engine = state.engine()?;
    let config = state.config();
    if !is_valid_agent_id(&id) {
        return Err(AppError::Validation("invalid agent id".to_owned()));
    }

    let _ = engine
        .get_agent_template(&id)
        .ok_or_else(|| AppError::Validation(format!("unknown agent: {id}")))?;

    let agents_dir = config.data_dir.join("agents");
    let skills_dir = config.data_dir.join("skills");
    let file = read_agent_file_record(&agents_dir, &id);
    let mut files = vec![file];

    // Add workspace files
    for ws_file in [
        "SOUL.md",
        "AGENTS.md",
        "USER.md",
        "IDENTITY.md",
        "TOOLS.md",
        "HEARTBEAT.md",
    ] {
        files.push(read_workspace_file_record(&agents_dir, &id, ws_file));
    }

    let tool_sections = build_tool_sections(
        engine
            .tool_registry
            .definitions()
            .into_iter()
            .map(|definition| AgentToolRecord {
                id: definition.name.clone(),
                label: definition.name,
                description: definition.description,
                enabled: true,
                source: "core".to_owned(),
            })
            .collect(),
    );

    let skills = read_skills(&skills_dir);

    Ok(Json(AgentRuntimeResponse {
        files,
        tools_profile: "runtime".to_owned(),
        tool_sections,
        skills,
        channels: Vec::new(),
        cron_status: AgentCronStatus {
            enabled: false,
            jobs: 0,
            next_wake: "n/a".to_owned(),
        },
        cron_jobs: Vec::new(),
    }))
}

#[derive(Debug, serde::Deserialize)]
pub struct UpdateAgentFileRequest {
    pub content: String,
}

pub async fn update_agent_file(
    Path((agent_id, file_name)): Path<(String, String)>,
    State(state): State<AppState>,
    Json(payload): Json<UpdateAgentFileRequest>,
) -> Result<Json<AgentFileRecord>> {
    let config = state.config();
    if !is_valid_agent_id(&agent_id)
        || file_name.contains('/')
        || file_name.contains('\\')
        || file_name.is_empty()
    {
        return Err(AppError::Validation(
            "invalid agent id or filename".to_owned(),
        ));
    }

    let agents_dir = config.data_dir.join("agents");

    // Determine path based on if it's the core agent definition or a workspace file
    let path = if file_name == format!("{}.toml", agent_id) {
        agents_dir.join(&file_name)
    } else {
        let workspace_dir = agents_dir.join(&agent_id);
        fs::create_dir_all(&workspace_dir)
            .map_err(|e| AppError::Agent(format!("failed to create workspace dir: {e}")))?;
        workspace_dir.join(&file_name)
    };

    fs::write(&path, &payload.content)
        .map_err(|e| AppError::Agent(format!("failed to write file: {e}")))?;

    let record = if file_name == format!("{}.toml", agent_id) {
        read_agent_file_record(&agents_dir, &agent_id)
    } else {
        read_workspace_file_record(&agents_dir, &agent_id, &file_name)
    };

    Ok(Json(record))
}

pub async fn delete_agent(
    Path(agent_id): Path<String>,
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>> {
    let engine = state.engine()?;
    if !is_valid_agent_id(&agent_id) {
        return Err(AppError::Validation("invalid agent id".to_owned()));
    }

    if agent_id == "general-assistant" {
        return Err(AppError::Validation(
            "cannot delete the default general-assistant template".to_owned(),
        ));
    }

    engine.delete_agent_template(&agent_id)?;
    Ok(Json(serde_json::json!({ "deleted": true, "id": agent_id })))
}

/// Map tool IDs to canonical section IDs that match the frontend's CORE_TOOL_SECTION_ORDER.
fn tool_section_id(tool_id: &str) -> &'static str {
    match tool_id {
        "read" | "write" | "edit" => "fs",
        "exec" => "runtime",
        "web_search" | "web_fetch" => "web",
        "memory_search" | "memory_write" | "knowledge_graph" => "memory",
        "sessions_list" | "sessions_history" | "sessions_send" | "sessions_spawn"
        | "session_status" => "sessions",
        "list_agents" | "delegate" | "spawn_agents" | "subagents" => "agents",
        "list_skills" | "read_skill" | "create_skill" => "skills",
        "message" => "messaging",
        "cron" | "workflow" => "automation",
        _ => "registered",
    }
}

/// Group a flat list of tool records into ordered sections.
fn build_tool_sections(tools: Vec<AgentToolRecord>) -> Vec<AgentToolSection> {
    // Section order mirrors CORE_TOOL_SECTION_ORDER in frontend/src/lib/tool-catalog.ts
    let section_order: &[(&str, &str)] = &[
        ("fs", "Files"),
        ("runtime", "Runtime"),
        ("web", "Web"),
        ("memory", "Memory"),
        ("sessions", "Sessions"),
        ("agents", "Agents"),
        ("skills", "Skills"),
        ("messaging", "Messaging"),
        ("automation", "Automation"),
        ("registered", "Registered"),
    ];

    let mut buckets: std::collections::HashMap<&str, Vec<AgentToolRecord>> =
        std::collections::HashMap::new();

    for tool in tools {
        let section = tool_section_id(&tool.id);
        buckets.entry(section).or_default().push(tool);
    }

    section_order
        .iter()
        .filter_map(|(id, label)| {
            buckets.remove(*id).map(|tools| AgentToolSection {
                id: (*id).to_owned(),
                label: (*label).to_owned(),
                tools,
            })
        })
        .collect()
}

fn is_valid_agent_id(id: &str) -> bool {
    !id.is_empty() && !id.starts_with('.') && !id.contains('/') && !id.contains('\\')
}

fn active_model(config: &AppConfig) -> String {
    default_profile_model(config).unwrap_or_else(|| "unavailable".to_owned())
}

fn humanize_agent_name(raw: &str) -> String {
    raw.split('-')
        .filter(|part| !part.is_empty())
        .map(|part| {
            let mut chars = part.chars();
            match chars.next() {
                Some(first) => {
                    let mut title = first.to_uppercase().to_string();
                    title.push_str(chars.as_str());
                    title
                }
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn read_agent_file_record(agents_dir: &std::path::Path, agent_id: &str) -> AgentFileRecord {
    let path = agents_dir.join(format!("{agent_id}.toml"));
    let path_display = path.display().to_string();
    match fs::read_to_string(&path) {
        Ok(content) => {
            let size = fs::metadata(&path)
                .map(|m| format_bytes(m.len()))
                .unwrap_or_else(|_| "-".to_owned());
            let updated_at = fs::metadata(&path)
                .ok()
                .and_then(|m| m.modified().ok())
                .map(|modified| DateTime::<Utc>::from(modified).to_rfc3339())
                .unwrap_or_else(|| "-".to_owned());
            AgentFileRecord {
                name: format!("{agent_id}.toml"),
                path: path_display,
                size,
                updated_at,
                missing: false,
                content,
            }
        }
        Err(_) => AgentFileRecord {
            name: format!("{agent_id}.toml"),
            path: path_display,
            size: "0 B".to_owned(),
            updated_at: "missing".to_owned(),
            missing: true,
            content: String::new(),
        },
    }
}

fn read_workspace_file_record(
    agents_dir: &std::path::Path,
    agent_id: &str,
    file_name: &str,
) -> AgentFileRecord {
    let workspace_dir = agents_dir.join(agent_id);
    let path = workspace_dir.join(file_name);
    let path_display = path.display().to_string();
    match fs::read_to_string(&path) {
        Ok(content) => {
            let size = fs::metadata(&path)
                .map(|m| format_bytes(m.len()))
                .unwrap_or_else(|_| "-".to_owned());
            let updated_at = fs::metadata(&path)
                .ok()
                .and_then(|m| m.modified().ok())
                .map(|modified| DateTime::<Utc>::from(modified).to_rfc3339())
                .unwrap_or_else(|| "-".to_owned());
            AgentFileRecord {
                name: file_name.to_owned(),
                path: path_display,
                size,
                updated_at,
                missing: false,
                content,
            }
        }
        Err(_) => AgentFileRecord {
            name: file_name.to_owned(),
            path: path_display,
            size: "0 B".to_owned(),
            updated_at: "missing".to_owned(),
            missing: true,
            content: String::new(),
        },
    }
}

fn read_skills(skills_dir: &PathBuf) -> Vec<AgentSkillRecord> {
    let read_dir = match fs::read_dir(skills_dir) {
        Ok(entries) => entries,
        Err(_) => return Vec::new(),
    };

    let mut skills = Vec::new();
    for entry in read_dir.flatten() {
        if entry.path().extension().and_then(|ext| ext.to_str()) != Some("toml") {
            continue;
        }

        let Ok(content) = fs::read_to_string(entry.path()) else {
            continue;
        };
        let Ok(parsed) = toml::from_str::<SkillDoc>(&content) else {
            continue;
        };

        skills.push(AgentSkillRecord {
            name: parsed.name.clone(),
            description: parsed.description,
            group: "workspace".to_owned(),
            source: "workspace".to_owned(),
            enabled: true,
        });
    }

    skills.sort_by(|a, b| a.name.cmp(&b.name));
    skills
}

fn format_bytes(bytes: u64) -> String {
    const KB: u64 = 1024;
    const MB: u64 = 1024 * KB;
    if bytes >= MB {
        format!("{:.1} MB", bytes as f64 / MB as f64)
    } else if bytes >= KB {
        format!("{:.1} KB", bytes as f64 / KB as f64)
    } else {
        format!("{bytes} B")
    }
}
