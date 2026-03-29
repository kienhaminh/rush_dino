use std::{collections::HashSet, fs, path::PathBuf};

use serde::{Deserialize, Serialize};

use rushdino_common::{AppError, Result};

/// Represents a named agent template stored as a TOML or Markdown file.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AgentTemplate {
    pub name: String,
    pub description: String,
    pub system_prompt: String,
    pub icon: Option<String>,
    /// Informational list of tools available to this agent (e.g. "shell,web_search").
    #[serde(default)]
    pub tools: Option<String>,
    /// UI hint — a hex color or named color string for the agent's visual identity.
    #[serde(default)]
    pub color: Option<String>,
    /// Optional model identifier (e.g. "gpt-4o", "claude-sonnet-4-20250514"). When set,
    /// overrides the engine's default model for this agent's requests.
    #[serde(default)]
    pub model: Option<String>,
    /// Whether this agent participates in kanban auto-claim matching.
    /// Defaults to `true`. Set to `false` for meta-agents that should never claim tasks.
    #[serde(default = "default_claims_tasks")]
    pub claims_tasks: bool,
    /// Tags used by the kanban matching engine to route tasks to this agent.
    /// Comma-separated in the Markdown front-matter (e.g. "code, debugging, api").
    /// Falls back to `default_claim_tags()` in the matching engine when empty.
    #[serde(default)]
    pub claim_tags: Vec<String>,
    /// Optional sandbox policy loaded from `{agents_dir}/{name}/sandbox.yaml`.
    /// Present only when the file exists; absent for agents without a sandbox config.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sandbox_policy: Option<rushdino_security::policy::types::SandboxPolicy>,
}

fn default_claims_tasks() -> bool {
    true
}

/// Parses an agent template from Markdown front-matter format.
///
/// Expected format:
/// ```text
/// ---
/// name: my-agent
/// description: Does things
/// icon: 🤖
/// ---
///
/// System prompt body here.
/// ```
///
/// Returns `None` if:
/// - The content does not start with `---\n`
/// - The `name` field is missing from the front-matter
pub fn parse_agent_markdown(content: &str) -> Option<AgentTemplate> {
    if !content.starts_with("---\n") {
        return None;
    }

    // Skip the opening `---`
    let after_open = &content[4..];

    // Find the closing `---`
    let close_marker = after_open.find("\n---")?;
    let front_matter = &after_open[..close_marker];
    // Everything after `\n---` (skip the `\n---` itself, then optional newline)
    let body_start = close_marker + 4; // len("\n---") == 4
    let body_raw = &after_open[body_start..];
    let system_prompt = body_raw.trim().to_owned();

    // Parse key: value pairs from front-matter
    let mut name: Option<String> = None;
    let mut description: Option<String> = None;
    let mut icon: Option<String> = None;
    let mut tools: Option<String> = None;
    let mut color: Option<String> = None;
    let mut model: Option<String> = None;
    let mut claims_tasks: Option<bool> = None;
    let mut claim_tags: Option<String> = None;

    for line in front_matter.lines() {
        if let Some(colon_pos) = line.find(':') {
            let key = line[..colon_pos].trim();
            let value = line[colon_pos + 1..].trim().to_owned();
            match key {
                "name" => name = Some(value),
                "description" => description = Some(value),
                "icon" => icon = Some(value),
                "tools" => tools = Some(value),
                "color" => color = Some(value),
                "model" => model = Some(value),
                "claims_tasks" => claims_tasks = Some(value == "true"),
                "claim_tags" => claim_tags = Some(value),
                _ => {}
            }
        }
    }

    let name = name?; // name is required

    let claim_tags: Vec<String> = claim_tags
        .map(|s| {
            s.split(',')
                .map(|t| t.trim().to_owned())
                .filter(|t| !t.is_empty())
                .collect()
        })
        .unwrap_or_default();

    Some(AgentTemplate {
        name,
        description: description.unwrap_or_default(),
        system_prompt,
        icon,
        tools,
        color,
        model,
        claims_tasks: claims_tasks.unwrap_or(true),
        claim_tags,
        // sandbox_policy is populated by AgentManager::get/list after parsing.
        sandbox_policy: None,
    })
}

/// Manages agent templates stored as Markdown or TOML files in a directory.
#[derive(Clone)]
pub struct AgentManager {
    agents_dir: PathBuf,
}

impl AgentManager {
    pub fn new(agents_dir: PathBuf) -> Self {
        Self { agents_dir }
    }

    /// Rejects names that could escape the agents directory via path traversal.
    fn validate_name(name: &str) -> Result<()> {
        if name.is_empty() || name.contains('/') || name.contains('\\') || name.starts_with('.') {
            return Err(AppError::Validation(format!(
                "invalid agent name: {name:?}"
            )));
        }
        Ok(())
    }

