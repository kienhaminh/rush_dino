use std::{path::PathBuf, sync::{Arc, Weak}};

use sqlx::SqlitePool;
use tokio::sync::mpsc;

use rushdino_common::Result;
use rushdino_providers::Provider;
use rushdino_security::egress_proxy::EgressProxy;

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
    runtime::AgentRuntime,
    skill_manager::SkillManager,
    system_broker::SharedSystemBroker,
    tool_registry::{SessionToolContext, ToolRegistry},
    tools::{
        create_job::CreateJobTool,
        create_skill::CreateSkillTool,
        create_workflow::CreateWorkflowTool,
        cron_tools::{
            cron_create_tool, cron_delete_tool, cron_get_tool, cron_list_tool, cron_pause_tool,
            cron_resume_tool, cron_run_now_tool, cron_update_tool,
        },
        delegate_to_agent::DelegateToAgentTool,
        delete_workflow::DeleteWorkflowTool,
        file_edit::FileEditTool,
        file_read::FileReadTool,
        file_write::FileWriteTool,
        image::ImageTool,
        inspect_workflow::InspectWorkflowTool,
        knowledge_graph_query::KnowledgeGraphQueryTool,
        list_skills::ListSkillsTool,
        memory_search::MemorySearchTool,
        memory_write::MemoryWriteTool,
        present_message::PresentMessageTool,
        read_skill::ReadSkillTool,
        run_workflow::RunWorkflowTool,
        session_tools::{SessionCreateTool, SessionGetTool, SessionSendTool},
        shell_exec::ShellExecTool,
        spawn_agent::SpawnAgentTool,
        spawn_sub_agent::SpawnSubAgentTool,
        update_workflow::UpdateWorkflowTool,
        tool_search::ToolSearchTool,
        web_fetch::WebFetchTool,
        web_search::WebSearchTool,
    },
    workflow_manager::WorkflowManager,
    workflow_runner::WorkflowRunner,
};

