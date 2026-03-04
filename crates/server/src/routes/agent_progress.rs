use axum::{extract::Query, extract::State, Json};
use chrono::Utc;
use serde::{Deserialize, Serialize};

use rushdino_agent::AgentProgressLane;
use rushdino_common::Result;

use crate::state::AppState;

const DEFAULT_LOOKBACK_MINUTES: u32 = 180;
const DEFAULT_PER_COLUMN: usize = 8;
const DEFAULT_ACTIVE_WINDOW_SECONDS: u32 = 90;

#[derive(Debug, Deserialize)]
pub struct AgentProgressQuery {
    pub lookback_minutes: Option<u32>,
    pub per_column: Option<usize>,
    pub active_window_seconds: Option<u32>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentProgressResponse {
    pub generated_at: String,
    pub lookback_minutes: u32,
    pub active_window_seconds: u32,
    pub lanes: Vec<AgentProgressLane>,
}

pub async fn get_agent_progress(
    State(state): State<AppState>,
    Query(query): Query<AgentProgressQuery>,
) -> Result<Json<AgentProgressResponse>> {
    let lookback_minutes = query
        .lookback_minutes
        .unwrap_or(DEFAULT_LOOKBACK_MINUTES)
        .clamp(1, 24 * 60);
    let per_column = query.per_column.unwrap_or(DEFAULT_PER_COLUMN).clamp(1, 50);
    let active_window_seconds = query
        .active_window_seconds
        .unwrap_or(DEFAULT_ACTIVE_WINDOW_SECONDS)
        .clamp(1, 3600);

    let lanes = state
        .engine
        .build_agent_progress_lanes(lookback_minutes, per_column, active_window_seconds)
        .await?;

    Ok(Json(AgentProgressResponse {
        generated_at: Utc::now().to_rfc3339(),
        lookback_minutes,
        active_window_seconds,
        lanes,
    }))
}

#[cfg(test)]
mod tests {
    use chrono::{Duration, Utc};
    use serde_json::json;

    use rushdino_agent::{
        agent_progress::build_lanes_from_events, AgentProgressAgentIdentity, AgentProgressEvent,
    };

    #[test]
    fn success_mapping_goes_to_recent_column() {
        let now = Utc::now();
        let lanes = build_lanes_from_events(
            vec![AgentProgressAgentIdentity {
                id: "researcher".to_owned(),
                name: "Researcher".to_owned(),
                emoji: "🧭".to_owned(),
            }],
            vec![AgentProgressEvent {
                id: "card-1".to_owned(),
                agent_id: "researcher".to_owned(),
                title: "Compile source notes".to_owned(),
                source_tool: "delegate_to_agent".to_owned(),
                conversation_id: "conv-1".to_owned(),
                started_at: now - Duration::minutes(4),
                completed_at: now - Duration::minutes(3),
                is_error: false,
            }],
            8,
            90,
            now,
        );

        let lane = lanes
            .into_iter()
            .find(|item| item.agent_id == "researcher")
            .expect("researcher lane exists");
        assert_eq!(lane.columns.recent.len(), 1);
        assert_eq!(lane.columns.now.len(), 0);
        assert_eq!(lane.columns.blocked.len(), 0);
        assert!(!lane.columns.recent[0].is_error);
    }

    #[test]
    fn blocked_mapping_uses_blocked_column() {
        let now = Utc::now();
        let lanes = build_lanes_from_events(
            vec![AgentProgressAgentIdentity {
                id: "researcher".to_owned(),
                name: "Researcher".to_owned(),
                emoji: "🧭".to_owned(),
            }],
            vec![AgentProgressEvent {
                id: "card-1".to_owned(),
                agent_id: "researcher".to_owned(),
                title: "Compile source notes".to_owned(),
                source_tool: "delegate_to_agent".to_owned(),
                conversation_id: "conv-1".to_owned(),
                started_at: now - Duration::seconds(40),
                completed_at: now - Duration::seconds(10),
                is_error: true,
            }],
            8,
            90,
            now,
        );

        let lane = lanes
            .into_iter()
            .find(|item| item.agent_id == "researcher")
            .expect("researcher lane exists");
        assert_eq!(lane.columns.blocked.len(), 1);
        assert_eq!(lane.columns.now.len(), 0);
        assert_eq!(lane.columns.recent.len(), 0);
        assert!(lane.columns.blocked[0].is_error);
    }

