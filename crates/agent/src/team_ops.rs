//! Operator team operations: persist teammates, assign work, and hand off tasks.
//!
//! These functions are the shipped persist / assign / handoff path used by the
//! HTTP API, CLI, and desktop HQ. They do not call an LLM.

use rushdino_common::{models::Role, AppError, Result};
use uuid::Uuid;

use crate::{
    agent_manager::{AgentManager, AgentTemplate},
    agent_message_store::{AgentMessage, AgentMessageState, AgentMessageStore},
    conversation::ConversationManager,
    engine_bootstrap::title_from,
};

/// Inbox sender identity for work assigned by the human operator.
pub const OPERATOR_ID: &str = "operator";

/// Tools every new teammate gets so they can receive inbox handoffs.
pub const DEFAULT_TEAM_TOOLS: &str = "agent_inbox";

/// File / structured-data tools plus inbox — used when the operator marks a
/// teammate as data-capable and does not specify a custom tool list.
pub const DEFAULT_DATA_TOOLS: &str = "read, write, edit, bash, glob, grep, agent_inbox";

/// Input for creating or updating a named teammate on disk.
#[derive(Debug, Clone, Default)]
pub struct PersistTeammateInput {
    pub name: String,
    pub description: String,
    pub system_prompt: String,
    pub icon: Option<String>,
    pub tools: Option<String>,
    pub skills: Option<String>,
    pub inbox_enabled: Option<bool>,
    pub claims_tasks: Option<bool>,
    pub claim_tags: Vec<String>,
    pub data_capable: bool,
}

/// Work the operator (or another agent) wants a named teammate to take.
#[derive(Debug, Clone)]
pub struct AssignWorkInput {
    pub agent_id: String,
    pub message: String,
}

/// One agent handing work to another. `from` may be [`OPERATOR_ID`].
#[derive(Debug, Clone)]
pub struct HandoffInput {
    pub from: String,
    pub to: String,
    pub message: String,
}

/// Persisted assignment attributable to a chosen teammate.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AssignmentRecord {
    pub assignment_id: String,
    pub agent_id: String,
    pub agent_name: String,
    pub conversation_id: String,
    pub from: String,
    pub to: String,
    pub message: String,
}

/// Normalize an operator-supplied name into a kebab-case agent id.
pub fn normalize_agent_name(raw: &str) -> String {
    raw.trim()
        .to_ascii_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-")
}

/// True when this teammate can work local files or structured data.
pub fn teammate_is_data_capable(template: &AgentTemplate) -> bool {
    if template.name == "data-analyst" {
        return true;
    }
    if template.claim_tags.iter().any(|tag| {
        matches!(
            tag.to_ascii_lowercase().as_str(),
            "data" | "analytics" | "statistics" | "csv" | "sql"
        )
    }) {
        return true;
    }
    template
        .tools
        .as_deref()
        .unwrap_or("")
        .split(',')
        .map(str::trim)
        .any(|tool| matches!(tool, "read" | "write" | "edit" | "bash" | "glob" | "grep"))
}

/// Persist (create or update) a teammate via [`AgentManager::save`], then reload it.
pub fn persist_teammate(
    manager: &AgentManager,
    input: PersistTeammateInput,
) -> Result<AgentTemplate> {
    let name = normalize_agent_name(&input.name);
    if name.is_empty() {
        return Err(AppError::Validation("agent name is required".to_owned()));
    }

    let description = flatten_front_matter(&input.description);
    if description.is_empty() {
        return Err(AppError::Validation("description is required".to_owned()));
    }

    let existing = manager.get(&name);
    let system_prompt = if input.system_prompt.trim().is_empty() {
        existing
            .as_ref()
            .map(|teammate| teammate.system_prompt.clone())
            .filter(|prompt| !prompt.is_empty())
            .unwrap_or_else(|| format!("You are {name}, a local teammate. {description}"))
    } else {
        input.system_prompt.trim().to_owned()
    };

    let tools = match input.tools {
        Some(ref raw) if !raw.trim().is_empty() => Some(raw.trim().to_owned()),
        _ if input.data_capable => Some(DEFAULT_DATA_TOOLS.to_owned()),
        _ => existing
            .as_ref()
            .and_then(|teammate| teammate.tools.clone())
            .or_else(|| Some(DEFAULT_TEAM_TOOLS.to_owned())),
    };

    let template = AgentTemplate {
        name: name.clone(),
        description,
        system_prompt,
        icon: input
            .icon
            .or_else(|| existing.as_ref().and_then(|t| t.icon.clone())),
        tools,
        skills: input
            .skills
            .or_else(|| existing.as_ref().and_then(|t| t.skills.clone())),
        color: existing.as_ref().and_then(|t| t.color.clone()),
        model: existing.as_ref().and_then(|t| t.model.clone()),
        inbox_enabled: input
            .inbox_enabled
            .unwrap_or_else(|| existing.as_ref().map(|t| t.inbox_enabled).unwrap_or(true)),
        claims_tasks: input
            .claims_tasks
            .unwrap_or_else(|| existing.as_ref().map(|t| t.claims_tasks).unwrap_or(true)),
        claim_tags: if input.claim_tags.is_empty() {
            existing
                .as_ref()
                .map(|t| t.claim_tags.clone())
                .unwrap_or_default()
        } else {
            input.claim_tags
        },
        sandbox_policy: existing.as_ref().and_then(|t| t.sandbox_policy.clone()),
    };

    manager.save(&template)?;
    manager
        .get(&name)
        .ok_or_else(|| AppError::Agent(format!("failed to reload persisted teammate {name}")))
}

