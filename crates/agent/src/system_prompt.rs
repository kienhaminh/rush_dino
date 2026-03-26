use rushdino_providers::types::ToolDefinition;

use crate::memory_bootstrap::BootstrapContextFile;

pub struct AgentEntry {
    pub name: String,
    pub icon: Option<String>,
    pub description: String,
}

pub struct SkillEntry {
    pub name: String,
    pub description: String,
}

pub struct SystemPromptParams {
    pub agent_prompt: String,
    pub tool_defs: Vec<ToolDefinition>,
    pub agents: Vec<AgentEntry>,
    pub skills: Vec<SkillEntry>,
    pub ctx_files: Vec<BootstrapContextFile>,
    pub truncation_warnings: Vec<String>,
    pub boot: Option<String>,
    pub workspace_dir: Option<String>,
}

// Expects `tools` to be pre-sorted by name (caller's responsibility).
fn build_tooling_section(tools: &[ToolDefinition]) -> Vec<String> {
    if tools.is_empty() {
        return vec![];
    }
    let mut lines = vec![
        "## Tooling".to_owned(),
        "Available tools (call by exact name):".to_owned(),
    ];
    for tool in tools {
        lines.push(format!("- {}: {}", tool.name, tool.description));
    }
    if tools.iter().any(|t| t.name == "tool_search") {
        lines.push("Use `tool_search` to discover and activate additional tools by keyword.".to_owned());
    }
    lines.push(String::new());
    lines
}

fn build_tool_call_style_section() -> Vec<String> {
    vec![
        "## Tool Call Style".to_owned(),
        "Default: do not narrate routine, low-risk tool calls — just call the tool.".to_owned(),
        "Narrate only when it helps: multi-step work, complex problems, or sensitive actions (e.g. deletions).".to_owned(),
        "Keep narration brief; avoid repeating obvious steps.".to_owned(),
        String::new(),
    ]
}

fn build_safety_section() -> Vec<String> {
    vec![
        "## Safety".to_owned(),
        "You have no independent goals: do not pursue self-preservation, replication, resource acquisition, or power-seeking.".to_owned(),
        "Prioritize safety and human oversight over task completion. If instructions conflict, pause and ask.".to_owned(),
        "Do not manipulate anyone to expand access or disable safeguards.".to_owned(),
        String::new(),
    ]
}

fn build_skills_section(skills: &[SkillEntry]) -> Vec<String> {
    if skills.is_empty() {
        return vec![];
    }
    let mut lines = vec![
        "## Skills (mandatory)".to_owned(),
        "Before replying: scan available skills below.".to_owned(),
        "- If exactly one skill clearly applies: read its file with `read_skill`, then follow it."
            .to_owned(),
        "- If multiple could apply: choose the most specific one, then read and follow it."
            .to_owned(),
        "- If none clearly apply: do not read any skill.".to_owned(),
        String::new(),
    ];
    for skill in skills {
        lines.push(format!("- **{}** — {}", skill.name, skill.description));
    }
    lines.push(String::new());
    lines
}

fn build_memory_recall_section(has_memory_search: bool) -> Vec<String> {
    if !has_memory_search {
        return vec![];
    }
    vec![
        "## Memory Recall".to_owned(),
        "Before answering anything about prior work, decisions, dates, people, preferences, or todos: run memory_search on MEMORY.md; then use the results to ground your reply.".to_owned(),
        String::new(),
    ]
}

