use std::{path::PathBuf, sync::Arc};

use chrono::Utc;
use sqlx::SqlitePool;
use tokio::sync::mpsc;
use uuid::Uuid;

use rushdino_common::{models::Message, models::Role, Result};
use rushdino_providers::Provider;

use crate::{
    agent_manager::AgentManager,
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
        delegate_to_agent::DelegateToAgentTool,
        file_edit::FileEditTool,
        file_read::FileReadTool,
        list_skills::ListSkillsTool,
        memory_read::MemoryReadTool,
        memory_write::MemoryWriteTool,
        shell_exec::ShellExecTool,
        spawn_agent::SpawnAgentTool,
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
    pub agent_manager: Arc<AgentManager>,
    pub inbox_rx: mpsc::Receiver<JobResult>,
}

pub fn build_engine_deps(
    provider: Arc<Provider>,
    pool: Arc<SqlitePool>,
    home_dir: PathBuf,
    brave_api_key: Option<String>,
    config: &AgentConfig,
    approval: Option<Arc<dyn crate::tools::shell_exec::ToolApproval>>,
) -> Result<EngineDeps> {
    let memory = Arc::new(MemoryManager::new(home_dir.clone()));
    let skills = Arc::new(SkillManager::new(home_dir.join("skills")));

    let (inbox_tx, inbox_rx) = mpsc::channel(256);
    let jobs = Arc::new(JobManager::new(pool.clone(), inbox_tx.clone()));
    let orchestrator = Arc::new(Orchestrator::new(
        provider.clone(),
        pool.clone(),
        memory.clone(),
        inbox_tx,
    ));

    let agent_manager = Arc::new(AgentManager::new(home_dir.join("agents")));
    let mut registry = ToolRegistry::new();
    registry.register(WebSearchTool::new(
        "https://api.search.brave.com/res/v1/web/search".to_owned(),
        brave_api_key.clone(),
    ));
    registry.register(FileReadTool::new(home_dir.join("documents")));
    registry.register(FileEditTool::new());
    registry.register(ShellExecTool::new(config.tool_timeout_secs));
    registry.register(MemoryReadTool::new(memory.clone()));
    registry.register(MemoryWriteTool::new(memory.clone()));
    registry.register(CreateJobTool::new(jobs.clone()));
    registry.register(SpawnSubAgentTool::new(orchestrator.clone()));
    registry.register(CreateSkillTool::new(skills.clone()));
    registry.register(ListSkillsTool::new(skills.clone()));

    // Clone all variables needed inside the Arc::new_cyclic closure before it
    // captures them. The closure is SYNC so all construction inside must be sync.
    let provider_c = provider.clone();
    let agent_manager_c = agent_manager.clone();
    let agent_manager_c2 = agent_manager.clone();
    let config_c = config.clone();
    let memory_c = memory.clone();
    let skills_c = skills.clone();
    let jobs_c = jobs.clone();
    let orchestrator_c = orchestrator.clone();
    let home_c = home_dir.clone();
    let brave_c = brave_api_key.clone();
    let approval_c = approval.clone();
    let tool_timeout = config.tool_timeout_secs;

    // Arc::new_cyclic allows DelegateToAgentTool to hold a Weak<ToolRegistry>
    // that points back to the registry being constructed, avoiding a retain cycle.
    let registry = Arc::new_cyclic(|weak_registry| {
        let delegate_tool = DelegateToAgentTool::new(
            agent_manager_c,
            provider_c,
            config_c,
            weak_registry.clone(),
        );

        let shell_exec = if let Some(gate) = approval_c {
            ShellExecTool::new(tool_timeout).with_approval(gate)
        } else {
            ShellExecTool::new(tool_timeout)
        };

        let mut r = ToolRegistry::new();
        r.register(WebSearchTool::new(
            "https://api.search.brave.com/res/v1/web/search".to_owned(),
            brave_c,
        ));
        r.register(FileReadTool::new(home_c.join("documents")));
        r.register(shell_exec);
        r.register(MemoryReadTool::new(memory_c.clone()));
        r.register(MemoryWriteTool::new(memory_c));
        r.register(CreateJobTool::new(jobs_c));
        r.register(SpawnSubAgentTool::new(orchestrator_c));
        r.register(CreateSkillTool::new(skills_c.clone()));
        r.register(ListSkillsTool::new(skills_c));
        r.register(delegate_tool);
        r.register(SpawnAgentTool::new(agent_manager_c2));
        r
    });

    // render_tool_doc must run after the registry Arc is fully constructed.
    memory.render_tool_doc(&registry.names())?;

    Ok(EngineDeps {
        conversation: Arc::new(ConversationManager::new(pool)),
        tool_registry: registry,
        job_manager: jobs,
        orchestrator,
        memory,
        agent_manager,
        inbox_rx,
    })
}

pub fn title_from(input: &str) -> &str {
    if input.len() <= 60 {
        return input;
    }
    // Walk backwards from byte 60 to find the last valid char boundary,
    // preventing a panic when byte 60 falls in the middle of a multi-byte codepoint.
    let mut boundary = 60;
    while !input.is_char_boundary(boundary) {
        boundary -= 1;
    }
    &input[..boundary]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn title_from_does_not_panic_on_multibyte_utf8() {
        // Each emoji is 4 bytes; 16 * 4 = 64 bytes, which straddles the 60-byte boundary.
        let emoji_str = "🎉".repeat(16);
        let result = title_from(&emoji_str);
        // Must not exceed 60 bytes.
        assert!(result.len() <= 60);
        // Must still be valid UTF-8 (not truncated mid-codepoint).
        assert!(std::str::from_utf8(result.as_bytes()).is_ok());
    }

    #[test]
    fn title_from_short_string_unchanged() {
        assert_eq!(title_from("hello"), "hello");
    }

    #[test]
    fn title_from_ascii_60_chars() {
        let s = "a".repeat(80);
        let result = title_from(&s);
        assert_eq!(result.len(), 60);
    }
}

pub fn system_message(config: &AgentConfig, memory: &MemoryManager, agent_manager: &AgentManager) -> Message {
    // Use general-assistant system prompt; fall back to config.system_prompt
    let agent_prompt = agent_manager
        .get("general-assistant")
        .map(|a| a.system_prompt)
        .unwrap_or_else(|| config.system_prompt.clone());

    Message {
        id: Uuid::new_v4().to_string(),
        role: Role::System,
        content: format!("{}\n\n{}", agent_prompt, memory.load_context().unwrap_or_default()),
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
