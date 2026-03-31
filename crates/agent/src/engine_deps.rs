use std::{path::PathBuf, sync::{Arc, Weak}};

use sqlx::SqlitePool;
use rushdino_common::Result;
use rushdino_providers::Provider;
use rushdino_security::guardrail::pipeline::GuardrailPipeline;

use crate::{
    agent_health_store::AgentHealthStore,
    agent_manager::AgentManager,
    agent_message_store::AgentMessageStore,
    agent_task_memory::AgentTaskMemory,
    conversation::ConversationManager,
    cron_manager::CronManager,
    engine::AgentConfig,
    kanban_store::KanbanStore,
    knowledge_graph::KnowledgeGraphAccess,
    memory::MemoryManager,
    runtime::AgentRuntime,
    skill_manager::SkillManager,
    system_broker::SharedSystemBroker,
    tool_registry::{SessionToolContext, ToolRegistry},
    tools::{
        agent_inbox::AgentInboxTool,
        cron_tools::{cron_list_tool, cron_manage_tool, AgentTurnCtx},
        delegate_to_agent::DelegateToAgentTool,
        kanban_tools::{ClaimTaskTool, PostTaskTool, ReviewTaskTool, UpdateTaskTool},
        team_status::TeamStatusTool,
        file_edit::FileEditTool,
        file_read::FileReadTool,
        file_write::FileWriteTool,
        glob_search::GlobSearchTool,
        grep_search::GrepSearchTool,
        image::ImageTool,
        knowledge_graph::KnowledgeGraphTool,
        memory_search::MemorySearchTool,
        memory_write::MemoryWriteTool,
        present_message::PresentMessageTool,
        request_user_input::RequestUserInputTool,
        run_workflow::RunWorkflowTool,
        session_tools::{SessionManageTool, SessionSendTool},
        bash::ShellExecTool,
        spawn_agent::SpawnAgentTool,
        tool_search::ToolSearchTool,
        web_fetch::WebFetchTool,
        web_search::WebSearchTool,
        workflow_manage::WorkflowManageTool,
    },
    workflow_manager::WorkflowManager,
    workflow_runner::WorkflowRunner,
};

/// All inputs required to build a set of agent engine dependencies.
pub struct EngineBuildInput {
    pub provider: Arc<Provider>,
    pub pool: Arc<SqlitePool>,
    pub home_dir: PathBuf,
    pub brave_api_key: Option<String>,
    pub gemini_api_key: Option<String>,
    pub config: AgentConfig,
    pub runtime: Arc<AgentRuntime>,
    pub system_broker: SharedSystemBroker,
    pub knowledge_graph: Option<Arc<dyn KnowledgeGraphAccess>>,
    // TODO(Task 10): wire guardrail pipeline to web tools for network policy enforcement.
    pub guardrail_pipeline: Option<Arc<GuardrailPipeline>>,
    pub broadcast_tx: tokio::sync::broadcast::Sender<serde_json::Value>,
}

pub const CORE_TOOLS: &[&str] = &[
    // File & shell
    "bash",
    "edit",
    "glob",
    "grep",
    "read",
    "write",
    // Memory
    "memory_search",
    "memory_write",
    // Communication
    "message",
    "request_user_input",
    // Web
    "web_fetch",
    "web_search",
    // Agent coordination
    "delegate",
    "session_manage",
    "session_send",
    "spawn_agent",
    // Workflows
    "run_workflow",
    "workflow_manage",
    // Scheduling
    "cron_list",
    "cron_manage",
    // Kanban / inter-agent task board
    "claim_task",
    "post_task",
    "review_task",
    "update_task",
    "team_status",
    // Inter-agent messaging
    "agent_inbox",
    // Tool discovery
    "tool_search",
];

