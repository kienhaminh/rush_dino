use axum::{
    extract::{ws::Message, State, WebSocketUpgrade},
    response::IntoResponse,
};
use futures::{SinkExt, StreamExt};
use serde::Deserialize;
use serde_json::json;
use tokio::sync::mpsc;
use uuid::Uuid;

use rushdino_agent::engine::{AssistantRunOverrides, WsStreamEvent};
use rushdino_common::CredentialsConfig;
use rushdino_providers::{types::ThinkingLevel, ProviderService};

use crate::{provider_runtime::{provider_kind_label, resolve_profile_provider}, state::AppState};

#[derive(Debug, Deserialize)]
struct WsChatRequest {
    conversation_id: Option<String>,
    message: String,
    profile_id: Option<String>,
    thinking_mode: Option<ThinkingLevel>,
}

pub async fn ws_chat(ws: WebSocketUpgrade, State(state): State<AppState>) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

async fn handle_socket(socket: axum::extract::ws::WebSocket, state: AppState) {
    let session_id = Uuid::new_v4().to_string();
    let mut approval_rx = state.gate.register_session(&session_id).await;
    let mut input_request_rx = state.input_gate.register_session(&session_id).await;
    let mut broadcast_rx = state.chat_broadcast.subscribe();
    let (mut ws_sink, mut ws_recv) = socket.split();

    let (outbound_tx, mut outbound_rx) = mpsc::channel::<serde_json::Value>(256);

    let mut send_task = tokio::spawn(async move {
        loop {
            tokio::select! {
                outbound = outbound_rx.recv() => {
                    let Some(payload) = outbound else { break };
                    if ws_sink.send(Message::Text(payload.to_string())).await.is_err() {
                        break;
                    }
                }
                approval = approval_rx.recv() => {
                    let Some(request) = approval else { break };
                    let payload = json!({
                        "type": "approval_request",
                        "request_id": request.request_id,
                        "run_id": request.run_id,
                        "conversation_id": request.conversation_id,
                        "tool": request.tool,
                        "args": request.args,
                    });
                    if ws_sink.send(Message::Text(payload.to_string())).await.is_err() {
                        break;
                    }
                }
                input_request = input_request_rx.recv() => {
                    let Some(request) = input_request else { break };
                    let payload = json!({
                        "type": "input_request",
                        "request_id": request.request_id,
                        "run_id": request.run_id,
                        "conversation_id": request.conversation_id,
                        "payload": request.payload,
                        "created_at": request.created_at,
                    });
                    if ws_sink.send(Message::Text(payload.to_string())).await.is_err() {
                        break;
                    }
                }
                broadcast = broadcast_rx.recv() => {
                    let Ok(payload) = broadcast else {
                        continue;
                    };
                    if ws_sink.send(Message::Text(payload.to_string())).await.is_err() {
                        break;
                    }
                }
            }
        }
    });

    let runtime = state.runtime.clone();
    let gate = state.gate.clone();
    let runtime_logs = state.runtime_logs.clone();
    let state_for_overrides = state.clone();
    let session_id_clone = session_id.clone();
    let mut recv_task = tokio::spawn(async move {
        let mut active_conversation: Option<String> = None;

        while let Some(Ok(message)) = ws_recv.next().await {
            let Message::Text(text) = message else {
                continue;
            };

            if let Some((request_id, approved)) = parse_approval_response(&text) {
                match gate.resolve(&session_id_clone, &request_id, approved).await {
                    Ok(request) => {
                        let _ = runtime_logs
                            .insert(
                                "info",
                                "approval",
                                "approval decision recorded",
                                Some(serde_json::json!({
                                    "requestId": request_id,
                                    "runId": request.run_id,
                                    "sessionId": session_id_clone,
                                    "tool": request.tool,
                                    "status": if approved { "approved" } else { "denied" },
                                })),
                            )
                            .await;
                        let _ = outbound_tx
                            .send(serde_json::json!({
                                "type": "approval_result",
                                "request_id": request.request_id,
                                "run_id": request.run_id,
                                "approved": approved,
                            }))
                            .await;
                    }
                    Err(err) => {
                        let _ = outbound_tx
                            .send(serde_json::json!({
                                "type": "approval_result",
                                "request_id": request_id,
                                "approved": approved,
                                "error": err.to_string(),
                            }))
                            .await;
                    }
                }
                continue;
            }

            let request = parse_chat_payload(&text, &active_conversation);
            let conversation_id = request.conversation_id;
            let user_text = request.message;
            let Some(user_text) = user_text else {
                continue;
            };
            let conversation_id = conversation_id.unwrap_or_else(|| Uuid::new_v4().to_string());

            let (event_tx, mut event_rx) = mpsc::channel::<WsStreamEvent>(128);
            let outbound_tx_clone = outbound_tx.clone();
            tokio::spawn(async move {
                while let Some(event) = event_rx.recv().await {
                    let payload = serialize_ws_event(event);
                    if outbound_tx_clone.send(payload).await.is_err() {
                        break;
                    }
                }
            });

            let engine = match runtime.engine() {
                Ok(engine) => engine,
                Err(err) => {
                    let _ = outbound_tx
                        .send(serde_json::json!({
                            "type": "error",
                            "message": err.to_string(),
                        }))
                        .await;
                    continue;
                }
            };
            let overrides = match resolve_run_overrides(
                &state_for_overrides,
                request.profile_id,
                request.thinking_mode,
            )
            .await
            {
                Ok(overrides) => overrides,
                Err(err) => {
                    let _ = outbound_tx
                        .send(serde_json::json!({
                            "type": "error",
                            "message": err.to_string(),
                        }))
                        .await;
                    continue;
                }
            };

            match engine
                .submit_ws_run(
                    &session_id_clone,
                    Some(conversation_id.clone()),
                    &user_text,
                    overrides,
                    event_tx,
                )
                .await
            {
                Ok(run) => {
                    active_conversation = run.conversation_id.or(Some(conversation_id));
                }
                Err(err) => {
                    let _ = outbound_tx
                        .send(serde_json::json!({
                            "type": "error",
                            "message": err.to_string(),
                        }))
                        .await;
                    let _ = outbound_tx
                        .send(serde_json::json!({
                            "type": "chat_chunk",
                            "conversation_id": conversation_id,
                            "delta": format!("Error: {err}"),
                            "tool_calls": [],
                            "done": true,
                        }))
                        .await;
                }
            }
        }
    });

    tokio::select! {
        _ = &mut send_task => recv_task.abort(),
        _ = &mut recv_task => send_task.abort(),
    }

    state.gate.unregister_session(&session_id).await;
    state.input_gate.unregister_session(&session_id).await;
}

