//! AG-UI protocol endpoint (`POST /api/ag-ui/run`).
//!
//! Accepts an AG-UI `RunAgentInput` body, drives the existing
//! `AgentEngine::submit_ws_run` pipeline, and streams the response as
//! Server-Sent Events using AG-UI's canonical event vocabulary
//! (RUN_STARTED, TEXT_MESSAGE_*, TOOL_CALL_*, RUN_FINISHED, …).
//!
//! Approval and input-request gates piggy-back as CUSTOM events; the client
//! resolves them via the existing REST endpoints
//! (`POST /api/approval/:id`, `POST /api/input-requests/:id`).

mod mapper;
mod types;

#[cfg(test)]
mod mapper_tests;

use std::convert::Infallible;
use std::time::Duration;

use axum::{
    extract::State,
    response::{
        sse::{Event, KeepAlive, Sse},
        IntoResponse,
    },
    Json,
};
use serde_json::Value;
use tokio::sync::mpsc;

use rushdino_agent::engine::WsStreamEvent;

use crate::{state::AppState, ws::resolve_run_overrides};

pub use mapper::AguiMapper;
pub use types::{ForwardedProps, RunAgentInput};

fn agui_event(payload: Value) -> Event {
    Event::default()
        .json_data(payload)
        .expect("AG-UI payload is always valid JSON")
}

pub async fn run_stream(
    State(state): State<AppState>,
    Json(input): Json<RunAgentInput>,
) -> impl IntoResponse {
    let thread_id = input.thread_id.clone();
    let run_id = input.run_id.clone();
    let user_text = input.last_user_message().map(ToOwned::to_owned);
    let forwarded = input.forwarded_props.unwrap_or_default();
    let profile_id = forwarded.profile_id;
    let thinking_mode = forwarded.thinking_mode;

    // Per-run session id keeps multiple concurrent SSE streams isolated even
    // when they share a conversation/thread.
    let session_id = format!("ag-ui:{}:{}", thread_id, run_id);

    let mut approval_rx = state.gate.register_session(&session_id).await;
    let mut input_rx = state.input_gate.register_session(&session_id).await;

    let (event_tx, mut event_rx) = mpsc::channel::<WsStreamEvent>(128);

    let runtime = state.runtime.clone();
    let state_for_overrides = state.clone();
    let conversation_id = thread_id.clone();
    let session_for_engine = session_id.clone();
    tokio::spawn(async move {
        let engine = match runtime.engine() {
            Ok(e) => e,
            Err(err) => {
                let _ = event_tx
                    .send(WsStreamEvent::Error {
                        run_id: String::new(),
                        conversation_id: conversation_id.clone(),
                        message: err.to_string(),
                    })
                    .await;
                return;
            }
        };
        let overrides =
            match resolve_run_overrides(&state_for_overrides, profile_id, thinking_mode).await {
                Ok(o) => o,
                Err(err) => {
                    let _ = event_tx
                        .send(WsStreamEvent::Error {
                            run_id: String::new(),
                            conversation_id: conversation_id.clone(),
                            message: err.to_string(),
                        })
                        .await;
                    return;
                }
            };
        let user_text = user_text.unwrap_or_default();
        if let Err(err) = engine
            .submit_ws_run(
                &session_for_engine,
                Some(conversation_id.clone()),
                &user_text,
                overrides,
                event_tx.clone(),
            )
            .await
        {
            let _ = event_tx
                .send(WsStreamEvent::Error {
                    run_id: String::new(),
                    conversation_id,
                    message: err.to_string(),
                })
                .await;
        }
    });

    let gate_state = state.gate.clone();
    let input_gate_state = state.input_gate.clone();
    let session_cleanup = session_id.clone();
    let thread_for_stream = thread_id.clone();
    let run_for_stream = run_id.clone();

    let stream = async_stream::stream! {
        let mut mapper = AguiMapper::new(&thread_for_stream, &run_for_stream);
        yield Ok::<_, Infallible>(agui_event(mapper.run_started()));

        let mut terminated_with_error = false;
        loop {
            tokio::select! {
                event = event_rx.recv() => {
                    let Some(event) = event else { break };
                    let is_error = matches!(event, WsStreamEvent::Error { .. });
                    for agui in mapper.handle(event) {
                        yield Ok(agui_event(agui));
                    }
                    if is_error {
                        terminated_with_error = true;
                        break;
                    }
                }
                approval = approval_rx.recv() => {
                    let Some(req) = approval else { continue };
                    // sessionId is required by POST /api/approval/:id body, so
                    // surface it to the SSE consumer.
                    yield Ok(agui_event(serde_json::json!({
                        "type": "CUSTOM",
                        "name": "approval_request",
                        "value": {
                            "requestId": req.request_id,
                            "sessionId": req.session_id,
                            "runId": req.run_id,
                            "conversationId": req.conversation_id,
                            "tool": req.tool,
                            "args": req.args,
                        }
                    })));
                }
                input_req = input_rx.recv() => {
                    let Some(req) = input_req else { continue };
                    yield Ok(agui_event(serde_json::json!({
                        "type": "CUSTOM",
                        "name": "input_request",
                        "value": {
                            "requestId": req.request_id,
                            "sessionId": req.session_id,
                            "runId": req.run_id,
                            "conversationId": req.conversation_id,
                            "payload": req.payload,
                            "createdAt": req.created_at,
                        }
                    })));
                }
            }
        }

        for agui in mapper.flush() {
            yield Ok(agui_event(agui));
        }
        if !terminated_with_error {
            yield Ok(agui_event(mapper.run_finished()));
        }

        gate_state.unregister_session(&session_cleanup).await;
        input_gate_state.unregister_session(&session_cleanup).await;
    };

    Sse::new(stream).keep_alive(KeepAlive::new().interval(Duration::from_secs(15)))
}