pub struct EngineDeps {
    pub pool: Arc<SqlitePool>,
    pub conversation: Arc<ConversationManager>,
    pub tool_registry: Arc<ToolRegistry>,
    pub memory: Arc<MemoryManager>,
    pub skill_manager: Arc<SkillManager>,
    pub agent_manager: Arc<AgentManager>,
    pub workflow_manager: Arc<WorkflowManager>,
    pub kanban_store: Arc<KanbanStore>,
    pub cron_manager: Arc<CronManager>,
    pub workflow_runner: Arc<WorkflowRunner>,
    pub task_memory: Arc<AgentTaskMemory>,
    pub health_store: Arc<AgentHealthStore>,
    pub message_store: Arc<AgentMessageStore>,
    pub session_ctx: Arc<SessionToolContext>,
    pub home_dir: std::path::PathBuf,
    pub broadcast_tx: tokio::sync::broadcast::Sender<serde_json::Value>,
    pub task_notify: Arc<tokio::sync::Notify>,
}

pub fn build_engine_deps(input: EngineBuildInput) -> Result<EngineDeps> {
    let EngineBuildInput {
        provider,
        pool,
        home_dir,
        brave_api_key,
        gemini_api_key,
        config,
        runtime,
        system_broker,
        knowledge_graph,
        guardrail_pipeline: _guardrail_pipeline,
        broadcast_tx,
    } = input;

    let memory = Arc::new(MemoryManager::new(home_dir.clone()));
    let skills = Arc::new(SkillManager::new(home_dir.join("skills")));
    let workflow_manager = Arc::new(WorkflowManager::new(pool.clone()));
    let cron_manager = Arc::new(CronManager::new(pool.clone()));
    let task_memory = Arc::new(AgentTaskMemory::new(home_dir.clone()));
    let task_notify = Arc::new(tokio::sync::Notify::new());
    let kanban_store = Arc::new(KanbanStore::with_notify(pool.clone(), task_notify.clone()));
    let health_store = Arc::new(AgentHealthStore::new(pool.clone()));
    let message_store = Arc::new(AgentMessageStore::new(pool.clone()));

    let agent_manager = Arc::new(AgentManager::new(home_dir.join("agents")));

    // ConversationManager is constructed before the cyclic closure because
    // DelegateToAgentTool needs it to create isolated sub-conversations.
    let conversation = Arc::new(ConversationManager::new(pool.clone()));

    // Clone all variables needed inside Arc::new_cyclic closures before they
    // capture them. The closures are SYNC so all construction inside must be sync.
    let agent_manager_c2 = agent_manager.clone();
    let agent_manager_c3 = agent_manager.clone();
    let memory_c = memory.clone();
    let workflow_manager_c = workflow_manager.clone();
    let workflow_manager_c3 = workflow_manager.clone();
    let home_c = home_dir.clone();
    let brave_c = brave_api_key.clone();
    let system_broker_c = system_broker.clone();
    let graph_c = knowledge_graph.clone();
    let tool_timeout = config.tool_timeout_secs;

    // First Arc::new_cyclic builds the ToolRegistry. DelegateToAgentTool is
    // NOT registered here because it also needs Weak<SessionToolContext>, which
    // is only available in the second Arc::new_cyclic below. It is registered
    // there alongside SessionSendTool.
    let registry = Arc::new_cyclic(|_weak_registry| {
        let shell_exec = ShellExecTool::new(tool_timeout, system_broker_c.clone());

        let r = ToolRegistry::new();
        // Build WebSearchTool.
        let web_search = WebSearchTool::new(
            "https://api.search.brave.com/res/v1/web/search".to_owned(),
            brave_c,
        );
        r.register(web_search);
        r.register(ImageTool::new(
            gemini_api_key,
            home_c.join("documents/images"),
        ));
        r.register(FileReadTool::new(home_c.clone()));
        r.register(FileWriteTool::new(home_c.clone()).with_broker(system_broker_c.clone()));
        r.register(FileEditTool::new(home_c.clone()).with_broker(system_broker_c.clone()));
        r.register(GlobSearchTool::new(home_c.clone()));
        r.register(GrepSearchTool::new(home_c.clone()));
        r.register(shell_exec);
        r.register(PresentMessageTool::new());
        r.register(RequestUserInputTool::new(system_broker_c.clone()));
        r.register(MemorySearchTool::new(memory_c.clone()));
        r.register(MemoryWriteTool::new(memory_c, graph_c.clone()));
        r.register(WorkflowManageTool::new(
            workflow_manager_c,
            agent_manager_c3,
        ));
        if let Some(graph) = graph_c {
            r.register(KnowledgeGraphTool::new(graph));
        }
        r.register(SpawnAgentTool::new(agent_manager_c2));
        r
    });

    // Build WebFetchTool, attaching the provider.
    let web_fetch = WebFetchTool::new().with_provider(provider.clone());
    registry.register(web_fetch);
    registry.register(SessionManageTool::new(conversation.clone()));
    registry.register(cron_list_tool(cron_manager.clone()));

    // Kanban task board tools for inter-agent collaboration.
    registry.register(PostTaskTool::new(kanban_store.clone()));
    registry.register(ClaimTaskTool::new(kanban_store.clone()));
    registry.register(UpdateTaskTool::new(kanban_store.clone()));
    registry.register(ReviewTaskTool::new(kanban_store.clone()));
    registry.register(TeamStatusTool::new(kanban_store.clone()));

    // Inter-agent messaging tool.
    registry.register(AgentInboxTool::new(message_store.clone()));

    let _ = system_broker;

    // Use OnceLock so WorkflowRunner built inside the session_ctx closure can be
    // retrieved outside for storage in EngineDeps.
    let workflow_runner_once: Arc<std::sync::OnceLock<Arc<WorkflowRunner>>> =
        Arc::new(std::sync::OnceLock::new());

    // Build SessionToolContext with Arc::new_cyclic so that tools which need a
    // Weak<SessionToolContext> back-reference (ToolSearchTool, SessionSendTool,
    // cron_manage_tool, WorkflowRunner) can be registered/constructed inside the
    // closure without a retain cycle:
    //   SessionToolContext.pool → Arc<Tool> → Weak<SessionToolContext>
    let workflow_runner_once_c = workflow_runner_once.clone();
    let session_ctx = Arc::new_cyclic(|weak: &Weak<SessionToolContext>| {
        // WorkflowRunner and cron_manage need session_ctx; build WorkflowRunner here.
        let workflow_runner = Arc::new(WorkflowRunner {
            provider: provider.clone(),
            tool_registry: registry.clone(),
            session_ctx: weak.clone(),
            conversation: conversation.clone(),
            memory: memory.clone(),
            agent_manager: agent_manager.clone(),
            manager: workflow_manager.clone(),
            runtime: runtime.clone(),
            config: config.clone(),
        });
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
            config.clone(),
        ));
        // DelegateToAgentTool needs both Weak<ToolRegistry> and Weak<SessionToolContext>.
        // Registered here (inside session_ctx's Arc::new_cyclic) so that `weak` is the
        // live back-reference rather than the permanently-dead Weak::new() sentinel that
        // was previously used when the tool was registered in the registry closure.
        registry.register(DelegateToAgentTool {
            agent_manager: agent_manager.clone(),
            provider: provider.clone(),
            config: config.clone(),
            registry: Arc::downgrade(&registry),
            session_ctx: weak.clone(),
            task_memory: task_memory.clone(),
            conversation: conversation.clone(),
            home_dir: home_dir.clone(),
        });
        registry.register(cron_manage_tool(
            cron_manager.clone(),
            AgentTurnCtx {
                conversation: conversation.clone(),
                provider: provider.clone(),
                registry: Arc::downgrade(&registry),
                session_ctx: weak.clone(),
                memory: memory.clone(),
                skill_manager: skills.clone(),
                config: config.clone(),
            },
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
        memory,
        skill_manager: skills,
        agent_manager,
        workflow_manager,
        kanban_store,
        health_store,
        message_store,
        cron_manager,
        workflow_runner,
        task_memory,
        session_ctx,
        home_dir,
        broadcast_tx,
        task_notify,
    })
}
