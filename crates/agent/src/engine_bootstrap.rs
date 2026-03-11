use std::{path::PathBuf, sync::Arc};

use chrono::Utc;
use sqlx::SqlitePool;
use tokio::sync::mpsc;
use uuid::Uuid;

use rushdino_common::{models::Message, models::Role, Result};
use rushdino_providers::Provider;

use crate::{
    agent_manager::AgentManager,
    agent_task_memory::AgentTaskMemory,
    conversation::ConversationManager,
    engine::AgentConfig,
    job_manager::{JobManager, JobResult},
    knowledge_graph::KnowledgeGraphAccess,
    memory::MemoryManager,
    orchestrator::Orchestrator,
    skill_manager::SkillManager,
    system_broker::SharedSystemBroker,
    tool_registry::ToolRegistry,
    tools::{
        create_job::CreateJobTool, create_skill::CreateSkillTool,
        create_workflow::CreateWorkflowTool, delegate_to_agent::DelegateToAgentTool,
        file_edit::FileEditTool, file_read::FileReadTool,
        knowledge_graph_query::KnowledgeGraphQueryTool, list_skills::ListSkillsTool,
        memory_search::MemorySearchTool,
        memory_write::MemoryWriteTool, present_message::PresentMessageTool,
        read_skill::ReadSkillTool, shell_exec::ShellExecTool, spawn_agent::SpawnAgentTool,
        spawn_sub_agent::SpawnSubAgentTool, web_search::WebSearchTool,
    },
    workflow_manager::WorkflowManager,
};

pub struct EngineDeps {
    pub pool: Arc<SqlitePool>,
    pub conversation: Arc<ConversationManager>,
    pub tool_registry: Arc<ToolRegistry>,
    pub job_manager: Arc<JobManager>,
    pub orchestrator: Arc<Orchestrator>,
    pub memory: Arc<MemoryManager>,
    pub skill_manager: Arc<SkillManager>,
    pub agent_manager: Arc<AgentManager>,
    pub workflow_manager: Arc<WorkflowManager>,
    pub inbox_rx: mpsc::Receiver<JobResult>,
    pub task_memory: Arc<AgentTaskMemory>,
}

