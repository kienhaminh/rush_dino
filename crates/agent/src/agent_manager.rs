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
    /// Optional preferred model ID for workflow steps using this agent.
    #[serde(default)]
    pub model: Option<String>,
    /// Informational list of tools available to this agent (e.g. "shell,web_search").
    #[serde(default)]
    pub tools: Option<String>,
    /// UI hint — a hex color or named color string for the agent's visual identity.
    #[serde(default)]
    pub color: Option<String>,
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
    let mut model: Option<String> = None;
    let mut tools: Option<String> = None;
    let mut color: Option<String> = None;

    for line in front_matter.lines() {
        if let Some(colon_pos) = line.find(':') {
            let key = line[..colon_pos].trim();
            let value = line[colon_pos + 1..].trim().to_owned();
            match key {
                "name" => name = Some(value),
                "description" => description = Some(value),
                "icon" => icon = Some(value),
                "model" => model = Some(value),
                "tools" => tools = Some(value),
                "color" => color = Some(value),
                _ => {}
            }
        }
    }

    let name = name?; // name is required

    Some(AgentTemplate {
        name,
        description: description.unwrap_or_default(),
        system_prompt,
        icon,
        model,
        tools,
        color,
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
    pub fn get(&self, name: &str) -> Option<AgentTemplate> {
        Self::validate_name(name).ok()?;

        // Try .md first
        let md_path = self.agents_dir.join(format!("{name}.md"));
        if md_path.exists() {
            let content = fs::read_to_string(md_path).ok()?;
            return parse_agent_markdown(&content);
        }

        // Fall back to .toml
        let toml_path = self.agents_dir.join(format!("{name}.toml"));
        let content = fs::read_to_string(toml_path).ok()?;
        toml::from_str(&content).ok()
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
                    if let Some(template) = parse_agent_markdown(&content) {
                        entries.push((true, template));
                    }
                }
                Some("toml") => {
                    let Ok(content) = fs::read_to_string(&path) else {
                        continue;
                    };
                    if let Ok(template) = toml::from_str::<AgentTemplate>(&content) {
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
        if let Some(model) = &template.model {
            content.push_str(&format!("model: {}\n", model));
        }
        if let Some(tools) = &template.tools {
            content.push_str(&format!("tools: {}\n", tools));
        }
        if let Some(color) = &template.color {
            content.push_str(&format!("color: {}\n", color));
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
mod tests {
    use std::io::Write;

    use uuid::Uuid;

    use super::*;

    fn temp_dir() -> PathBuf {
        std::env::temp_dir().join(Uuid::new_v4().to_string())
    }

    fn sample_template(name: &str) -> AgentTemplate {
        AgentTemplate {
            name: name.to_owned(),
            description: "A test agent".to_owned(),
            system_prompt: "You are a helpful assistant.".to_owned(),
            icon: None,
            model: None,
            tools: None,
            color: None,
        }
    }

    #[test]
    fn get_returns_none_for_missing_file() {
        let dir = temp_dir();
        fs::create_dir_all(&dir).unwrap();
        let manager = AgentManager::new(dir.clone());

        assert!(manager.get("nonexistent").is_none());

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn save_and_get_round_trip() {
        let dir = temp_dir();
        let manager = AgentManager::new(dir.clone());
        let template = sample_template("my-agent");

        manager.save(&template).expect("save should succeed");

        let loaded = manager.get("my-agent").expect("template should be found");
        assert_eq!(loaded, template);

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn list_returns_all_valid_agents() {
        let dir = temp_dir();
        let manager = AgentManager::new(dir.clone());
        let template = sample_template("list-agent");

        manager.save(&template).expect("save should succeed");

        let templates = manager.list();
        assert_eq!(templates.len(), 1);
        assert_eq!(templates[0], template);

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn list_skips_invalid_toml() {
        let dir = temp_dir();
        fs::create_dir_all(&dir).unwrap();
        let bad_path = dir.join("bad.toml");
        let mut file = fs::File::create(&bad_path).unwrap();
        file.write_all(b"not valid toml ][").unwrap();

        let manager = AgentManager::new(dir.clone());
        let templates = manager.list();
        assert!(templates.is_empty());

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn delete_removes_template_and_workspace() {
        let dir = temp_dir();
        let manager = AgentManager::new(dir.clone());
        let template = sample_template("delete-me");

        manager.save(&template).expect("save should succeed");
        fs::create_dir_all(dir.join("delete-me")).unwrap();
        fs::write(dir.join("delete-me").join("AGENTS.md"), "hello").unwrap();

        manager.delete("delete-me").expect("delete should succeed");

        assert!(!dir.join("delete-me.md").exists());
        assert!(!dir.join("delete-me.toml").exists());
        assert!(!dir.join("delete-me").exists());

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn markdown_round_trip() {
        let content =
            "---\nname: test-agent\ndescription: A test\nicon: 🤖\n---\n\nYou are a test agent.";
        let template = parse_agent_markdown(content).expect("should parse");
        assert_eq!(template.name, "test-agent");
        assert_eq!(template.description, "A test");
        assert_eq!(template.icon.as_deref(), Some("🤖"));
        assert_eq!(template.system_prompt, "You are a test agent.");
    }
}
