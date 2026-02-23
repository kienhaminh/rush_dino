use std::sync::Arc;

use async_trait::async_trait;
use serde_json::{json, Value};

use rushdino_common::{AppError, Result};

use crate::{job_manager::JobManager, tool_registry::Tool};

pub struct CreateJobTool {
    manager: Arc<JobManager>,
}

impl CreateJobTool {
    pub fn new(manager: Arc<JobManager>) -> Self {
        Self { manager }
    }
}

#[async_trait]
impl Tool for CreateJobTool {
    fn name(&self) -> &str {
        "create_job"
    }

    fn description(&self) -> &str {
        "Create async background job"
    }

    fn parameters(&self) -> Value {
        json!({
            "type": "object",
            "properties": {"instructions": {"type": "string"}},
            "required": ["instructions"]
        })
    }

    async fn execute(&self, args: Value) -> Result<String> {
        let instructions = args
            .get("instructions")
            .and_then(Value::as_str)
            .ok_or_else(|| AppError::Validation("instructions is required".to_owned()))?;
        let id = self.manager.create_job(instructions.to_owned()).await?;
        Ok(format!("job created: {id}"))
    }
}