/// List teammates from the same store the HTTP collection uses.
pub fn list_teammates(manager: &AgentManager) -> Vec<AgentTemplate> {
    manager.list()
}

/// Assign work to a named teammate. Persists an operator→agent inbox message
/// and a user message on that agent's conversation. Does not call an LLM.
pub async fn assign_work(
    manager: &AgentManager,
    messages: &AgentMessageStore,
    conversations: &ConversationManager,
    input: AssignWorkInput,
) -> Result<AssignmentRecord> {
    let agent_id = normalize_agent_name(&input.agent_id);
    let message = input.message.trim();
    if message.is_empty() {
        return Err(AppError::Validation(
            "assignment message is required".to_owned(),
        ));
    }

    let teammate = manager
        .get(&agent_id)
        .ok_or_else(|| AppError::Validation(format!("unknown agent: {agent_id}")))?;

    let delivered = deliver_message(manager, messages, OPERATOR_ID, &agent_id, message).await?;

    let conversation_id = agent_id.clone();
    let title = format!("{agent_id}: {}", title_from(message));
    conversations
        .create_agent_conversation(&conversation_id, &title)
        .await?;
    conversations
        .save_message(
            &conversation_id,
            &rushdino_common::models::Message::new(Uuid::new_v4().to_string(), Role::User, message),
        )
        .await?;

    Ok(AssignmentRecord {
        assignment_id: delivered.id,
        agent_id: teammate.name.clone(),
        agent_name: teammate.name,
        conversation_id,
        from: OPERATOR_ID.to_owned(),
        to: agent_id,
        message: message.to_owned(),
    })
}

/// Hand work from one teammate (or the operator) to another. Persists an
/// attributable inbox record. Does not call an LLM.
pub async fn handoff(
    manager: &AgentManager,
    messages: &AgentMessageStore,
    input: HandoffInput,
) -> Result<AgentMessage> {
    let from = input.from.trim();
    let to = normalize_agent_name(&input.to);
    let message = input.message.trim();
    if from.is_empty() {
        return Err(AppError::Validation(
            "handoff sender is required".to_owned(),
        ));
    }
    if to.is_empty() {
        return Err(AppError::Validation(
            "handoff receiver is required".to_owned(),
        ));
    }
    if message.is_empty() {
        return Err(AppError::Validation(
            "handoff message is required".to_owned(),
        ));
    }
    if from != OPERATOR_ID && manager.get(from).is_none() {
        return Err(AppError::Validation(format!("unknown agent: {from}")));
    }

    deliver_message(manager, messages, from, &to, message).await
}

async fn deliver_message(
    manager: &AgentManager,
    messages: &AgentMessageStore,
    from: &str,
    to: &str,
    content: &str,
) -> Result<AgentMessage> {
    let target = manager
        .get(to)
        .ok_or_else(|| AppError::Validation(format!("unknown agent: {to}")))?;
    let state = if target.inbox_enabled {
        AgentMessageState::Pending
    } else {
        AgentMessageState::Processed
    };
    messages.send(from, to, content, state, None).await
}

fn flatten_front_matter(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

#[cfg(test)]
#[path = "team_ops_tests.rs"]
mod tests;
