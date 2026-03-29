use axum::{
    extract::{
        ws::{Message, WebSocketUpgrade},
        Path, State,
    },
    http::{header, HeaderMap, StatusCode},
    response::IntoResponse,
    Json,
};
use futures::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::json;
use tokio::sync::mpsc;

use rushdino_common::{AppConfig, AppError, Result};

use crate::{
    mobile_gateway::{AuthenticatedMobileGatewayKey, IssuedMobileGatewayKey, MobileGatewayKeyRecord},
    state::AppState,
};

#[derive(Debug, Deserialize)]
pub struct IssueMobileGatewayKeyBody {
    pub label: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MobileGatewayKeyListResponse {
    pub items: Vec<MobileGatewayKeyRecord>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MobileGatewayConnectResponse {
    pub channel_id: String,
    pub sender_id: String,
    pub label: Option<String>,
    pub publish_host: String,
    pub websocket_path: String,
    pub conversation_id: String,
}

#[derive(Debug, Deserialize)]
struct MobileWsChatRequest {
    message: String,
}

pub async fn list_mobile_gateway_keys(
    State(state): State<AppState>,
) -> Result<Json<MobileGatewayKeyListResponse>> {
    Ok(Json(MobileGatewayKeyListResponse {
        items: state.mobile_gateway.list_keys().await?,
    }))
}

pub async fn issue_mobile_gateway_key(
    State(state): State<AppState>,
    Json(body): Json<IssueMobileGatewayKeyBody>,
) -> Result<Json<IssuedMobileGatewayKey>> {
    let config = load_runtime_config(&state);
    let publish_host = mobile_publish_host(&config)?;
    Ok(Json(
        state
            .mobile_gateway
            .issue_key(body.label.as_deref(), &publish_host)
            .await?,
    ))
}

pub async fn revoke_mobile_gateway_key(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>> {
    let Some(record) = state.mobile_gateway.revoke_key(&id).await? else {
        return Err(AppError::NotFound(format!(
            "mobile gateway key '{id}' not found"
        )));
    };
    state
        .mobile_gateway_adapter
        .disconnect(&record.sender_id)
        .await;

    Ok(Json(json!({
        "id": id,
        "revoked": true,
    })))
}

pub async fn connect_mobile_gateway(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> impl IntoResponse {
    let auth = match authenticate_mobile_gateway(&state, &headers).await {
        Ok(auth) => auth,
        Err(response) => return response,
    };
    let config = load_runtime_config(&state);
    let publish_host = match mobile_publish_host(&config) {
        Ok(host) => host,
        Err(err) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": err.to_string() })),
            )
                .into_response()
        }
    };
    let gateway_session = match state
        .gateway_sessions
        .get_or_create("mobile", &auth.sender_id)
        .await
    {
        Ok(session) => session,
        Err(err) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": err.to_string() })),
            )
                .into_response()
        }
    };

    Json(MobileGatewayConnectResponse {
        channel_id: "mobile".to_owned(),
        sender_id: auth.sender_id,
        label: auth.label,
        publish_host,
        websocket_path: "/api/channels/mobile/ws".to_owned(),
        conversation_id: gateway_session.conversation_id,
    })
    .into_response()
}

pub async fn ws_mobile_gateway(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
    headers: HeaderMap,
) -> impl IntoResponse {
    let auth = match authenticate_mobile_gateway(&state, &headers).await {
        Ok(auth) => auth,
        Err(response) => return response,
    };
    let gateway_session = match state
        .gateway_sessions
        .get_or_create("mobile", &auth.sender_id)
        .await
    {
        Ok(session) => session,
        Err(err) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": err.to_string() })),
            )
                .into_response()
        }
    };
    let session_id = gateway_session.id.clone();

    ws.on_upgrade(move |socket| handle_mobile_socket(socket, state, auth, session_id))
        .into_response()
}

