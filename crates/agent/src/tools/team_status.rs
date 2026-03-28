//! Tool that exposes the current kanban board state to any agent,
//! enabling team-level situational awareness.

use std::sync::Arc;

use async_trait::async_trait;
use serde_json::{json, Value};

use rushdino_common::Result;

use crate::{
    kanban_store::KanbanStore,
    tool_registry::Tool,
};

pub struct TeamStatusTool {
    store: Arc<KanbanStore>,
}

impl TeamStatusTool {
    pub fn new(store: Arc<KanbanStore>) -> Self {
        Self { store }
    }
}

#[async_trait]
impl Tool for TeamStatusTool {
    fn name(&self) -> &str {
        "team_status"
    }

    fn description(&self) -> &str {
        "View the current status of all agents and tasks on the kanban board. \
         Shows active tasks (who is doing what), backlog count, and recently completed work. \
         Use this to coordinate with other agents and avoid duplicate effort."
    }

    fn keywords(&self) -> Vec<&str> {
        vec!["team", "status", "board", "kanban", "agents", "progress"]
    }

    fn parameters(&self) -> Value {
        json!({
            "type": "object",
            "properties": {},
            "required": []
        })
    }

    async fn execute(&self, _args: Value) -> Result<String> {
        let all_tasks = self.store.list_all_tasks().await?;

        let mut active = Vec::new();
        let mut backlog_count = 0;
        let mut in_review = Vec::new();
        let mut recently_done = Vec::new();

        for task in &all_tasks {
            match task.status {
                crate::kanban_store::TaskStatus::Backlog => backlog_count += 1,
                crate::kanban_store::TaskStatus::Claimed
                | crate::kanban_store::TaskStatus::InProgress => {
                    active.push(format!(
                        "- [{}] {} — \"{}\"",
                        task.assigned_agent.as_deref().unwrap_or("unassigned"),
                        task.status.as_str(),
                        task.title
                    ));
                }
                crate::kanban_store::TaskStatus::InReview => {
                    in_review.push(format!(
                        "- [{}] \"{}\"",
                        task.assigned_agent.as_deref().unwrap_or("unknown"),
                        task.title
                    ));
                }
                crate::kanban_store::TaskStatus::Done => {
                    recently_done.push(format!(
                        "- [{}] \"{}\"",
                        task.assigned_agent.as_deref().unwrap_or("unknown"),
                        task.title
                    ));
                }
                _ => {} // Blocked, Failed
            }
        }

        // Limit recently done to last 5.
        recently_done.truncate(5);

        let mut output = String::new();
        output.push_str("## Team Status\n\n");
        output.push_str(&format!("**Backlog**: {} tasks waiting\n\n", backlog_count));

        if active.is_empty() {
            output.push_str("**Active**: No agents are currently working on tasks.\n\n");
        } else {
            output.push_str(&format!("**Active** ({} tasks):\n", active.len()));
            for line in &active {
                output.push_str(line);
                output.push('\n');
            }
            output.push('\n');
        }

        if !in_review.is_empty() {
            output.push_str(&format!("**In Review** ({}):\n", in_review.len()));
            for line in &in_review {
                output.push_str(line);
                output.push('\n');
            }
            output.push('\n');
        }

        if !recently_done.is_empty() {
            output.push_str(&format!(
                "**Recently Completed** (last {}):\n",
                recently_done.len()
            ));
            for line in &recently_done {
                output.push_str(line);
                output.push('\n');
            }
        }

        Ok(output)
    }
}
