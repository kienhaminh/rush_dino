use rushdino_providers::types::ToolDefinition;

use crate::memory_bootstrap::BootstrapContextFile;

pub struct SkillEntry {
    pub name: String,
    pub description: String,
}

pub struct AgentEntry {
    pub name: String,
    pub description: String,
    pub icon: Option<String>,
}

pub struct SystemPromptParams {
    pub agent_prompt: String,
    pub tool_defs: Vec<ToolDefinition>,
    pub skills: Vec<SkillEntry>,
    pub agents: Vec<AgentEntry>,
    pub ctx_files: Vec<BootstrapContextFile>,
    pub truncation_warnings: Vec<String>,
    pub workspace_dir: Option<String>,
}

fn build_language_section() -> Vec<String> {
    vec![
        "## Language".to_owned(),
        "Always reply in the same language the user is writing in. If they write in Vietnamese, reply in Vietnamese. If English, reply in English. Match their language automatically.".to_owned(),
        String::new(),
    ]
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
        lines.push(
            "Use `tool_search` to discover and activate additional tools by keyword.".to_owned(),
        );
    }
    lines.push(String::new());
    lines
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

fn build_agents_section(agents: &[AgentEntry]) -> Vec<String> {
    if agents.is_empty() {
        return vec![];
    }
    let mut lines = vec![
        "## Available Agents".to_owned(),
        "Use `post_task` to delegate complex work. Use `delegate` for quick synchronous tasks."
            .to_owned(),
        String::new(),
    ];
    for agent in agents {
        let icon = agent.icon.as_deref().unwrap_or("🤖");
        lines.push(format!(
            "- **{}** {} — {}",
            agent.name, icon, agent.description
        ));
    }
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
        lines.push(file.content.trim_end().to_owned());
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
    let mut lines = vec![params.agent_prompt, String::new()];

    lines.extend(build_language_section());
    lines.extend(build_tooling_section(&params.tool_defs));
    lines.extend(build_safety_section());
    if !params.skills.is_empty() {
        lines.push("## Skills".to_owned());
        for skill in &params.skills {
            lines.push(format!("- {}: {}", skill.name, skill.description));
        }
        lines.push(String::new());
    }
    lines.extend(build_agents_section(&params.agents));
    lines.extend(build_workspace_section(params.workspace_dir.as_deref()));

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
            skills: vec![],
            agents: vec![],
            ctx_files: vec![],
            truncation_warnings: vec![],
            workspace_dir: Some("/home/user/.rushdino".to_owned()),
        }
    }

    #[test]
    fn includes_agent_prompt() {
        let prompt = build_system_prompt(make_params());
        assert!(prompt.contains("You are RushDino."));
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
    fn includes_agents_section_when_agents_present() {
        let mut params = make_params();
        params.agents = vec![
            AgentEntry {
                name: "researcher".to_owned(),
                description: "Research specialist".to_owned(),
                icon: Some("📚".to_owned()),
            },
            AgentEntry {
                name: "software-engineer".to_owned(),
                description: "Software engineer".to_owned(),
                icon: None,
            },
        ];
        let prompt = build_system_prompt(params);
        assert!(prompt.contains("## Available Agents"));
        assert!(prompt.contains("researcher"));
        assert!(prompt.contains("Research specialist"));
        assert!(prompt.contains("📚"));
        assert!(prompt.contains("software-engineer"));
        assert!(prompt.contains("🤖")); // fallback for icon: None
    }

    #[test]
    fn omits_agents_section_when_empty() {
        let params = make_params(); // agents defaults to vec![]
        let prompt = build_system_prompt(params);
        assert!(!prompt.contains("## Available Agents"));
    }

    #[test]
    fn indexes_all_skills_by_name_and_description() {
        let mut params = make_params();
        params.skills = vec![
            SkillEntry {
                name: "skill-creator".to_owned(),
                description: "Create and improve skills".to_owned(),
            },
            SkillEntry {
                name: "rushdino-cli".to_owned(),
                description: "Manage RushDino via CLI".to_owned(),
            },
        ];
        let prompt = build_system_prompt(params);
        assert!(prompt.contains("## Skills"));
        assert!(prompt.contains("- skill-creator: Create and improve skills"));
        assert!(prompt.contains("- rushdino-cli: Manage RushDino via CLI"));
        assert!(!prompt.contains("## Skills (mandatory)"));
        assert!(!prompt.contains("read_skill"));
    }
}