pub fn build_engine_deps(
    provider: Arc<Provider>,
    pool: Arc<SqlitePool>,
    home_dir: PathBuf,
    brave_api_key: Option<String>,
    config: &AgentConfig,
    system_broker: SharedSystemBroker,
    knowledge_graph: Option<Arc<dyn KnowledgeGraphAccess>>,
) -> Result<EngineDeps> {
    let memory = Arc::new(MemoryManager::new(home_dir.clone()));
    let skills = Arc::new(SkillManager::new(home_dir.join("skills")));
    let workflow_manager = Arc::new(WorkflowManager::new(pool.clone()));
    let task_memory = Arc::new(AgentTaskMemory::new(home_dir.clone()));

    let (inbox_tx, inbox_rx) = mpsc::channel(256);
    let jobs = Arc::new(JobManager::new(pool.clone(), inbox_tx.clone()));
    let orchestrator = Arc::new(Orchestrator::new(
        provider.clone(),
        pool.clone(),
        memory.clone(),
        inbox_tx,
    ));

    let agent_manager = Arc::new(AgentManager::new(home_dir.join("agents")));

    // ConversationManager is constructed before the cyclic closure because
    // DelegateToAgentTool needs it to create isolated sub-conversations.
    let conversation = Arc::new(ConversationManager::new(pool.clone()));

    // Clone all variables needed inside the Arc::new_cyclic closure before it
    // captures them. The closure is SYNC so all construction inside must be sync.
    let task_memory_c = task_memory.clone();
    let provider_c = provider.clone();
    let agent_manager_c = agent_manager.clone();
    let agent_manager_c2 = agent_manager.clone();
    let agent_manager_c3 = agent_manager.clone();
    let config_c = config.clone();
    let memory_c = memory.clone();
    let skills_c = skills.clone();
    let jobs_c = jobs.clone();
    let orchestrator_c = orchestrator.clone();
    let workflow_manager_c = workflow_manager.clone();
    let home_c = home_dir.clone();
    let brave_c = brave_api_key.clone();
    let system_broker_c = system_broker.clone();
    let graph_c = knowledge_graph.clone();
    let tool_timeout = config.tool_timeout_secs;
    let conversation_c = conversation.clone();

    // Arc::new_cyclic allows DelegateToAgentTool to hold a Weak<ToolRegistry>
    // that points back to the registry being constructed, avoiding a retain cycle.
    let registry = Arc::new_cyclic(|weak_registry| {
        let delegate_tool = DelegateToAgentTool::new(
            agent_manager_c,
            provider_c,
            config_c,
            weak_registry.clone(),
            task_memory_c,
            conversation_c,
        );

        let shell_exec = ShellExecTool::new(tool_timeout, system_broker_c);

        let mut r = ToolRegistry::new();
        r.register(WebSearchTool::new(
            "https://api.search.brave.com/res/v1/web/search".to_owned(),
            brave_c,
        ));
        r.register(FileReadTool::new(home_c.join("documents")));
        r.register(FileEditTool::new());
        r.register(shell_exec);
        r.register(PresentMessageTool::new());
        r.register(MemorySearchTool::new(memory_c.clone()));
        r.register(MemoryWriteTool::new(memory_c, graph_c.clone()));
        r.register(CreateJobTool::new(jobs_c));
        r.register(CreateWorkflowTool::new(
            workflow_manager_c,
            agent_manager_c3,
        ));
        r.register(SpawnSubAgentTool::new(orchestrator_c));
        r.register(ReadSkillTool::new(skills_c.clone()));
        r.register(CreateSkillTool::new(skills_c.clone()));
        r.register(ListSkillsTool::new(skills_c));
        if let Some(graph) = graph_c {
            r.register(KnowledgeGraphQueryTool::new(graph));
        }
        r.register(delegate_tool);
        r.register(SpawnAgentTool::new(agent_manager_c2));
        r
    });

    Ok(EngineDeps {
        pool: pool.clone(),
        conversation,
        tool_registry: registry,
        job_manager: jobs,
        orchestrator,
        memory,
        skill_manager: skills,
        agent_manager,
        workflow_manager,
        inbox_rx,
        task_memory,
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

/// Builds a compact bullet list of all registered agents for injection into the system prompt.
/// Only reads frontmatter (name, description, icon) — the full system prompt body is not loaded.
pub fn build_agent_index(agent_manager: &AgentManager) -> String {
    let agents = agent_manager.list();
    if agents.is_empty() {
        return String::new();
    }

    let mut lines = vec!["## Available Agents".to_owned(), String::new()];
    for agent in &agents {
        let icon_part = agent
            .icon
            .as_deref()
            .map(|i| format!(" {i}"))
            .unwrap_or_default();
        lines.push(format!(
            "- **{}**{} — {}",
            agent.name, icon_part, agent.description
        ));
    }
    lines.push(String::new());
    lines.push("Use `delegate_to_agent` to assign a task to any agent above.".to_owned());
    lines.join("\n")
}

pub fn build_skill_index(skill_manager: &SkillManager) -> String {
    let skills = skill_manager.list().unwrap_or_default();
    if skills.is_empty() {
        return String::new();
    }
    let mut lines = vec!["## Available Skills".to_owned(), String::new()];
    for skill in &skills {
        lines.push(format!("- **{}** — {}", skill.name, skill.description));
    }
    lines.push(String::new());
    lines.push(
        "Use `read_skill` to load a skill's full instructions before applying it.".to_owned(),
    );
    lines.join("\n")
}

pub fn system_message(
    config: &AgentConfig,
    memory: &MemoryManager,
    agent_manager: &AgentManager,
    skill_manager: &SkillManager,
) -> Message {
    // AGENTS.md is the primary system prompt — it defines identity and behavior.
    // Fall back to config.system_prompt if the file does not exist yet.
    let agent_prompt = memory
        .read_named("AGENTS.md")
        .unwrap_or_else(|_| config.system_prompt.clone());

    // If BOOTSTRAP.md exists the workspace has never been onboarded.
    // Use it as the sole system prompt so the agent focuses entirely on the
    // onboarding ritual. The engine deletes BOOTSTRAP.md automatically once
    // IDENTITY.md exists — no agent action required.
    if let Ok(bootstrap) = memory.read_named("BOOTSTRAP.md") {
        return Message {
            id: Uuid::new_v4().to_string(),
            role: Role::System,
            content: bootstrap,
            tool_calls: None,
            rich_content: None,
            created_at: Utc::now(),
        };
    }

    let agent_index = build_agent_index(agent_manager);
    let skill_index = build_skill_index(skill_manager);

    // Memory files (SOUL.md, USER.md, TOOLS.md, MEMORY.md, etc.) are NOT merged
    // here — the agent reads them on demand via the `memory_search` / `memory_write` tools.
    //
    // Exception: BOOT.md is a persistent startup checklist injected every session.
    let boot = memory.read_named("BOOT.md").ok();

    let mut parts = vec![agent_prompt];
    if !agent_index.is_empty() {
        parts.push(agent_index);
    }
    if !skill_index.is_empty() {
        parts.push(skill_index);
    }
    if let Some(b) = boot {
        parts.push(b);
    }
    let content = parts.join("\n\n");

    Message {
        id: Uuid::new_v4().to_string(),
        role: Role::System,
        content,
        tool_calls: None,
        rich_content: None,
        created_at: Utc::now(),
    }
}

pub fn user_message(input: &str) -> Message {
    Message {
        id: Uuid::new_v4().to_string(),
        role: Role::User,
        content: input.to_owned(),
        tool_calls: None,
        rich_content: None,
        created_at: Utc::now(),
    }
}
