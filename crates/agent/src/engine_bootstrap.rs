use chrono::Utc;
use uuid::Uuid;

use rushdino_common::models::{Message, Role};

use crate::{
    agent_manager::AgentManager,
    engine::AgentConfig,
    memory::MemoryManager,
    memory_bootstrap::{
        build_bootstrap_context, build_truncation_warning_lines, clamp_to_char_boundary,
    },
    skill_manager::SkillManager,
    system_prompt::{build_system_prompt, AgentEntry, SkillEntry, SystemPromptParams},
    tool_registry::SessionToolContext,
};

/// Resolve skills for the system prompt: graph-scored top-K if available, flat list fallback.
pub async fn resolve_skills_for_prompt(
    skill_manager: &SkillManager,
    skill_graph: Option<&rushdino_skill_graph::SkillGraphService>,
    user_input: &str,
) -> Vec<SkillEntry> {
    // Try graph-based routing first
    if let Some(graph) = skill_graph {
        match graph.query_top_skills(user_input, 5).await {
            Ok(scored) if scored.len() >= 2 => {
                return scored
                    .into_iter()
                    .map(|s| SkillEntry {
                        name: s.name,
                        description: s.description,
                    })
                    .collect();
            }
            Ok(_) => {
                tracing::debug!(
                    "skill graph returned fewer than 2 results, falling back to flat list"
                );
            }
            Err(err) => {
                tracing::warn!("skill graph query failed, falling back to flat list: {err}");
            }
        }
    }

    // Fallback: flat list of all skills
    skill_manager
        .list()
        .unwrap_or_default()
        .into_iter()
        .map(|s| SkillEntry {
            name: s.name,
            description: s.description,
        })
        .collect()
}

pub fn title_from(input: &str) -> &str {
    if input.len() <= 60 {
        return input;
    }
    &input[..clamp_to_char_boundary(input, 60)]
}

pub fn system_message(
    config: &AgentConfig,
    memory: &MemoryManager,
    agent_manager: &AgentManager,
    skills: Vec<SkillEntry>,
    session_ctx: &SessionToolContext,
) -> Message {
    // BOOTSTRAP.md, if present, replaces the agent prompt but still gets the full
    // system prompt (tooling, skills, agents) so the agent can use tools — including
    // shell_exec to delete BOOTSTRAP.md once first-run setup is complete.
    let agent_prompt = memory
        .read_named("BOOTSTRAP.md")
        .or_else(|_| memory.read_named("AGENTS.md"))
        .unwrap_or_else(|_| config.system_prompt.clone());

    let startup_files = memory.collect_startup_files();
    let ctx_files = build_bootstrap_context(
        startup_files,
        config.bootstrap_max_chars,
        config.bootstrap_total_max_chars,
    );
    let truncation_warnings = build_truncation_warning_lines(&ctx_files);

    let agents = agent_manager
        .list()
        .into_iter()
        .map(|a| AgentEntry {
            name: a.name,
            icon: a.icon,
            description: a.description,
        })
        .collect();

    let tool_defs = session_ctx.active_definitions(); // already sorted

    let content = build_system_prompt(SystemPromptParams {
        agent_prompt,
        tool_defs,
        agents,
        skills,
        ctx_files,
        truncation_warnings,
        boot: memory.read_named("BOOT.md").ok(),
        workspace_dir: Some(memory.root().display().to_string()),
    });

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