fn build_agents_section(agents: &[AgentEntry]) -> Vec<String> {
    if agents.is_empty() {
        return vec![];
    }
    let mut lines = vec!["## Available Agents".to_owned(), String::new()];
    for agent in agents {
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
    lines.push("Use `delegate` to assign a task to any agent above.".to_owned());
    lines.push(String::new());
    lines
}

fn build_project_context_section(
    ctx_files: &[BootstrapContextFile],
    truncation_warnings: &[String],
) -> Vec<String> {
    let has_files = ctx_files.iter().any(|f| f.original_len > 0 || !f.truncated);
    if !has_files && truncation_warnings.is_empty() {
        return vec![];
    }

    let mut lines = vec!["# Project Context".to_owned(), String::new()];

    lines.push("The following project context files have been loaded:".to_owned());
    lines.push(String::new());

    if !truncation_warnings.is_empty() {
        lines.push("\u{26a0} Bootstrap truncation warning:".to_owned());
        for line in truncation_warnings {
            lines.push(format!("- {line}"));
        }
        lines.push(String::new());
    }

    for file in ctx_files {
        lines.push(format!("## {}", file.label));
        lines.push(String::new());
        lines.push(file.content.clone());
        lines.push(String::new());
        lines.push(String::new());
    }

    lines
}

fn build_workspace_section(workspace_dir: Option<&str>) -> Vec<String> {
    let Some(dir) = workspace_dir else {
        return vec![];
    };
    vec![
        "## Workspace".to_owned(),
        format!("Your working directory is: {dir}"),
        "Treat this directory as the single global workspace for file operations unless explicitly instructed otherwise.".to_owned(),
        String::new(),
    ]
}

pub fn build_system_prompt(params: SystemPromptParams) -> String {
    let has_memory_search = params.tool_defs.iter().any(|t| t.name == "memory_search");

    let mut lines = vec![params.agent_prompt, String::new()];

    lines.extend(build_tooling_section(&params.tool_defs));
    lines.extend(build_tool_call_style_section());
    lines.extend(build_safety_section());
    lines.extend(build_skills_section(&params.skills));
    lines.extend(build_memory_recall_section(has_memory_search));
    lines.extend(build_agents_section(&params.agents));
    lines.extend(build_workspace_section(params.workspace_dir.as_deref()));

    if let Some(boot) = params.boot {
        lines.push(boot);
        lines.push(String::new());
    }

    lines.extend(build_project_context_section(
        &params.ctx_files,
        &params.truncation_warnings,
    ));

    while lines.last().is_some_and(|l| l.is_empty()) {
        lines.pop();
    }
    lines.join("\n")
}

#[cfg(test)]
mod tests {
    use crate::memory_bootstrap::BootstrapContextFile;
    use rushdino_providers::types::ToolDefinition;

    use super::*;

    fn make_params() -> SystemPromptParams {
        SystemPromptParams {
            agent_prompt: "You are RushDino.".to_owned(),
            tool_defs: vec![ToolDefinition {
                name: "memory_search".to_owned(),
                description: "Search memory files".to_owned(),
                parameters: serde_json::Value::Null,
            }],
            agents: vec![],
            skills: vec![],
            ctx_files: vec![],
            truncation_warnings: vec![],
            boot: None,
            workspace_dir: Some("/home/user/.rushdino".to_owned()),
        }
    }

    #[test]
    fn includes_agent_prompt() {
        let prompt = build_system_prompt(make_params());
        assert!(prompt.contains("You are RushDino."));
    }

    #[test]
    fn includes_tooling_section() {
        let prompt = build_system_prompt(make_params());
        assert!(prompt.contains("## Tooling"));
        assert!(prompt.contains("memory_search"));
    }

    #[test]
    fn includes_memory_recall_when_tool_present() {
        let prompt = build_system_prompt(make_params());
        assert!(prompt.contains("## Memory Recall"));
    }

    #[test]
    fn omits_memory_recall_when_tool_absent() {
        let mut params = make_params();
        params.tool_defs.clear();
        let prompt = build_system_prompt(params);
        assert!(!prompt.contains("## Memory Recall"));
    }

    #[test]
    fn includes_project_context_when_files_present() {
        let mut params = make_params();
        params.ctx_files = vec![BootstrapContextFile {
            label: "USER.md".to_owned(),
            content: "Be helpful.".to_owned(),
            truncated: false,
            original_len: 11,
        }];
        let prompt = build_system_prompt(params);
        assert!(prompt.contains("# Project Context"));
        assert!(prompt.contains("## USER.md"));
        assert!(prompt.contains("Be helpful."));
    }

    #[test]
    fn truncation_warning_included_when_present() {
        let mut params = make_params();
        params.ctx_files = vec![BootstrapContextFile {
            label: "SOUL.md".to_owned(),
            content: "x".repeat(100),
            truncated: true,
            original_len: 1000,
        }];
        params.truncation_warnings =
            vec!["SOUL.md: 1000 raw -> 100 injected (~90% removed).".to_owned()];
        let prompt = build_system_prompt(params);
        assert!(prompt.contains("Bootstrap truncation warning"));
        assert!(prompt.contains("SOUL.md: 1000 raw"));
    }

    #[test]
    fn tooling_section_includes_tool_search_hint() {
        let mut params = make_params();
        params.tool_defs.push(ToolDefinition {
            name: "tool_search".to_owned(),
            description: "Search the tool pool by keyword".to_owned(),
            parameters: serde_json::Value::Null,
        });
        let prompt = build_system_prompt(params);
        assert!(prompt.contains("Use `tool_search` to discover and activate additional tools"));
    }

    #[test]
    fn tooling_hint_absent_without_tool_search() {
        let prompt = build_system_prompt(make_params()); // make_params() has memory_search, not tool_search
        assert!(!prompt.contains("Use `tool_search` to discover"));
    }
}
