use std::sync::Arc;

use async_trait::async_trait;
use serde_json::{json, Value};

use rushdino_common::{AppError, Result};

use crate::{skill_manager::Skill, skill_manager::SkillManager, tool_registry::Tool};

pub struct CreateSkillTool {
    manager: Arc<SkillManager>,
}

impl CreateSkillTool {
    pub fn new(manager: Arc<SkillManager>) -> Self {
        Self { manager }
    }
}

#[async_trait]
impl Tool for CreateSkillTool {
    fn name(&self) -> &str {
        "create_skill"
    }

    fn description(&self) -> &str {
        "Create or update a TOML skill in ~/.rushdino/skills"
    }

    fn parameters(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "description": {"type": "string"},
                "instructions": {"type": "string"},
                "tools": {"type": "array", "items": {"type": "string"}}
            },
            "required": ["name", "description", "instructions"]
        })
    }

    async fn execute(&self, args: Value) -> Result<String> {
        let name = args
            .get("name")
            .and_then(Value::as_str)
            .ok_or_else(|| AppError::Validation("name is required".to_owned()))?;
        let description = args
            .get("description")
            .and_then(Value::as_str)
            .ok_or_else(|| AppError::Validation("description is required".to_owned()))?;
        let instructions = args
            .get("instructions")
            .and_then(Value::as_str)
            .ok_or_else(|| AppError::Validation("instructions is required".to_owned()))?;
        let tools = args.get("tools").and_then(Value::as_array).map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(ToOwned::to_owned)
                .collect::<Vec<_>>()
        });

        let path = self.manager.save(&Skill {
            name: name.to_owned(),
            description: description.to_owned(),
            instructions: instructions.to_owned(),
            tools,
        })?;

        Ok(format!("skill saved: {}", path.display()))
    }
}
