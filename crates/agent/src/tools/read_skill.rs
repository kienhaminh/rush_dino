use std::sync::Arc;

use async_trait::async_trait;
use serde_json::{json, Value};

use rushdino_common::{AppError, Result};

use crate::{skill_manager::SkillManager, tool_registry::Tool};

pub struct ReadSkillTool {
    manager: Arc<SkillManager>,
}

impl ReadSkillTool {
    pub fn new(manager: Arc<SkillManager>) -> Self {
        Self { manager }
    }
}

#[async_trait]
impl Tool for ReadSkillTool {
    fn name(&self) -> &str {
        "read_skill"
    }

    fn description(&self) -> &str {
        "Read the full instructions of a named skill. \
         Always call with name='skill-creator' before creating a new skill."
    }

    fn parameters(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "name": {"type": "string"}
            },
            "required": ["name"]
        })
    }

    async fn execute(&self, args: Value) -> Result<String> {
        let name = args
            .get("name")
            .and_then(Value::as_str)
            .ok_or_else(|| AppError::Validation("name is required".to_owned()))?;
        let skill = self.manager.load(name)?;
        Ok(format!(
            "# {}\n\n**Description:** {}\n\n**Instructions:**\n\n{}",
            skill.name, skill.description, skill.instructions
        ))
    }
}
