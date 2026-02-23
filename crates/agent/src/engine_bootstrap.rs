use std::{path::PathBuf, sync::Arc};

use chrono::Utc;
use sqlx::SqlitePool;
use tokio::sync::mpsc;
use uuid::Uuid;

use rushdino_common::{models::Message, models::Role, Result};
use rushdino_providers::Provider;

use crate::{
    conversation::ConversationManager,
    engine::AgentConfig,
    job_manager::{JobManager, JobResult},
    memory::MemoryManager,
    orchestrator::Orchestrator,
    skill_manager::SkillManager,
    tool_registry::ToolRegistry,
    tools::{
        create_job::CreateJobTool,
        create_skill::CreateSkillTool,
        file_edit::FileEditTool,
        file_read::FileReadTool,
        list_skills::ListSkillsTool,
        memory_read::MemoryReadTool,
        memory_write::MemoryWriteTool,
        shell_exec::ShellExecTool,
        spawn_sub_agent::SpawnSubAgentTool,
        web_search::WebSearchTool,
    },
};

pub struct EngineDeps {
    pub conversation: Arc<ConversationManager>,
    pub tool_registry: Arc<ToolRegistry>,
    pub job_manager: Arc<JobManager>,
    pub orchestrator: Arc<Orchestrator>,
    pub memory: Arc<MemoryManager>,
    pub inbox_rx: mpsc::Receiver<JobResult>,
}

pub fn build_engine_deps(
    provider: Arc<Provider>,
    pool: Arc<SqlitePool>,
    home_dir: PathBuf,
    brave_api_key: Option<String>,
    config: &AgentConfig,
) -> Result<EngineDeps> {
    let memory = Arc::new(MemoryManager::new(home_dir.clone()));
    let skills = Arc::new(SkillManager::new(home_dir.join("skills")));

    let (inbox_tx, inbox_rx) = mpsc::channel(256);
    let jobs = Arc::new(JobManager::new(pool.clone(), inbox_tx.clone()));
    let orchestrator = Arc::new(Orchestrator::new(
        provider,
        pool.clone(),
        memory.clone(),
        inbox_tx,
    ));

    let mut registry = ToolRegistry::new();
    registry.register(WebSearchTool::new(
        "https://api.search.brave.com/res/v1/web/search".to_owned(),
        brave_api_key,
    ));
    registry.register(FileReadTool::new(home_dir.join("documents")));
    registry.register(FileEditTool::new());
    registry.register(ShellExecTool::new(config.tool_timeout_secs));
    registry.register(MemoryReadTool::new(memory.clone()));
    registry.register(MemoryWriteTool::new(memory.clone()));
    registry.register(CreateJobTool::new(jobs.clone()));
    registry.register(SpawnSubAgentTool::new(orchestrator.clone()));
    registry.register(CreateSkillTool::new(skills.clone()));
    registry.register(ListSkillsTool::new(skills));

    memory.render_tool_doc(&registry.names())?;

    Ok(EngineDeps {
        conversation: Arc::new(ConversationManager::new(pool)),
        tool_registry: Arc::new(registry),
        job_manager: jobs,
        orchestrator,
        memory,
        inbox_rx,
    })
}

pub fn title_from(input: &str) -> &str {
    if input.len() > 60 {
        &input[..60]
    } else {
        input
    }
}

pub fn system_message(config: &AgentConfig, memory: &MemoryManager) -> Message {
    Message {
        id: Uuid::new_v4().to_string(),
        role: Role::System,
        content: format!(
            "{}\n\n{}",
            config.system_prompt,
            memory.load_context().unwrap_or_default()
        ),
        tool_calls: None,
        created_at: Utc::now(),
    }
}

pub fn user_message(input: &str) -> Message {
    Message {
        id: Uuid::new_v4().to_string(),
        role: Role::User,
        content: input.to_owned(),
        tool_calls: None,
        created_at: Utc::now(),
    }
}