    /// Reads an agent template by name — tries `.md` first, falls back to `.toml`.
    /// Returns None if neither file exists, the name is invalid, or parsing fails.
    /// Also probes `{agents_dir}/{name}/sandbox.yaml` and attaches the policy when found.
    pub fn get(&self, name: &str) -> Option<AgentTemplate> {
        Self::validate_name(name).ok()?;

        // Try .md first
        let md_path = self.agents_dir.join(format!("{name}.md"));
        let mut template = if md_path.exists() {
            let content = fs::read_to_string(md_path).ok()?;
            parse_agent_markdown(&content)?
        } else {
            // Fall back to .toml
            let toml_path = self.agents_dir.join(format!("{name}.toml"));
            let content = fs::read_to_string(toml_path).ok()?;
            toml::from_str(&content).ok()?
        };

        // Attach sandbox policy if a per-agent sandbox.yaml exists.
        template.sandbox_policy =
            rushdino_security::policy::types::SandboxPolicy::load_for_agent(&self.agents_dir, name)
                .ok()
                .flatten();

        Some(template)
    }

    /// Reads all `.md` and `.toml` agent files in the agents directory, skipping invalid ones.
    /// When both a `.md` and `.toml` exist for the same agent name, `.md` wins.
    /// Returns an empty vec if the directory is missing — this is not an error.
    pub fn list(&self) -> Vec<AgentTemplate> {
        let read_dir = match fs::read_dir(&self.agents_dir) {
            Ok(rd) => rd,
            Err(_) => return Vec::new(),
        };

        // Collect (is_md, template) tuples — md entries sort before toml entries
        let mut entries: Vec<(bool, AgentTemplate)> = Vec::new();
        for entry in read_dir.flatten() {
            let path = entry.path();
            match path.extension().and_then(|x| x.to_str()) {
                Some("md") => {
                    let Ok(content) = fs::read_to_string(&path) else {
                        continue;
                    };
                    if let Some(mut template) = parse_agent_markdown(&content) {
                        // Attach sandbox policy if a per-agent sandbox.yaml exists.
                        template.sandbox_policy = rushdino_security::policy::types::SandboxPolicy::load_for_agent(
                            &self.agents_dir,
                            &template.name,
                        )
                        .ok()
                        .flatten();
                        entries.push((true, template));
                    }
                }
                Some("toml") => {
                    let Ok(content) = fs::read_to_string(&path) else {
                        continue;
                    };
                    if let Ok(mut template) = toml::from_str::<AgentTemplate>(&content) {
                        // Attach sandbox policy if a per-agent sandbox.yaml exists.
                        template.sandbox_policy = rushdino_security::policy::types::SandboxPolicy::load_for_agent(
                            &self.agents_dir,
                            &template.name,
                        )
                        .ok()
                        .flatten();
                        entries.push((false, template));
                    }
                }
                _ => {}
            }
        }

        // Sort so .md entries come first (is_md = true → sorts before false)
        entries.sort_by(|(a_is_md, _), (b_is_md, _)| b_is_md.cmp(a_is_md));

        // Dedup by name — keep first occurrence (.md wins)
        let mut seen_names: HashSet<String> = HashSet::new();
        entries
            .into_iter()
            .filter_map(|(_, template)| {
                if seen_names.insert(template.name.clone()) {
                    Some(template)
                } else {
                    None
                }
            })
            .collect()
    }

    /// Writes an agent template to `{agents_dir}/{template.name}.md` in front-matter format.
    /// Creates the directory if it does not already exist.
    /// Returns the path where the file was written.
    pub fn save(&self, template: &AgentTemplate) -> Result<PathBuf> {
        Self::validate_name(&template.name)?;
        fs::create_dir_all(&self.agents_dir)?;
        let path = self.agents_dir.join(format!("{}.md", template.name));

        let mut content = String::from("---\n");
        content.push_str(&format!("name: {}\n", template.name));
        content.push_str(&format!("description: {}\n", template.description));
        if let Some(icon) = &template.icon {
            content.push_str(&format!("icon: {}\n", icon));
        }
        if let Some(tools) = &template.tools {
            content.push_str(&format!("tools: {}\n", tools));
        }
        if let Some(color) = &template.color {
            content.push_str(&format!("color: {}\n", color));
        }
        if let Some(model) = &template.model {
            content.push_str(&format!("model: {}\n", model));
        }
        if !template.claims_tasks {
            content.push_str("claims_tasks: false\n");
        }
        if !template.claim_tags.is_empty() {
            content.push_str(&format!("claim_tags: {}\n", template.claim_tags.join(", ")));
        }
        content.push_str("---\n\n");
        content.push_str(&template.system_prompt);

        fs::write(&path, content)?;
        Ok(path)
    }

    /// Deletes both `.md` and `.toml` files for the given agent name, plus any workspace directory.
    pub fn delete(&self, name: &str) -> Result<()> {
        Self::validate_name(name)?;

        let md_path = self.agents_dir.join(format!("{name}.md"));
        if md_path.exists() {
            fs::remove_file(&md_path)?;
        }

        let toml_path = self.agents_dir.join(format!("{name}.toml"));
        if toml_path.exists() {
            fs::remove_file(&toml_path)?;
        }

        let workspace_dir = self.agents_dir.join(name);
        if workspace_dir.exists() {
            fs::remove_dir_all(&workspace_dir)?;
        }

        Ok(())
    }
}

#[cfg(test)]
#[path = "agent_manager_tests.rs"]
mod tests;
