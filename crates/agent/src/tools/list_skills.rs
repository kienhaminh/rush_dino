use std::sync::Arc;

use async_trait::async_trait;
use serde_json::{json, Value};

use rushdino_common::Result;

use crate::{skill_manager::SkillManager, tool_registry::Tool};

pub struct ListSkillsTool {
    manager: Arc<SkillManager>,
}

impl ListSkillsTool {
    pub fn new(manager: Arc<SkillManager>) -> Self {
        Self { manager }
    }
}

#[async_trait]
impl Tool for ListSkillsTool {
    fn name(&self) -> &str {
        "list_skills"
    }

    fn description(&self) -> &str {
        "List available local skills"
    }

    fn parameters(&self) -> Value {
        json!({"type": "object", "properties": {}})
    }

    async fn execute(&self, _args: Value) -> Result<String> {
        let skills = self.manager.list()?;
        if skills.is_empty() {
            return Ok("no skills found".to_owned());
        }
        Ok(skills
            .into_iter()
            .map(|skill| format!("- {}: {}", skill.name, skill.description))
            .collect::<Vec<_>>()
            .join("\n"))
    }
}