const CORE_TOOLS: &[&str] = &[
    "delegate",
    "edit",
    "exec",
    "memory_search",
    "memory_write",
    "message",
    "read",
    "tool_search",
    "write",
];

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
    pub session_ctx: Arc<SessionToolContext>,
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
    // Optional sandbox egress proxy — pass Some to enforce network policy in web tools.
    egress_proxy: Option<Arc<EgressProxy>>,
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

    // Clone all variables needed inside Arc::new_cyclic closures before they
    // capture them. The closures are SYNC so all construction inside must be sync.
    let provider_c = provider.clone();
    let agent_manager_c2 = agent_manager.clone();
    let agent_manager_c3 = agent_manager.clone();
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
    let egress_proxy_c = egress_proxy.clone();
    let graph_c = knowledge_graph.clone();
    let tool_timeout = config.tool_timeout_secs;

    // First Arc::new_cyclic builds the ToolRegistry. DelegateToAgentTool is
    // constructed here so it can receive a Weak<ToolRegistry> to avoid a cycle:
    // ToolRegistry → DelegateToAgentTool → Weak<ToolRegistry>.
    // session_ctx is not yet available here; DelegateToAgentTool will receive a
    // Weak<SessionToolContext> later via the second Arc::new_cyclic.
    let registry = Arc::new_cyclic(|weak_registry| {
        let shell_exec = ShellExecTool::new(tool_timeout, system_broker_c);

        let r = ToolRegistry::new();
        // Build WebSearchTool, optionally attaching the sandbox egress proxy.
        let mut web_search = WebSearchTool::new(
            "https://api.search.brave.com/res/v1/web/search".to_owned(),
            brave_c,
        );
        if let Some(proxy) = &egress_proxy_c {
            web_search = web_search.with_egress_proxy(proxy.clone());
        }
        r.register(web_search);
        r.register(ImageTool::new(
            gemini_api_key,
            home_c.join("documents/images"),
        ));
        r.register(FileReadTool::new(home_c.join("documents")));
        r.register(FileWriteTool::new(home_c.clone()));
        r.register(FileEditTool::new(home_c.clone()));
        r.register(shell_exec);
        r.register(PresentMessageTool::new());
        r.register(MemorySearchTool::new(memory_c.clone()));
        r.register(MemoryWriteTool::new(memory_c, graph_c.clone()));
        r.register(CreateJobTool::new(jobs_c));
        r.register(CreateWorkflowTool::new(
            workflow_manager_c,
            agent_manager_c3,
        ));
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
        // DelegateToAgentTool needs Weak<ToolRegistry> (avoids cycle) and will
        // receive a Weak<SessionToolContext> inside session_ctx's Arc::new_cyclic.
        // Use a dead Weak here; it is overwritten by re-registering inside session_ctx.
        // NOTE: we deliberately construct and register DelegateToAgentTool twice —
        // first with a dead session_ctx Weak here to satisfy the registry slot, then
        // replace it inside session_ctx's Arc::new_cyclic with the live Weak.
        // Instead: we register it only once, inside session_ctx's closure.
        // A placeholder (SpawnAgentTool) occupies no slot; DelegateToAgentTool is
        // registered later. The registry is append-only via register(), so we cannot
        // replace. Use Weak::new() (dead) for session_ctx in the first registration.
        r.register(DelegateToAgentTool::new(
            agent_manager.clone(),
            provider_c.clone(),
            config.clone(),
            weak_registry.clone(),
            Weak::new(), // session_ctx unavailable here — upgraded lazily at execute time
            task_memory.clone(),
            conversation.clone(),
        ));
        r.register(SpawnAgentTool::new(agent_manager_c2));
        r
    });

    // Build WebFetchTool, optionally attaching the sandbox egress proxy.
    let mut web_fetch = WebFetchTool::new();
    if let Some(proxy) = &egress_proxy {
        web_fetch = web_fetch.with_egress_proxy(proxy.clone());
    }
    registry.register(web_fetch);
    registry.register(SessionCreateTool::new(conversation.clone()));
    registry.register(SessionGetTool::new(conversation.clone()));
    registry.register(cron_list_tool(cron_manager.clone()));
    registry.register(cron_get_tool(cron_manager.clone()));
    registry.register(cron_create_tool(cron_manager.clone()));
    registry.register(cron_update_tool(cron_manager.clone()));
    registry.register(cron_pause_tool(cron_manager.clone()));
    registry.register(cron_resume_tool(cron_manager.clone()));
    registry.register(cron_delete_tool(cron_manager.clone()));
    let _ = system_broker;

    // Use OnceLock so WorkflowRunner built inside the session_ctx closure can be
    // retrieved outside for storage in EngineDeps.
    let workflow_runner_once: Arc<std::sync::OnceLock<Arc<WorkflowRunner>>> =
        Arc::new(std::sync::OnceLock::new());

    // Build SessionToolContext with Arc::new_cyclic so that tools which need a
    // Weak<SessionToolContext> back-reference (ToolSearchTool, SessionSendTool,
    // cron_run_now_tool, WorkflowRunner) can be registered/constructed inside the
    // closure without a retain cycle:
    //   SessionToolContext.pool → Arc<Tool> → Weak<SessionToolContext>
    let workflow_runner_once_c = workflow_runner_once.clone();
    let session_ctx = Arc::new_cyclic(|weak: &Weak<SessionToolContext>| {
        // WorkflowRunner and cron_run_now need session_ctx; build WorkflowRunner here.
        let workflow_runner = Arc::new(WorkflowRunner::new(
            provider.clone(),
            registry.clone(),
            weak.clone(),
            conversation.clone(),
            memory.clone(),
            agent_manager.clone(),
            workflow_manager.clone(),
            runtime.clone(),
            config.clone(),
        ));
        let _ = workflow_runner_once_c.set(workflow_runner.clone());
        registry.register(RunWorkflowTool::new(
            workflow_manager_c3,
            workflow_runner.clone(),
        ));
        registry.register(SessionSendTool::new(
            conversation.clone(),
            provider.clone(),
            Arc::downgrade(&registry),
            weak.clone(),
            memory.clone(),
            skills.clone(),
            agent_manager.clone(),
            config.clone(),
        ));
        registry.register(cron_run_now_tool(
            cron_manager.clone(),
            conversation.clone(),
            provider.clone(),
            Arc::downgrade(&registry),
            weak.clone(),
            memory.clone(),
            skills.clone(),
            agent_manager.clone(),
            config.clone(),
            workflow_manager.clone(),
            workflow_runner.clone(),
            runtime.clone(),
            provider.model().to_owned(),
        ));
        let tool_search = ToolSearchTool::new(weak.clone());
        registry.register(tool_search);
        let pool = registry.all_tools();
        SessionToolContext::new(pool, CORE_TOOLS)
    });

    // SAFETY: session_ctx's Arc::new_cyclic closure always sets workflow_runner_once.
    let workflow_runner = workflow_runner_once
        .get()
        .expect("workflow_runner set inside session_ctx closure")
        .clone();

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
        session_ctx,
    })
}
