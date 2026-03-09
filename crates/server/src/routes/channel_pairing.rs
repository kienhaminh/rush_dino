use axum::{
    extract::{Path, State},
    Json,
};
use serde::Deserialize;
use serde_json::json;

use rushdino_common::{AppError, Result};

use crate::state::AppState;

#[derive(Debug, Deserialize)]
pub struct PairingDecisionBody {
    pub approved: bool,
}

pub async fn get_channel_pairing(
    State(state): State<AppState>,
    Path(channel_id): Path<String>,
) -> Result<Json<crate::channel_pairing::ChannelPairingState>> {
    validate_pairing_channel(&channel_id)?;
    Ok(Json(state.channel_pairing.get_state(&channel_id).await?))
}

pub async fn resolve_channel_pairing_request(
    State(state): State<AppState>,
    Path((channel_id, request_id)): Path<(String, String)>,
    Json(body): Json<PairingDecisionBody>,
) -> Result<Json<serde_json::Value>> {
    validate_pairing_channel(&channel_id)?;
    let paired = state
        .channel_pairing
        .decide_request(&channel_id, &request_id, body.approved)
        .await?;
    let status = if body.approved { "approved" } else { "denied" };
    let _ = state
        .runtime_logs
        .insert(
            "info",
            "pairing",
            "pairing decision recorded",
            Some(json!({
                "channelId": channel_id,
                "requestId": request_id,
                "status": status,
                "senderId": paired.as_ref().map(|entry| entry.sender_id.clone()),
            })),
        )
        .await;

    Ok(Json(json!({
        "requestId": request_id,
        "status": status,
    })))
}

pub async fn revoke_paired_sender(
    State(state): State<AppState>,
    Path((channel_id, sender_id)): Path<(String, String)>,
) -> Result<Json<serde_json::Value>> {
    validate_pairing_channel(&channel_id)?;
    let removed = state
        .channel_pairing
        .revoke_paired(&channel_id, &sender_id)
        .await?;
    if !removed {
        return Err(AppError::NotFound(format!(
            "paired sender '{sender_id}' not found for channel '{channel_id}'"
        )));
    }
    let _ = state
        .runtime_logs
        .insert(
            "info",
            "pairing",
            "paired sender revoked",
            Some(json!({
                "channelId": channel_id,
                "senderId": sender_id,
            })),
        )
        .await;

    Ok(Json(json!({
        "channelId": channel_id,
        "senderId": sender_id,
        "revoked": true,
    })))
}

fn validate_pairing_channel(channel_id: &str) -> Result<()> {
    match channel_id {
        "telegram" | "discord" => Ok(()),
        _ => Err(AppError::Validation(format!(
            "pairing is not supported for channel '{channel_id}'"
        ))),
    }
}
