use std::{fs, path::PathBuf};

use serde::{Deserialize, Serialize};

use rushdino_common::{AppError, Result};

/// Represents a named agent template stored as a TOML file.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AgentTemplate {
    pub name: String,
    pub description: String,
    pub system_prompt: String,
    pub icon: Option<String>,
}

/// Manages agent templates stored as TOML files in a directory.
#[derive(Clone)]
pub struct AgentManager {
    agents_dir: PathBuf,
}

impl AgentManager {
    pub fn new(agents_dir: PathBuf) -> Self {
        Self { agents_dir }
    }

    /// Reads an agent template by name from `{agents_dir}/{name}.toml`.
    /// Returns None if the file is missing or invalid.
    pub fn get(&self, name: &str) -> Option<AgentTemplate> {
        let path = self.agents_dir.join(format!("{name}.toml"));
        let content = fs::read_to_string(path).ok()?;
        toml::from_str(&content).ok()
    }

    /// Reads all `.toml` files in the agents directory, skipping invalid ones.
    /// Returns an empty vec if the directory is missing — this is not an error.
    pub fn list(&self) -> Vec<AgentTemplate> {
        let read_dir = match fs::read_dir(&self.agents_dir) {
            Ok(rd) => rd,
            Err(_) => return Vec::new(),
        };

        let mut templates = Vec::new();
        for entry in read_dir.flatten() {
            if entry.path().extension().and_then(|x| x.to_str()) != Some("toml") {
                continue;
            }
            let Ok(content) = fs::read_to_string(entry.path()) else {
                continue;
            };
            if let Ok(template) = toml::from_str::<AgentTemplate>(&content) {
                templates.push(template);
            }
        }
        templates
    }

    /// Writes an agent template to `{agents_dir}/{template.name}.toml`.
    /// Creates the directory if it does not already exist.
    /// Returns the path where the file was written.
    pub fn save(&self, template: &AgentTemplate) -> Result<PathBuf> {
        fs::create_dir_all(&self.agents_dir)?;
        let path = self.agents_dir.join(format!("{}.toml", template.name));
        let content = toml::to_string_pretty(template)
            .map_err(|e| AppError::Validation(format!("failed to serialize agent template: {e}")))?;
        fs::write(&path, content)?;
        Ok(path)
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
        }
    }

    #[test]
    fn get_returns_none_for_missing_file() {
        let dir = temp_dir();
        fs::create_dir_all(&dir).unwrap();
        let manager = AgentManager::new(dir);

        assert!(manager.get("nonexistent").is_none());
    }

    #[test]
    fn save_and_get_round_trip() {
        let dir = temp_dir();
        let manager = AgentManager::new(dir);
        let template = sample_template("my-agent");

        manager.save(&template).expect("save should succeed");

        let loaded = manager.get("my-agent").expect("template should be found");
        assert_eq!(loaded, template);
    }

    #[test]
    fn list_returns_all_valid_tomls() {
        let dir = temp_dir();
        let manager = AgentManager::new(dir);
        let template = sample_template("list-agent");

        manager.save(&template).expect("save should succeed");

        let templates = manager.list();
        assert_eq!(templates.len(), 1);
        assert_eq!(templates[0].name, "list-agent");
    }

    #[test]
    fn list_skips_invalid_toml() {
        let dir = temp_dir();
        fs::create_dir_all(&dir).unwrap();
        let bad_path = dir.join("bad.toml");
        let mut file = fs::File::create(&bad_path).unwrap();
        file.write_all(b"not valid toml ][").unwrap();

        let manager = AgentManager::new(dir);
        let templates = manager.list();
        assert!(templates.is_empty());
    }
}