fn parse_approval_response(text: &str) -> Option<(String, bool)> {
    let payload: serde_json::Value = serde_json::from_str(text).ok()?;
    if payload.get("type").and_then(|v| v.as_str()) != Some("approval_response") {
        return None;
    }
    let request_id = payload.get("request_id").and_then(|v| v.as_str())?;
    let approved = payload.get("approved").and_then(|v| v.as_bool())?;
    Some((request_id.to_owned(), approved))
}

/// Converts a [`WsStreamEvent`] into a JSON payload for the WebSocket wire.
/// Handles `DelegateEvent` recursively by serializing the inner event and
/// wrapping it with delegate metadata.
fn serialize_ws_event(event: WsStreamEvent) -> serde_json::Value {
    match event {
        WsStreamEvent::ChatChunk {
            run_id,
            conversation_id,
            chunk,
        } => serde_json::json!({
            "type": "chat_chunk",
            "run_id": run_id,
            "conversation_id": conversation_id,
            "delta": chunk.delta,
            "tool_calls": chunk.tool_calls,
            "done": chunk.done,
            "thinking_delta": chunk.thinking_delta,
        }),
        WsStreamEvent::AssistantReset {
            run_id,
            conversation_id,
        } => serde_json::json!({
            "type": "assistant_reset",
            "run_id": run_id,
            "conversation_id": conversation_id,
        }),
        WsStreamEvent::ToolStart {
            run_id,
            conversation_id,
            tool_call_id,
            tool_name,
            args,
        } => serde_json::json!({
            "type": "tool_start",
            "run_id": run_id,
            "conversation_id": conversation_id,
            "tool_call_id": tool_call_id,
            "tool_name": tool_name,
            "args": args,
        }),
        WsStreamEvent::ToolEnd {
            run_id,
            conversation_id,
            tool_call_id,
            tool_name,
            result,
            is_error,
        } => serde_json::json!({
            "type": "tool_end",
            "run_id": run_id,
            "conversation_id": conversation_id,
            "tool_call_id": tool_call_id,
            "tool_name": tool_name,
            "result": result,
            "is_error": is_error,
        }),
        WsStreamEvent::AssistantMessage {
            run_id,
            conversation_id,
            content,
            rich_content,
        } => serde_json::json!({
            "type": "assistant_message",
            "run_id": run_id,
            "conversation_id": conversation_id,
            "content": content,
            "rich_content": rich_content,
        }),
        WsStreamEvent::Error {
            run_id,
            conversation_id,
            message,
        } => serde_json::json!({
            "type": "error",
            "run_id": run_id,
            "conversation_id": conversation_id,
            "message": message,
        }),
        WsStreamEvent::DelegateEvent {
            delegate_conversation_id,
            agent_name,
            delegation_depth,
            inner,
        } => serde_json::json!({
            "type": "delegate_event",
            "delegate_conversation_id": delegate_conversation_id,
            "agent_name": agent_name,
            "delegation_depth": delegation_depth,
            "inner": serialize_ws_event(*inner),
        }),
    }
}

