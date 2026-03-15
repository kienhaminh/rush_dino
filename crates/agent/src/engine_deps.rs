use std::{path::PathBuf, sync::Arc};

use sqlx::SqlitePool;
use tokio::sync::mpsc;

use rushdino_common::Result;
use rushdino_providers::Provider;

use crate::{
    agent_manager::AgentManager,
    agent_task_memory::AgentTaskMemory,
    conversation::ConversationManager,
    cron_manager::CronManager,
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
        delete_workflow::DeleteWorkflowTool, inspect_workflow::InspectWorkflowTool,
        run_workflow::RunWorkflowTool, update_workflow::UpdateWorkflowTool,
        cron_tools::{
            cron_create_tool, cron_delete_tool, cron_get_tool, cron_list_tool, cron_pause_tool,
            cron_resume_tool, cron_run_now_tool, cron_update_tool,
        },
        file_edit::FileEditTool, file_read::FileReadTool,
        file_write::FileWriteTool, image::ImageTool,
        knowledge_graph_query::KnowledgeGraphQueryTool, list_skills::ListSkillsTool,
        memory_search::MemorySearchTool, memory_write::MemoryWriteTool,
        present_message::PresentMessageTool, read_skill::ReadSkillTool,
        session_tools::{SessionCreateTool, SessionGetTool, SessionSendTool},
        shell_exec::ShellExecTool, spawn_agent::SpawnAgentTool,
        spawn_sub_agent::SpawnSubAgentTool, web_fetch::WebFetchTool, web_search::WebSearchTool,
    },
    workflow_runner::WorkflowRunner,
    workflow_manager::WorkflowManager,
    runtime::AgentRuntime,
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
    pub cron_manager: Arc<CronManager>,
    pub workflow_runner: Arc<WorkflowRunner>,
    pub inbox_rx: mpsc::Receiver<JobResult>,
    pub task_memory: Arc<AgentTaskMemory>,
}

#[allow(clippy::too_many_arguments)]
pub fn build_engine_deps(
    provider: Arc<Provider>,
    pool: Arc<SqlitePool>,
    home_dir: PathBuf,
    brave_api_key: Option<String>,
    gemini_api_key: Option<String>,
    config: &AgentConfig,
    runtime: Arc<AgentRuntime>,
    system_broker: SharedSystemBroker,
    knowledge_graph: Option<Arc<dyn KnowledgeGraphAccess>>,
) -> Result<EngineDeps> {
    let memory = Arc::new(MemoryManager::new(home_dir.clone()));
    let skills = Arc::new(SkillManager::new(home_dir.join("skills")));
    let workflow_manager = Arc::new(WorkflowManager::new(pool.clone()));
    let cron_manager = Arc::new(CronManager::new(pool.clone()));
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
    let workflow_manager_c2 = workflow_manager.clone();
    let workflow_manager_c3 = workflow_manager.clone();
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

        let r = ToolRegistry::new();
        r.register(WebSearchTool::new(
            "https://api.search.brave.com/res/v1/web/search".to_owned(),
            brave_c,
        ));
        r.register(ImageTool::new(gemini_api_key, home_c.join("documents/images")));
        r.register(FileReadTool::new(home_c.join("documents")));
        r.register(FileWriteTool::new(home_c.clone()));
        r.register(FileEditTool::new(home_c.clone()));
        r.register(shell_exec);
        r.register(PresentMessageTool::new());
        r.register(MemorySearchTool::new(memory_c.clone()));
        r.register(MemoryWriteTool::new(memory_c, graph_c.clone()));
        r.register(CreateJobTool::new(jobs_c));
        r.register(CreateWorkflowTool::new(workflow_manager_c, agent_manager_c3));
        r.register(UpdateWorkflowTool::new(workflow_manager_c2.clone()));
        r.register(DeleteWorkflowTool::new(workflow_manager_c2.clone()));
        r.register(InspectWorkflowTool::new(workflow_manager_c2.clone()));
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

    let workflow_runner = Arc::new(WorkflowRunner::new(
        provider.clone(),
        registry.clone(),
        conversation.clone(),
        memory.clone(),
        agent_manager.clone(),
        workflow_manager.clone(),
        runtime.clone(),
        config.clone(),
    ));
    registry.register(RunWorkflowTool::new(workflow_manager_c3, workflow_runner.clone()));
    registry.register(WebFetchTool::new());
    registry.register(SessionCreateTool::new(conversation.clone()));
    registry.register(SessionGetTool::new(conversation.clone()));
    registry.register(SessionSendTool::new(
        conversation.clone(),
        provider.clone(),
        Arc::downgrade(&registry),
        memory.clone(),
        skills.clone(),
        agent_manager.clone(),
        config.clone(),
    ));
    registry.register(cron_list_tool(cron_manager.clone()));
    registry.register(cron_get_tool(cron_manager.clone()));
    registry.register(cron_create_tool(cron_manager.clone()));
    registry.register(cron_update_tool(cron_manager.clone()));
    registry.register(cron_pause_tool(cron_manager.clone()));
    registry.register(cron_resume_tool(cron_manager.clone()));
    registry.register(cron_run_now_tool(
        cron_manager.clone(),
        conversation.clone(),
        provider.clone(),
        Arc::downgrade(&registry),
        memory.clone(),
        skills.clone(),
        agent_manager.clone(),
        config.clone(),
        workflow_manager.clone(),
        workflow_runner.clone(),
        runtime.clone(),
        provider.model().to_owned(),
    ));
    registry.register(cron_delete_tool(cron_manager.clone()));
    let _ = system_broker;

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
        cron_manager,
        workflow_runner,
        inbox_rx,
        task_memory,
    })
}