async fn handle_mobile_socket(
    socket: axum::extract::ws::WebSocket,
    state: AppState,
    auth: AuthenticatedMobileGatewayKey,
    session_id: String,
) {
    let mut approval_rx = state.gate.register_session(&session_id).await;
    let mut adapter_rx = state
        .mobile_gateway_adapter
        .connect(auth.sender_id.clone())
        .await;
    let (mut ws_sink, mut ws_recv) = socket.split();

    let (outbound_tx, mut outbound_rx) = mpsc::channel::<serde_json::Value>(256);
    let sender_id = auth.sender_id.clone();
    let session_id_for_send = session_id.clone();

    let mut send_task = tokio::spawn(async move {
        loop {
            tokio::select! {
                outbound = outbound_rx.recv() => {
                    let Some(payload) = outbound else { break };
                    if ws_sink.send(Message::Text(payload.to_string().into())).await.is_err() {
                        break;
                    }
                }
                outbound = adapter_rx.recv() => {
                    let Some(payload) = outbound else { break };
                    if ws_sink.send(Message::Text(payload.into())).await.is_err() {
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
                        "session_id": session_id_for_send,
                    });
                    if ws_sink.send(Message::Text(payload.to_string().into())).await.is_err() {
                        break;
                    }
                }
            }
        }
    });

    let gate = state.gate.clone();
    let adapter = state.mobile_gateway_adapter.clone();
    let session_id_for_recv = session_id.clone();
    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(message)) = ws_recv.next().await {
            let Message::Text(text) = message else {
                continue;
            };

            if let Some((request_id, approved)) = parse_approval_response(&text) {
                match gate.resolve(&session_id_for_recv, &request_id, approved).await {
                    Ok(request) => {
                        let _ = outbound_tx
                            .send(json!({
                                "type": "approval_result",
                                "request_id": request.request_id,
                                "run_id": request.run_id,
                                "approved": approved,
                            }))
                            .await;
                    }
                    Err(err) => {
                        let _ = outbound_tx
                            .send(json!({
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

            let Some(user_text) = parse_mobile_chat_payload(&text) else {
                continue;
            };
            if user_text.trim().is_empty() {
                continue;
            }
            adapter.handle_incoming(sender_id.clone(), user_text).await;
        }
    });

    tokio::select! {
        _ = &mut send_task => recv_task.abort(),
        _ = &mut recv_task => send_task.abort(),
    }

    state.mobile_gateway_adapter.disconnect(&auth.sender_id).await;
    state.gate.unregister_session(&session_id).await;
}

async fn authenticate_mobile_gateway(
    state: &AppState,
    headers: &HeaderMap,
) -> std::result::Result<AuthenticatedMobileGatewayKey, axum::response::Response> {
    let Some(token) = bearer_token(headers) else {
        return Err((
            StatusCode::UNAUTHORIZED,
            Json(json!({ "error": "mobile_api_key_required" })),
        )
            .into_response());
    };

    match state.mobile_gateway.validate_key(&token).await {
        Ok(Some(auth)) => Ok(auth),
        Ok(None) => Err((
            StatusCode::UNAUTHORIZED,
            Json(json!({ "error": "mobile_api_key_invalid" })),
        )
            .into_response()),
        Err(err) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": err.to_string() })),
        )
            .into_response()),
    }
}

fn load_runtime_config(state: &AppState) -> AppConfig {
    AppConfig::load_from_path(&state.config_path)
        .unwrap_or_else(|_| state.config().as_ref().clone())
}

fn mobile_publish_host(config: &AppConfig) -> Result<String> {
    let publish_host = config.gateway.mobile.publish_host.trim();
    if publish_host.is_empty() {
        return Err(AppError::Validation(
            "mobile gateway publish_host is empty".to_owned(),
        ));
    }
    Ok(publish_host.to_owned())
}

fn bearer_token(headers: &HeaderMap) -> Option<String> {
    let value = headers.get(header::AUTHORIZATION)?.to_str().ok()?;
    let (scheme, token) = value.split_once(' ')?;
    if !scheme.eq_ignore_ascii_case("bearer") {
        return None;
    }
    let token = token.trim();
    if token.is_empty() {
        None
    } else {
        Some(token.to_owned())
    }
}

fn parse_approval_response(text: &str) -> Option<(String, bool)> {
    let payload: serde_json::Value = serde_json::from_str(text).ok()?;
    if payload.get("type").and_then(|value| value.as_str()) != Some("approval_response") {
        return None;
    }
    let request_id = payload.get("request_id").and_then(|value| value.as_str())?;
    let approved = payload.get("approved").and_then(|value| value.as_bool())?;
    Some((request_id.to_owned(), approved))
}

fn parse_mobile_chat_payload(text: &str) -> Option<String> {
    if let Ok(request) = serde_json::from_str::<MobileWsChatRequest>(text) {
        return Some(request.message);
    }
    Some(text.to_owned())
}
