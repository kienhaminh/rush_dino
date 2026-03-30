use std::{
    collections::HashSet,
    fs,
    path::{Path as FsPath, PathBuf},
};

use axum::{extract::Path, extract::State, Json};
use chrono::{DateTime, Utc};
use serde::Serialize;

use rushdino_common::{AppError, Result};
use rushdino_security::policy::types::SandboxPolicy;

use crate::routes::skills::is_built_in_skill_name;
use crate::state::AppState;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentListItem {
    pub id: String,
    pub name: String,
    pub emoji: String,
    pub is_default: bool,
    pub workspace: String,
    pub description: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sandbox_policy: Option<SandboxPolicy>,
    pub claim_tags: Vec<String>,
    pub claims_tasks: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tools: Option<String>,
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

#[derive(Clone, Debug, Serialize)]
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

#[derive(Clone, Debug, Serialize)]
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

pub async fn list_agents(State(state): State<AppState>) -> Result<Json<serde_json::Value>> {
    let engine = state.engine()?;
    let config = state.config();
    let mut items = engine.list_agent_templates();
    items.sort_by(|a, b| a.name.cmp(&b.name));

    let mapped = items
        .into_iter()
        .enumerate()
        .map(|(idx, agent)| AgentListItem {
            id: agent.name.clone(),
            name: humanize_agent_name(&agent.name),
            emoji: agent.icon.unwrap_or_else(|| "🤖".to_owned()),
            is_default: idx == 0,
            workspace: agent_definition_path(&config.data_dir.join("agents"), &agent.name)
                .display()
                .to_string(),
            description: agent.description,
            sandbox_policy: agent.sandbox_policy,
            claim_tags: agent.claim_tags.clone(),
            claims_tasks: agent.claims_tasks,
            tools: agent.tools.clone(),
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

    let agent = engine
        .get_agent_template(&id)
        .ok_or_else(|| AppError::Validation(format!("unknown agent: {id}")))?;

    let agents_dir = config.data_dir.join("agents");
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

    let tool_sections = build_runtime_tool_sections(
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
        agent.tools.as_deref(),
    );

    let mut skills: Vec<AgentSkillRecord> = build_runtime_skills(
        engine
            .list_skills()
            .unwrap_or_default()
            .into_iter()
            .map(|skill| {
                let built_in = is_built_in_skill_name(&skill.name);
                AgentSkillRecord {
                    name: skill.name,
                    description: skill.description,
                    group: if built_in {
                        "built-in".to_owned()
                    } else {
                        "workspace".to_owned()
                    },
                    source: if built_in {
                        "builtin".to_owned()
                    } else {
                        "workspace".to_owned()
                    },
                    enabled: true,
                }
            })
            .collect(),
        agent.skills.as_deref(),
    );
    skills.sort_by(|a, b| a.name.cmp(&b.name));

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
    let path = if is_agent_definition_file(&file_name, &agent_id) {
        agent_definition_path(&agents_dir, &agent_id)
    } else {
        let workspace_dir = agents_dir.join(&agent_id);
        fs::create_dir_all(&workspace_dir)
            .map_err(|e| AppError::Agent(format!("failed to create workspace dir: {e}")))?;
        workspace_dir.join(&file_name)
    };

    fs::write(&path, &payload.content)
        .map_err(|e| AppError::Agent(format!("failed to write file: {e}")))?;

    let record = if is_agent_definition_file(&file_name, &agent_id) {
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

    engine.delete_agent_template(&agent_id)?;
    Ok(Json(serde_json::json!({ "deleted": true, "id": agent_id })))
}

/// Map tool IDs to canonical section IDs that match the frontend's CORE_TOOL_SECTION_ORDER.
fn tool_section_id(tool_id: &str) -> &'static str {
    match tool_id {
        "read" | "write" | "edit" => "fs",
        "bash" => "runtime",
        "web_search" | "web_fetch" => "web",
        "memory_search" | "memory_write" | "knowledge_graph" => "memory",
        "sessions_list" | "sessions_history" | "sessions_send" | "sessions_spawn"
        | "session_status" => "sessions",
        "list_agents" | "delegate" | "spawn_agents" => "agents",
        "list_skills" | "read_skill" | "create_skill" => "skills",
        "message" | "agent_inbox" => "messaging",
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

fn build_runtime_tool_sections(
    registered_tools: Vec<AgentToolRecord>,
    configured_tools: Option<&str>,
) -> Vec<AgentToolSection> {
    let configured_ids = parse_configured_tool_ids(configured_tools);
    if configured_ids.is_empty() {
        return Vec::new();
    }

    let registered_by_id = registered_tools
        .into_iter()
        .map(|tool| (tool.id.clone(), tool))
        .collect::<std::collections::HashMap<_, _>>();

    let selected = configured_ids
        .into_iter()
        .map(|tool_id| {
            registered_by_id
                .get(&tool_id)
                .cloned()
                .unwrap_or(AgentToolRecord {
                    id: tool_id.clone(),
                    label: tool_id,
                    description:
                        "Configured on this agent but not currently registered in runtime."
                            .to_owned(),
                    enabled: true,
                    source: "configured".to_owned(),
                })
        })
        .collect();

    build_tool_sections(selected)
}

fn parse_configured_tool_ids(configured_tools: Option<&str>) -> Vec<String> {
    parse_configured_ids(configured_tools)
}

fn build_runtime_skills(
    available_skills: Vec<AgentSkillRecord>,
    configured_skills: Option<&str>,
) -> Vec<AgentSkillRecord> {
    let configured_names = parse_configured_ids(configured_skills);
    if configured_names.is_empty() {
        return Vec::new();
    }

    let skills_by_name = available_skills
        .into_iter()
        .map(|skill| (skill.name.clone(), skill))
        .collect::<std::collections::HashMap<_, _>>();

    configured_names
        .into_iter()
        .map(|skill_name| {
            skills_by_name
                .get(&skill_name)
                .cloned()
                .unwrap_or(AgentSkillRecord {
                    name: skill_name,
                    description:
                        "Configured on this agent but not currently available in the runtime."
                            .to_owned(),
                    group: "configured".to_owned(),
                    source: "configured".to_owned(),
                    enabled: true,
                })
        })
        .collect()
}

fn parse_configured_ids(configured: Option<&str>) -> Vec<String> {
    let mut seen = HashSet::new();
    configured
        .unwrap_or_default()
        .split(',')
        .map(str::trim)
        .filter(|tool| !tool.is_empty())
        .filter_map(|tool| {
            if seen.insert(tool.to_owned()) {
                Some(tool.to_owned())
            } else {
                None
            }
        })
        .collect()
}

fn is_valid_agent_id(id: &str) -> bool {
    !id.is_empty() && !id.starts_with('.') && !id.contains('/') && !id.contains('\\')
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

fn agent_definition_path(agents_dir: &FsPath, agent_id: &str) -> PathBuf {
    let md_path = agents_dir.join(format!("{agent_id}.md"));
    if md_path.exists() {
        return md_path;
    }

    let toml_path = agents_dir.join(format!("{agent_id}.toml"));
    if toml_path.exists() {
        return toml_path;
    }

    md_path
}

fn is_agent_definition_file(file_name: &str, agent_id: &str) -> bool {
    file_name == format!("{agent_id}.md") || file_name == format!("{agent_id}.toml")
}

fn read_agent_file_record(agents_dir: &std::path::Path, agent_id: &str) -> AgentFileRecord {
    let path = agent_definition_path(agents_dir, agent_id);
    let path_display = path.display().to_string();
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .map(ToOwned::to_owned)
        .unwrap_or_else(|| format!("{agent_id}.md"));
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
                name: file_name,
                path: path_display,
                size,
                updated_at,
                missing: false,
                content,
            }
        }
        Err(_) => AgentFileRecord {
            name: file_name,
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

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentHealthResponse {
    pub success_rate: f64,
    pub total_tasks: i64,
    pub circuit_open: bool,
}

pub async fn get_agent_health(
    Path(agent_id): Path<String>,
    State(state): State<AppState>,
) -> Result<Json<AgentHealthResponse>> {
    let engine = state.engine()?;
    if !is_valid_agent_id(&agent_id) {
        return Err(AppError::Validation("invalid agent id".to_owned()));
    }
    let health_store = engine.health_store();
    let success_rate = health_store.get_success_rate(&agent_id).await?;
    let circuit_open = health_store.is_circuit_open(&agent_id).await?;
    let total_tasks = health_store.get_total_tasks(&agent_id).await?;
    Ok(Json(AgentHealthResponse {
        success_rate,
        total_tasks,
        circuit_open,
    }))
}

pub async fn reset_agent_health(
    Path(agent_id): Path<String>,
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>> {
    let engine = state.engine()?;
    if !is_valid_agent_id(&agent_id) {
        return Err(AppError::Validation("invalid agent id".to_owned()));
    }
    engine.health_store().reset(&agent_id).await?;
    Ok(Json(serde_json::json!({ "success": true })))
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

#[cfg(test)]
mod tests {
    use super::{
        build_runtime_skills, build_runtime_tool_sections, read_agent_file_record, AgentListItem,
        AgentSkillRecord, AgentToolRecord,
    };
    use rushdino_security::policy::types::{
        AccessMode, BlockBehavior, CredentialProvider, DefaultAction, FilesystemPolicy,
        InferencePolicy, NetworkPolicy, PathRule, ProcessPolicy, SandboxConfig, SandboxPolicy,
    };
    use std::fs;

    #[test]
    fn agent_list_item_serializes_sandbox_policy_when_present() {
        let item = AgentListItem {
            id: "agent-1".to_owned(),
            name: "Agent 1".to_owned(),
            emoji: "🤖".to_owned(),
            is_default: false,
            workspace: "/tmp/agent-1".to_owned(),
            description: "test".to_owned(),
            claim_tags: vec![],
            claims_tasks: true,
            tools: None,
            sandbox_policy: Some(SandboxPolicy {
                version: "1".to_owned(),
                sandbox: SandboxConfig {
                    filesystem: FilesystemPolicy {
                        default: DefaultAction::Deny,
                        allow: vec![PathRule {
                            path: "/tmp".into(),
                            mode: AccessMode::ReadWrite,
                        }],
                        deny: vec!["/etc".into()],
                    },
                    process: ProcessPolicy {
                        allow_privileged: false,
                        max_concurrent: 1,
                        deny_commands: vec!["curl".to_owned()],
                    },
                    network: NetworkPolicy {
                        default: DefaultAction::Deny,
                        on_block: BlockBehavior::Prompt,
                        allow: vec![],
                    },
                    inference: InferencePolicy::default(),
                },
                providers: vec![CredentialProvider {
                    name: "openai".to_owned(),
                    inject: Default::default(),
                }],
            }),
        };

        let value = serde_json::to_value(item).expect("agent list item should serialize");
        assert!(value.get("sandboxPolicy").is_some());
    }

    #[test]
    fn agent_list_item_does_not_serialize_per_agent_model() {
        let item = AgentListItem {
            id: "agent-1".to_owned(),
            name: "Agent 1".to_owned(),
            emoji: "🤖".to_owned(),
            is_default: false,
            workspace: "/tmp/agent-1".to_owned(),
            description: "test".to_owned(),
            claim_tags: vec![],
            claims_tasks: true,
            tools: None,
            sandbox_policy: None,
        };

        let value = serde_json::to_value(item).expect("agent list item should serialize");
        assert!(value.get("model").is_none());
    }

    #[test]
    fn runtime_tool_sections_only_include_configured_agent_tools() {
        let sections = build_runtime_tool_sections(
            vec![
                AgentToolRecord {
                    id: "read".to_owned(),
                    label: "read".to_owned(),
                    description: "Read files".to_owned(),
                    enabled: true,
                    source: "core".to_owned(),
                },
                AgentToolRecord {
                    id: "write".to_owned(),
                    label: "write".to_owned(),
                    description: "Write files".to_owned(),
                    enabled: true,
                    source: "core".to_owned(),
                },
                AgentToolRecord {
                    id: "agent_inbox".to_owned(),
                    label: "agent_inbox".to_owned(),
                    description: "Inbox messaging".to_owned(),
                    enabled: true,
                    source: "core".to_owned(),
                },
            ],
            Some("read, agent_inbox"),
        );

        let enabled_ids = sections
            .into_iter()
            .flat_map(|section| section.tools.into_iter())
            .map(|tool| tool.id)
            .collect::<Vec<_>>();

        assert_eq!(
            enabled_ids,
            vec!["read".to_owned(), "agent_inbox".to_owned()]
        );
    }

    #[test]
    fn read_agent_file_record_prefers_markdown_definition() {
        let temp = tempfile::tempdir().expect("tempdir");
        let agents_dir = temp.path();
        fs::write(agents_dir.join("writer.md"), "---\nname: writer\n---\nbody").expect("write md");
        fs::write(agents_dir.join("writer.toml"), "name = \"writer\"").expect("write toml");

        let record = read_agent_file_record(agents_dir, "writer");

        assert_eq!(record.name, "writer.md");
        assert!(record.path.ends_with("writer.md"));
        assert_eq!(record.content, "---\nname: writer\n---\nbody");
        assert!(!record.missing);
    }

    #[test]
    fn runtime_skills_only_include_configured_agent_skills() {
        let skills = build_runtime_skills(
            vec![
                AgentSkillRecord {
                    name: "skill-creator".to_owned(),
                    description: "Create skills".to_owned(),
                    group: "built-in".to_owned(),
                    source: "builtin".to_owned(),
                    enabled: true,
                },
                AgentSkillRecord {
                    name: "oracle".to_owned(),
                    description: "Research helper".to_owned(),
                    group: "workspace".to_owned(),
                    source: "workspace".to_owned(),
                    enabled: true,
                },
            ],
            Some("oracle"),
        );

        assert_eq!(skills.len(), 1);
        assert_eq!(skills[0].name, "oracle");
    }
}
