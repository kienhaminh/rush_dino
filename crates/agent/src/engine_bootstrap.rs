use chrono::Utc;
use uuid::Uuid;

use rushdino_common::models::{Message, Role};

use crate::{
    engine::AgentConfig,
    memory::MemoryManager,
    memory_bootstrap::clamp_to_char_boundary,
    skill_manager::SkillManager,
    system_prompt::{build_system_prompt, SkillEntry, SystemPromptParams},
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
    skills: Vec<SkillEntry>,
    session_ctx: &SessionToolContext,
    agents: &[crate::agent_manager::AgentTemplate],
) -> Message {
    // BOOTSTRAP.md, if present, replaces the agent prompt but still gets the full
    // system prompt (tooling, skills) so the agent can use tools — including
    // shell_exec to delete BOOTSTRAP.md once first-run setup is complete.
    let agent_prompt = memory
        .read_named("BOOTSTRAP.md")
        .or_else(|_| memory.read_named("AGENTS.md"))
        .unwrap_or_else(|_| config.system_prompt.clone());

    let tool_defs = session_ctx.active_definitions(); // already sorted

    // Map AgentTemplate slice → AgentEntry vec for the system prompt renderer.
    use crate::system_prompt::AgentEntry;
    let agent_entries: Vec<AgentEntry> = agents
        .iter()
        .map(|a| AgentEntry {
            name: a.name.clone(),
            description: a.description.clone(),
            icon: a.icon.clone(),
        })
        .collect();

    let content = build_system_prompt(SystemPromptParams {
        agent_prompt,
        tool_defs,
        skills,
        agents: agent_entries,
        ctx_files: vec![],
        truncation_warnings: vec![],
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
    fn system_message_includes_agents_when_provided() {
        use crate::agent_manager::AgentTemplate;
        let config = AgentConfig::default();
        let temp = tempfile::tempdir().unwrap();
        let memory = MemoryManager::new(temp.path().to_owned());
        let session_ctx = SessionToolContext::new(vec![], &[]);
        let agents = vec![AgentTemplate {
            name: "researcher".to_owned(),
            description: "Research specialist".to_owned(),
            system_prompt: String::new(),
            icon: Some("📚".to_owned()),
            tools: None,
            color: None,
            model: None,
            claims_tasks: true,
            sandbox_policy: None,
        }];
        let msg = system_message(&config, &memory, vec![], &session_ctx, &agents);
        assert!(msg.content.contains("researcher"));
        assert!(msg.content.contains("Available Agents"));
    }

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
