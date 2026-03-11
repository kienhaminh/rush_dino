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

    fn validate_name(name: &str) -> Result<()> {
        if name.is_empty() || name.contains('/') || name.contains('\\') || name.starts_with('.') {
            return Err(AppError::Validation(format!(
                "invalid skill name: {name:?}"
            )));
        }
        Ok(())
    }

    /// Parse a SKILL.md file (YAML-style frontmatter + markdown body).
    fn parse_skill_markdown(content: &str) -> Result<Skill> {
        let content = content
            .strip_prefix("---\n")
            .ok_or_else(|| AppError::Validation("SKILL.md missing frontmatter".into()))?;
        let close = content
            .find("\n---")
            .ok_or_else(|| AppError::Validation("SKILL.md missing closing ---".into()))?;
        let frontmatter = &content[..close];
        let body = content[close + 4..].trim().to_owned();

        let mut name = None;
        let mut description = None;
        let mut tools: Option<Vec<String>> = None;
        for line in frontmatter.lines() {
            if let Some((k, v)) = line.split_once(':') {
                match k.trim() {
                    "name" => name = Some(v.trim().to_owned()),
                    "description" => description = Some(v.trim().to_owned()),
                    "tools" => {
                        let list: Vec<String> = v
                            .split(',')
                            .map(|s| s.trim().to_owned())
                            .filter(|s| !s.is_empty())
                            .collect();
                        if !list.is_empty() {
                            tools = Some(list);
                        }
                    }
                    _ => {}
                }
            }
        }

        Ok(Skill {
            name: name
                .ok_or_else(|| AppError::Validation("SKILL.md missing 'name'".into()))?,
            description: description
                .ok_or_else(|| AppError::Validation("SKILL.md missing 'description'".into()))?,
            instructions: body,
            tools,
        })
    }

    /// Serialize a Skill back to SKILL.md format.
    fn format_skill_markdown(skill: &Skill) -> String {
        let mut fm = vec![
            "---".to_owned(),
            format!("name: {}", skill.name),
            format!("description: {}", skill.description),
        ];
        if let Some(tools) = &skill.tools {
            if !tools.is_empty() {
                fm.push(format!("tools: {}", tools.join(", ")));
            }
        }
        fm.push("---".to_owned());
        format!("{}\n\n{}", fm.join("\n"), skill.instructions)
    }

    pub fn load(&self, name: &str) -> Result<Skill> {
        Self::validate_name(name)?;
        let path = self.skills_dir.join(name).join("SKILL.md");
        let content = fs::read_to_string(path)?;
        Self::parse_skill_markdown(&content)
    }

    pub fn save(&self, skill: &Skill) -> Result<PathBuf> {
        Self::validate_name(&skill.name)?;
        let dir = self.skills_dir.join(&skill.name);
        fs::create_dir_all(&dir)?;
        let path = dir.join("SKILL.md");
        fs::write(&path, Self::format_skill_markdown(skill))?;
        Ok(path)
    }

    pub fn list(&self) -> Result<Vec<Skill>> {
        let mut skills = Vec::new();
        for entry in fs::read_dir(&self.skills_dir)? {
            let entry = entry?;
            if !entry.path().is_dir() {
                continue;
            }
            let skill_path = entry.path().join("SKILL.md");
            if !skill_path.exists() {
                continue;
            }
            if let Ok(content) = fs::read_to_string(&skill_path) {
                if let Ok(skill) = Self::parse_skill_markdown(&content) {
                    skills.push(skill);
                }
            }
        }
        Ok(skills)
    }

    pub fn delete(&self, name: &str) -> Result<()> {
        Self::validate_name(name)?;
        let dir = self.skills_dir.join(name);
        if dir.exists() {
            fs::remove_dir_all(dir)?;
        }
        Ok(())
    }
}
