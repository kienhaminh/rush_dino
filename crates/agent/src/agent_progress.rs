use std::collections::{BTreeMap, VecDeque};

use chrono::{DateTime, Duration, Utc};
use serde::Serialize;

use rushdino_common::{
    models::{Conversation, Message, Role, ToolCall},
    Result,
};

use crate::{agent_manager::AgentTemplate, conversation::ConversationManager};

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum AgentProgressCardStatus {
    Now,
    Recent,
    Blocked,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentProgressCard {
    pub id: String,
    pub status: AgentProgressCardStatus,
    pub title: String,
    pub source_tool: String,
    pub conversation_id: String,
    pub started_at: String,
    pub completed_at: String,
    pub is_error: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentProgressColumns {
    pub now: Vec<AgentProgressCard>,
    pub recent: Vec<AgentProgressCard>,
    pub blocked: Vec<AgentProgressCard>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentProgressSummary {
    pub now_count: usize,
    pub recent_count: usize,
    pub blocked_count: usize,
    pub total_count: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_activity_at: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentProgressLane {
    pub agent_id: String,
    pub name: String,
    pub emoji: String,
    pub summary: AgentProgressSummary,
    pub columns: AgentProgressColumns,
}

#[derive(Debug, Clone)]
pub struct AgentProgressAgentIdentity {
    pub id: String,
    pub name: String,
    pub emoji: String,
}

#[derive(Debug, Clone)]
pub struct AgentProgressEvent {
    pub id: String,
    pub agent_id: String,
    pub title: String,
    pub source_tool: String,
    pub conversation_id: String,
    pub started_at: DateTime<Utc>,
    pub completed_at: DateTime<Utc>,
    pub is_error: bool,
}

#[derive(Debug, Clone)]
struct AgentProgressLaneBuilder {
    identity: AgentProgressAgentIdentity,
    now: Vec<AgentProgressEvent>,
    recent: Vec<AgentProgressEvent>,
    blocked: Vec<AgentProgressEvent>,
}

impl AgentProgressLaneBuilder {
    fn from_identity(identity: AgentProgressAgentIdentity) -> Self {
        Self {
            identity,
            now: Vec::new(),
            recent: Vec::new(),
            blocked: Vec::new(),
        }
    }
}

#[derive(Debug, Clone)]
struct PendingToolCall {
    call: ToolCall,
    started_at: DateTime<Utc>,
}

pub async fn build_lanes_from_conversation_store(
    conversation: &ConversationManager,
    templates: Vec<AgentTemplate>,
    lookback_minutes: u32,
    per_column: usize,
    active_window_seconds: u32,
    now: DateTime<Utc>,
) -> Result<Vec<AgentProgressLane>> {
    let cutoff = now - Duration::minutes(i64::from(lookback_minutes.max(1)));
    let conversations = conversation.list_conversations().await?;
    let mut events = Vec::new();

    for record in conversations.into_iter().filter(|item| item.updated_at >= cutoff) {
        let messages = conversation.get_messages(&record.id).await?;
        events.extend(extract_delegate_events(&record, &messages));
    }

    let mut identities = templates
        .into_iter()
        .map(agent_identity_from_template)
        .collect::<Vec<_>>();
    identities.sort_by(|a, b| a.name.cmp(&b.name));

    Ok(build_lanes_from_events(
        identities,
        events,
        per_column,
        active_window_seconds,
        now,
    ))
}

pub fn build_lanes_from_events(
    identities: Vec<AgentProgressAgentIdentity>,
    events: Vec<AgentProgressEvent>,
    per_column: usize,
    active_window_seconds: u32,
    now: DateTime<Utc>,
) -> Vec<AgentProgressLane> {
    let mut lane_map = BTreeMap::<String, AgentProgressLaneBuilder>::new();
    let mut per_column = per_column;
    if per_column == 0 {
        per_column = 1;
    }

    for identity in identities {
        lane_map.insert(
            identity.id.clone(),
            AgentProgressLaneBuilder::from_identity(identity),
        );
    }

    for event in events {
        let status = classify_event(&event, active_window_seconds, now);
        let builder = lane_map
            .entry(event.agent_id.clone())
            .or_insert_with(|| AgentProgressLaneBuilder {
                identity: AgentProgressAgentIdentity {
                    id: event.agent_id.clone(),
                    name: humanize_agent_name(&event.agent_id),
                    emoji: "❔".to_owned(),
                },
                now: Vec::new(),
                recent: Vec::new(),
                blocked: Vec::new(),
            });

        match status {
            AgentProgressCardStatus::Now => builder.now.push(event),
            AgentProgressCardStatus::Recent => builder.recent.push(event),
            AgentProgressCardStatus::Blocked => builder.blocked.push(event),
        }
    }

    lane_map
        .into_values()
        .map(|mut builder| {
            builder
                .now
                .sort_by(|a, b| b.completed_at.cmp(&a.completed_at));
            builder
                .recent
                .sort_by(|a, b| b.completed_at.cmp(&a.completed_at));
            builder
                .blocked
                .sort_by(|a, b| b.completed_at.cmp(&a.completed_at));

            builder.now.truncate(per_column);
            builder.recent.truncate(per_column);
            builder.blocked.truncate(per_column);

            let now_cards = builder.now.into_iter().map(event_to_card_now).collect::<Vec<_>>();
            let recent_cards = builder
                .recent
                .into_iter()
                .map(event_to_card_recent)
                .collect::<Vec<_>>();
            let blocked_cards = builder
                .blocked
                .into_iter()
                .map(event_to_card_blocked)
                .collect::<Vec<_>>();

            let last_activity_at = now_cards
                .iter()
                .chain(recent_cards.iter())
                .chain(blocked_cards.iter())
                .map(|card| card.completed_at.as_str())
                .max()
                .map(|value| value.to_owned());

            let summary = AgentProgressSummary {
                now_count: now_cards.len(),
                recent_count: recent_cards.len(),
                blocked_count: blocked_cards.len(),
                total_count: now_cards.len() + recent_cards.len() + blocked_cards.len(),
                last_activity_at,
            };

            AgentProgressLane {
                agent_id: builder.identity.id,
                name: builder.identity.name,
                emoji: builder.identity.emoji,
                summary,
                columns: AgentProgressColumns {
                    now: now_cards,
                    recent: recent_cards,
                    blocked: blocked_cards,
                },
            }
        })
        .collect()
}

fn classify_event(
    event: &AgentProgressEvent,
    active_window_seconds: u32,
    now: DateTime<Utc>,
) -> AgentProgressCardStatus {
    if event.is_error {
        return AgentProgressCardStatus::Blocked;
    }
    let elapsed = now.signed_duration_since(event.completed_at).num_seconds();
    if elapsed <= i64::from(active_window_seconds.max(1)) {
        AgentProgressCardStatus::Now
    } else {
        AgentProgressCardStatus::Recent
    }
}

fn event_to_card_now(event: AgentProgressEvent) -> AgentProgressCard {
    AgentProgressCard {
        id: event.id,
        status: AgentProgressCardStatus::Now,
        title: event.title,
        source_tool: event.source_tool,
        conversation_id: event.conversation_id,
        started_at: event.started_at.to_rfc3339(),
        completed_at: event.completed_at.to_rfc3339(),
        is_error: event.is_error,
    }
}

fn event_to_card_recent(event: AgentProgressEvent) -> AgentProgressCard {
    AgentProgressCard {
        id: event.id,
        status: AgentProgressCardStatus::Recent,
        title: event.title,
        source_tool: event.source_tool,
        conversation_id: event.conversation_id,
        started_at: event.started_at.to_rfc3339(),
        completed_at: event.completed_at.to_rfc3339(),
        is_error: event.is_error,
    }
}

fn event_to_card_blocked(event: AgentProgressEvent) -> AgentProgressCard {
    AgentProgressCard {
        id: event.id,
        status: AgentProgressCardStatus::Blocked,
        title: event.title,
        source_tool: event.source_tool,
        conversation_id: event.conversation_id,
        started_at: event.started_at.to_rfc3339(),
        completed_at: event.completed_at.to_rfc3339(),
        is_error: event.is_error,
    }
}

fn extract_delegate_events(conversation: &Conversation, messages: &[Message]) -> Vec<AgentProgressEvent> {
    let mut pending = VecDeque::<PendingToolCall>::new();
    let mut events = Vec::new();

    for message in messages {
        match message.role {
            Role::Assistant => {
                if let Some(tool_calls) = &message.tool_calls {
                    for call in tool_calls {
                        pending.push_back(PendingToolCall {
                            call: call.clone(),
                            started_at: message.created_at,
                        });
                    }
                }
            }
            Role::Tool => {
                let Some(call) = pending.pop_front() else {
                    continue;
                };
                if call.call.name != "delegate_to_agent" {
                    continue;
                }
                events.push(AgentProgressEvent {
                    id: format!("{}:{}:{}", conversation.id, call.call.id, message.id),
                    agent_id: delegate_agent_name(&call.call).unwrap_or_else(|| "unknown-agent".to_owned()),
                    title: delegate_title(&call.call),
                    source_tool: call.call.name.clone(),
                    conversation_id: conversation.id.clone(),
                    started_at: call.started_at,
                    completed_at: message.created_at,
                    is_error: message.content.starts_with("[tool_error:"),
                });
            }
            _ => {}
        }
    }

    events
}

fn delegate_agent_name(call: &ToolCall) -> Option<String> {
    call.arguments
        .get("agent_name")
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn delegate_title(call: &ToolCall) -> String {
    let task = call
        .arguments
        .get("task")
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("Delegated task");
    let mut short = task.chars().take(160).collect::<String>();
    if task.chars().count() > 160 {
        short.push_str("...");
    }
    short
}

fn agent_identity_from_template(template: AgentTemplate) -> AgentProgressAgentIdentity {
    AgentProgressAgentIdentity {
        id: template.name.clone(),
        name: humanize_agent_name(&template.name),
        emoji: template.icon.unwrap_or_else(|| "🤖".to_owned()),
    }
}

fn humanize_agent_name(raw: &str) -> String {
    raw.split('-')
        .filter(|part| !part.is_empty())
        .map(|part| {
            let mut chars = part.chars();
            match chars.next() {
                Some(first) => {
                    let mut title = first.to_uppercase().to_string();
                    title.push_str(chars.as_str());
                    title
                }
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}