    #[test]
    fn active_window_mapping_uses_now_column() {
        let now = Utc::now();
        let lanes = build_lanes_from_events(
            vec![AgentProgressAgentIdentity {
                id: "researcher".to_owned(),
                name: "Researcher".to_owned(),
                emoji: "🧭".to_owned(),
            }],
            vec![AgentProgressEvent {
                id: "card-1".to_owned(),
                agent_id: "researcher".to_owned(),
                title: "Compile source notes".to_owned(),
                source_tool: "delegate_to_agent".to_owned(),
                conversation_id: "conv-1".to_owned(),
                started_at: now - Duration::seconds(80),
                completed_at: now - Duration::seconds(20),
                is_error: false,
            }],
            8,
            90,
            now,
        );

        let lane = lanes
            .into_iter()
            .find(|item| item.agent_id == "researcher")
            .expect("researcher lane exists");
        assert_eq!(lane.columns.now.len(), 1);
        assert_eq!(lane.columns.recent.len(), 0);
        assert_eq!(lane.columns.blocked.len(), 0);
    }

    #[test]
    fn unknown_agent_fallback_creates_lane() {
        let now = Utc::now();
        let lanes = build_lanes_from_events(
            vec![],
            vec![AgentProgressEvent {
                id: "card-1".to_owned(),
                agent_id: "nonexistent-agent".to_owned(),
                title: "Compile source notes".to_owned(),
                source_tool: "delegate_to_agent".to_owned(),
                conversation_id: "conv-1".to_owned(),
                started_at: now - Duration::seconds(80),
                completed_at: now - Duration::seconds(20),
                is_error: false,
            }],
            8,
            90,
            now,
        );

        let lane = lanes
            .into_iter()
            .find(|item| item.agent_id == "nonexistent-agent")
            .expect("fallback lane exists");
        assert_eq!(lane.name, "Nonexistent Agent");
        assert_eq!(lane.emoji, "❔");
        assert_eq!(lane.columns.now.len(), 1);
    }

    #[test]
    fn card_contract_fields_are_present() {
        let now = Utc::now();
        let lanes = build_lanes_from_events(
            vec![AgentProgressAgentIdentity {
                id: "researcher".to_owned(),
                name: "Researcher".to_owned(),
                emoji: "🧭".to_owned(),
            }],
            vec![AgentProgressEvent {
                id: "card-1".to_owned(),
                agent_id: "researcher".to_owned(),
                title: "Compile source notes".to_owned(),
                source_tool: "delegate_to_agent".to_owned(),
                conversation_id: "conv-1".to_owned(),
                started_at: now - Duration::seconds(80),
                completed_at: now - Duration::seconds(20),
                is_error: false,
            }],
            8,
            90,
            now,
        );

        let payload = serde_json::to_value(lanes).expect("serialize lanes");
        let first = payload
            .as_array()
            .and_then(|items| items.first())
            .expect("first lane");
        let first_now = first
            .get("columns")
            .and_then(|columns| columns.get("now"))
            .and_then(|cards| cards.as_array())
            .and_then(|cards| cards.first())
            .expect("now card");

        let required = json!([
            "id",
            "status",
            "title",
            "sourceTool",
            "conversationId",
            "startedAt",
            "completedAt",
            "isError"
        ]);
        for field in required.as_array().expect("required array") {
            let key = field.as_str().expect("field key");
            assert!(first_now.get(key).is_some(), "missing key: {key}");
        }
    }
}