#[derive(Default)]
struct ParsedChatPayload {
    conversation_id: Option<String>,
    message: Option<String>,
    profile_id: Option<String>,
    thinking_mode: Option<ThinkingLevel>,
}

fn parse_chat_payload(text: &str, active_conversation: &Option<String>) -> ParsedChatPayload {
    if let Ok(request) = serde_json::from_str::<WsChatRequest>(text) {
        return ParsedChatPayload {
            conversation_id: request
                .conversation_id
                .or_else(|| active_conversation.clone()),
            message: Some(request.message),
            profile_id: request.profile_id,
            thinking_mode: request.thinking_mode,
        };
    }
    ParsedChatPayload {
        conversation_id: active_conversation.clone(),
        message: Some(text.to_owned()),
        profile_id: None,
        thinking_mode: None,
    }
}

pub(crate) async fn resolve_run_overrides(
    state: &AppState,
    profile_id: Option<String>,
    thinking_mode: Option<ThinkingLevel>,
) -> rushdino_common::Result<AssistantRunOverrides> {
    let mut overrides = AssistantRunOverrides {
        thinking_level: thinking_mode.clone(),
        ..AssistantRunOverrides::default()
    };

    let Some(profile_id) = profile_id.filter(|value| !value.trim().is_empty()) else {
        return Ok(overrides);
    };

    let config = state.config();
    let profile_overrides = resolve_profile_override(
        config.as_ref(),
        &state.credentials_path,
        &profile_id,
        thinking_mode,
    )
    .await?;
    overrides.provider = profile_overrides.provider;
    overrides.provider_name = profile_overrides.provider_name;
    overrides.model = profile_overrides.model;
    overrides.profile_id = profile_overrides.profile_id;
    Ok(overrides)
}

async fn resolve_profile_override(
    config: &rushdino_common::AppConfig,
    credentials_path: &std::path::Path,
    profile_id: &str,
    thinking_mode: Option<ThinkingLevel>,
) -> rushdino_common::Result<AssistantRunOverrides> {
    let mut credentials = CredentialsConfig::load_from_path(credentials_path)?;
    let resolved =
        resolve_profile_provider(config, &mut credentials, credentials_path, profile_id).await?;
    let provider = ProviderService::from_config(&resolved.provider_config)?;
    let model = provider.model().to_owned();

    Ok(AssistantRunOverrides {
        provider: Some(std::sync::Arc::new(provider)),
        provider_name: Some(provider_kind_label(&resolved.provider_kind).to_owned()),
        model: Some(model),
        profile_id: Some(resolved.profile_id),
        thinking_level: thinking_mode,
    })
}

