use std::{fs, path::PathBuf};

use serde::{Deserialize, Serialize};

use rushdino_common::{AppError, Result};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Skill {
    pub name: String,
    pub description: String,
    pub instructions: String,
    pub tools: Option<Vec<String>>,
}

#[derive(Clone)]
pub struct SkillManager {
    skills_dir: PathBuf,
}

impl SkillManager {
    pub fn new(skills_dir: PathBuf) -> Self {
        Self { skills_dir }
    }

    pub fn load(&self, name: &str) -> Result<Skill> {
        let path = self.skills_dir.join(format!("{name}.toml"));
        let content = fs::read_to_string(path)?;
        toml::from_str(&content).map_err(|e| AppError::Validation(format!("invalid skill: {e}")))
    }

    pub fn save(&self, skill: &Skill) -> Result<PathBuf> {
        let path = self.skills_dir.join(format!("{}.toml", skill.name));
        let content = toml::to_string_pretty(skill)
            .map_err(|e| AppError::Validation(format!("failed to serialize skill: {e}")))?;
        fs::write(&path, content)?;
        Ok(path)
    }

    pub fn list(&self) -> Result<Vec<Skill>> {
        let mut skills = Vec::new();
        for entry in fs::read_dir(&self.skills_dir)? {
            let entry = entry?;
            if entry.path().extension().and_then(|x| x.to_str()) != Some("toml") {
                continue;
            }
            let content = fs::read_to_string(entry.path())?;
            if let Ok(skill) = toml::from_str(&content) {
                skills.push(skill);
            }
        }
        Ok(skills)
    }
}