#[cfg(test)]
mod tests {
    use std::fs;

    use rushdino_common::{
        config::{AuthMethod, ProfileSecrets, Provider, ProviderProfile},
        AppConfig, CredentialsConfig,
    };
    use rushdino_providers::types::ThinkingLevel;

    use super::{parse_chat_payload, resolve_profile_override};

    fn temp_credentials_path() -> std::path::PathBuf {
        std::env::temp_dir().join(format!(
            "rushdino-ws-overrides-{}.toml",
            uuid::Uuid::new_v4()
        ))
    }

    fn profile(id: &str, model: &str) -> ProviderProfile {
        ProviderProfile {
            id: id.to_owned(),
            name: id.to_owned(),
            provider_kind: Provider::OpenAI,
            auth_method: AuthMethod::ApiKey,
            default_model: model.to_owned(),
            base_url: Some("https://api.openai.com/v1".to_owned()),
        }
    }

    #[test]
    fn parse_chat_payload_reads_profile_and_thinking_mode() {
        let payload = parse_chat_payload(
            r#"{"conversation_id":"conv-1","message":"hello","profile_id":"primary","thinking_mode":"high"}"#,
            &None,
        );

        assert_eq!(payload.conversation_id.as_deref(), Some("conv-1"));
        assert_eq!(payload.message.as_deref(), Some("hello"));
        assert_eq!(payload.profile_id.as_deref(), Some("primary"));
        assert_eq!(payload.thinking_mode, Some(ThinkingLevel::High));
    }

    #[test]
    fn parse_chat_payload_uses_active_conversation_for_plain_text() {
        let payload = parse_chat_payload("hello", &Some("active-conv".to_owned()));

        assert_eq!(payload.conversation_id.as_deref(), Some("active-conv"));
        assert_eq!(payload.message.as_deref(), Some("hello"));
        assert_eq!(payload.profile_id, None);
        assert_eq!(payload.thinking_mode, None);
    }

    #[tokio::test]
    async fn resolve_profile_override_builds_run_specific_provider_and_model() {
        let credentials_path = temp_credentials_path();
        let mut config = AppConfig::default();
        config.profiles = vec![profile("primary", "gpt-5.4"), profile("secondary", "gpt-4.1-mini")];

        let mut credentials = CredentialsConfig::default();
        credentials.profiles.insert(
            "secondary".to_owned(),
            ProfileSecrets {
                api_key: Some("sk-secondary".to_owned()),
                ..ProfileSecrets::default()
            },
        );
        credentials
            .save_to_path(&credentials_path)
            .expect("credentials should save");

        let overrides = resolve_profile_override(
            &config,
            credentials_path.as_path(),
            "secondary",
            Some(ThinkingLevel::Low),
        )
        .await
        .expect("profile override should resolve");

        assert_eq!(overrides.profile_id.as_deref(), Some("secondary"));
        assert_eq!(overrides.provider_name.as_deref(), Some("openai"));
        assert_eq!(overrides.model.as_deref(), Some("gpt-4.1-mini"));
        assert_eq!(overrides.thinking_level, Some(ThinkingLevel::Low));
        assert!(overrides.provider.is_some(), "provider override should be built");

        let _ = fs::remove_file(credentials_path);
    }

    #[tokio::test]
    async fn resolve_profile_override_rejects_unknown_profile() {
        let credentials_path = temp_credentials_path();
        CredentialsConfig::default()
            .save_to_path(&credentials_path)
            .expect("credentials should save");

        let err = resolve_profile_override(
            &AppConfig::default(),
            credentials_path.as_path(),
            "missing",
            Some(ThinkingLevel::Medium),
        )
        .await
        .err()
        .expect("missing profile should fail");

        assert!(err.to_string().contains("does not exist"));

        let _ = fs::remove_file(credentials_path);
    }
}
