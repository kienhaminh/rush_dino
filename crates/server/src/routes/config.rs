//! Config API routes — read and update AppConfig / CredentialsConfig from the UI.
//!
//! GET  /api/config        — return current AppConfig as JSON
//! PATCH /api/config       — merge JSON patch into AppConfig, save to disk
//! GET  /api/credentials   — return CredentialsConfig as JSON
//! PATCH /api/credentials  — merge JSON patch, skip fields whose value is "***"

use axum::{extract::State, Json};
use serde_json::Value;
use std::sync::Arc;

use rushdino_common::{AppConfig, AppError, CredentialsConfig, Result};
use rushdino_gateway::ChannelAdapter;

use crate::state::AppState;

/// Redaction sentinel — used when frontend sends "***" to mean "unchanged".
const REDACTED: &str = "***";

/// GET /api/config — return the on-disk AppConfig as JSON.
pub async fn get_config(State(state): State<AppState>) -> Result<Json<Value>> {
    let config = AppConfig::load_from_path(&state.config_path)?;
    let value = serde_json::to_value(&config)
        .map_err(|e| AppError::Validation(format!("serialization error: {e}")))?;
    Ok(Json(value))
}

/// PATCH /api/config — deep-merge the JSON body into the current config and save.
pub async fn patch_config(
    State(state): State<AppState>,
    Json(patch): Json<Value>,
) -> Result<Json<Value>> {
    // Load the current config from disk, then merge the patch on top.
    let current = AppConfig::load_from_path(&state.config_path)?;
    let mut current_value = serde_json::to_value(&current)
        .map_err(|e| AppError::Validation(format!("serialization error: {e}")))?;
    json_merge(&mut current_value, patch);

    // Validate by deserializing into AppConfig before saving.
    let updated: AppConfig = serde_json::from_value(current_value)
        .map_err(|e| AppError::Validation(format!("invalid config: {e}")))?;
    validate_security_config(&updated)?;
    updated.save_to_path(&state.config_path)?;
    let credentials = CredentialsConfig::load_from_path(&state.credentials_path)?;
    if execution_runtime_reload_required_from_config(&current, &updated) {
        crate::refresh_engine_provider(&state).await?;
    }
    if gateway_runtime_reload_required_from_config(&current, &updated) {
        reconcile_gateway_adapters(&state, &updated, &credentials).await?;
    }
    if mcp_reload_required(&current, &updated) {
        if let Some(engine) = state.engine_opt() {
            let registry = engine.tool_registry.clone();
            let manager = state.mcp_manager.clone();
            let servers = updated.mcp_servers.clone();
            tokio::spawn(async move {
                manager.reconcile_and_register(&servers, registry).await;
            });
        } else {
            // No engine yet — just reconcile so status is updated
            let manager = state.mcp_manager.clone();
            let servers = updated.mcp_servers.clone();
            tokio::spawn(async move {
                manager.reconcile(&servers).await;
            });
        }
    }

    let result = serde_json::to_value(&updated)
        .map_err(|e| AppError::Validation(format!("serialization error: {e}")))?;
    Ok(Json(result))
}

/// GET /api/credentials — return CredentialsConfig as JSON (including telegram_bot_token).
pub async fn get_credentials(State(state): State<AppState>) -> Result<Json<Value>> {
    let creds = CredentialsConfig::load_from_path(&state.credentials_path)?;
    let value = serde_json::to_value(&creds)
        .map_err(|e| AppError::Validation(format!("serialization error: {e}")))?;
    Ok(Json(value))
}

/// PATCH /api/credentials — merge patch, skipping any field whose value is "***".
pub async fn patch_credentials(
    State(state): State<AppState>,
    Json(patch): Json<Value>,
) -> Result<Json<Value>> {
    let current = CredentialsConfig::load_from_path(&state.credentials_path)?;
    let mut current_value = serde_json::to_value(&current)
        .map_err(|e| AppError::Validation(format!("serialization error: {e}")))?;

    // Strip "***" sentinel values from patch so they don't overwrite existing secrets.
    let patch = strip_redacted(patch);
    json_merge(&mut current_value, patch);

    let updated: CredentialsConfig = serde_json::from_value(current_value)
        .map_err(|e| AppError::Validation(format!("invalid credentials: {e}")))?;
    tracing::info!(
        path = %state.credentials_path.display(),
        "saving credentials to disk"
    );
    updated.save_to_path(&state.credentials_path)?;
    if execution_runtime_reload_required_from_credentials(&current, &updated) {
        crate::refresh_engine_provider(&state).await?;
    }
    if gateway_runtime_reload_required_from_credentials(&current, &updated) {
        reconcile_gateway_adapters(
            &state,
            &AppConfig::load_from_path(&state.config_path)?,
            &updated,
        )
        .await?;
    }

    let result = serde_json::to_value(&updated)
        .map_err(|e| AppError::Validation(format!("serialization error: {e}")))?;
    Ok(Json(result))
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Remove any string fields equal to "***" from a JSON value (recursive).
/// Fields that are null are also preserved to allow explicit clearing.
fn strip_redacted(value: Value) -> Value {
    match value {
        Value::Object(map) => {
            let filtered = map
                .into_iter()
                .filter_map(|(k, v)| {
                    if matches!(&v, Value::String(s) if s == REDACTED) {
                        None // skip — user didn't change this field
                    } else {
                        Some((k, strip_redacted(v)))
                    }
                })
                .collect();
            Value::Object(filtered)
        }
        Value::Array(arr) => Value::Array(arr.into_iter().map(strip_redacted).collect()),
        other => other,
    }
}

/// Shallow/deep merge: `patch` values overwrite `base` values at the same path.
/// Objects are merged recursively; all other types are replaced.
fn json_merge(base: &mut Value, patch: Value) {
    match (base, patch) {
        (Value::Object(base_map), Value::Object(patch_map)) => {
            for (k, v) in patch_map {
                json_merge(base_map.entry(k).or_insert(Value::Null), v);
            }
        }
        (base, patch) => *base = patch,
    }
}

fn validate_security_config(config: &AppConfig) -> Result<()> {
    if config.security.dashboard_auth_enabled && config.security.hmac_auth_enabled {
        return Err(AppError::Validation(
            "dashboard auth cannot be enabled while HMAC auth is enabled".to_owned(),
        ));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use rushdino_common::{AppConfig, CredentialsConfig};

    use super::{
        execution_runtime_reload_required_from_config,
        execution_runtime_reload_required_from_credentials,
        gateway_runtime_reload_required_from_config,
        gateway_runtime_reload_required_from_credentials, validate_security_config,
    };

    #[test]
    fn credentials_reload_triggers_for_telegram_token_changes() {
        let current = CredentialsConfig::default();
        let updated = CredentialsConfig {
            telegram_bot_token: Some("123456:abc".to_owned()),
            ..CredentialsConfig::default()
        };

        assert!(gateway_runtime_reload_required_from_credentials(
            &current, &updated
        ));
    }

    #[test]
    fn credentials_reload_ignores_unrelated_secret_changes() {
        let current = CredentialsConfig::default();
        let updated = CredentialsConfig {
            brave_api_key: Some("brave-key".to_owned()),
            ..CredentialsConfig::default()
        };

        assert!(!gateway_runtime_reload_required_from_credentials(
            &current, &updated
        ));
    }

    #[test]
    fn config_reload_triggers_for_gateway_telegram_changes() {
        let current = AppConfig::default();
        let mut updated = AppConfig::default();
        updated.allowed_chat_ids.push(42);

        assert!(gateway_runtime_reload_required_from_config(
            &current, &updated
        ));
    }

    #[test]
    fn config_reload_ignores_unrelated_provider_changes() {
        let current = AppConfig::default();
        let mut updated = AppConfig::default();
        updated.openai.model = "gpt-5".to_owned();

        assert!(!gateway_runtime_reload_required_from_config(
            &current, &updated
        ));
    }

    #[test]
    fn config_reload_triggers_for_telegram_native_streaming_changes() {
        let current = AppConfig::default();
        let mut updated = AppConfig::default();
        updated.gateway.telegram.native_streaming = true;

        assert!(gateway_runtime_reload_required_from_config(
            &current, &updated
        ));
    }

    #[test]
    fn config_reload_triggers_for_default_profile_change() {
        let current = AppConfig::default();
        let mut updated = AppConfig::default();
        updated.default_profile_id = Some("profile-1".to_owned());

        assert!(execution_runtime_reload_required_from_config(
            &current, &updated
        ));
    }

    #[test]
    fn security_validation_rejects_dashboard_auth_with_hmac() {
        let mut config = AppConfig::default();
        config.security.dashboard_auth_enabled = true;
        config.security.hmac_auth_enabled = true;

        let error = validate_security_config(&config).expect_err("config should be rejected");
        assert!(
            error.to_string().contains("dashboard auth"),
            "error should mention dashboard auth conflict"
        );
    }

    #[test]
    fn credentials_reload_triggers_for_profile_secret_changes() {
        let current = CredentialsConfig::default();
        let mut updated = CredentialsConfig::default();
        updated.profiles.insert(
            "profile-1".to_owned(),
            rushdino_common::config::ProfileSecrets {
                api_key: Some("sk-test".to_owned()),
                ..rushdino_common::config::ProfileSecrets::default()
            },
        );

        assert!(execution_runtime_reload_required_from_credentials(
            &current, &updated
        ));
    }
}

fn gateway_runtime_reload_required_from_config(current: &AppConfig, updated: &AppConfig) -> bool {
    current.allowed_chat_ids != updated.allowed_chat_ids
        || current.gateway.telegram.enabled != updated.gateway.telegram.enabled
        || current.gateway.telegram.access != updated.gateway.telegram.access
        || current.gateway.telegram.native_streaming != updated.gateway.telegram.native_streaming
        || current.gateway.discord.enabled != updated.gateway.discord.enabled
        || current.gateway.discord.access != updated.gateway.discord.access
        || current.gateway.slack.enabled != updated.gateway.slack.enabled
}

fn gateway_runtime_reload_required_from_credentials(
    current: &CredentialsConfig,
    updated: &CredentialsConfig,
) -> bool {
    current.telegram_bot_token != updated.telegram_bot_token
        || current.discord_bot_token != updated.discord_bot_token
        || current.slack_bot_token != updated.slack_bot_token
        || current.slack_app_token != updated.slack_app_token
}

fn execution_runtime_reload_required_from_config(current: &AppConfig, updated: &AppConfig) -> bool {
    current.default_profile_id != updated.default_profile_id
}

fn mcp_reload_required(current: &AppConfig, updated: &AppConfig) -> bool {
    current.mcp_servers != updated.mcp_servers
}

fn execution_runtime_reload_required_from_credentials(
    current: &CredentialsConfig,
    updated: &CredentialsConfig,
) -> bool {
    current.profiles != updated.profiles
        || current.brave_api_key != updated.brave_api_key
        || current.gemini_api_key != updated.gemini_api_key
}

async fn reconcile_gateway_adapters(
    state: &AppState,
    config: &AppConfig,
    credentials: &CredentialsConfig,
) -> Result<()> {
    reconcile_telegram_adapter(state, config, credentials).await?;
    reconcile_discord_adapter(state, config, credentials).await?;
    reconcile_slack_adapter(state, config, credentials).await?;
    Ok(())
}

async fn reconcile_telegram_adapter(
    state: &AppState,
    config: &AppConfig,
    credentials: &CredentialsConfig,
) -> Result<()> {
    if !config.gateway.telegram.enabled {
        state.gateway_control.remove_adapter("telegram").await?;
        state.gateway_state.reporter("telegram").disabled().await;
        return Ok(());
    }

    let Some(token) = credentials
        .telegram_bot_token
        .as_deref()
        .filter(|value| !value.trim().is_empty())
    else {
        state.gateway_control.remove_adapter("telegram").await?;
        state
            .gateway_state
            .reporter("telegram")
            .degraded("telegram enabled but token missing")
            .await;
        return Ok(());
    };

    state
        .gateway_control
        .upsert_adapter(Arc::new(rushdino_telegram::TelegramAdapter::new(
            token.to_owned(),
            Arc::new(config.clone()),
        )) as Arc<dyn ChannelAdapter>)
        .await
}

async fn reconcile_discord_adapter(
    state: &AppState,
    config: &AppConfig,
    credentials: &CredentialsConfig,
) -> Result<()> {
    if !config.gateway.discord.enabled {
        state.gateway_control.remove_adapter("discord").await?;
        state.gateway_state.reporter("discord").disabled().await;
        return Ok(());
    }

    let Some(token) = credentials
        .discord_bot_token
        .as_deref()
        .filter(|value| !value.trim().is_empty())
    else {
        state.gateway_control.remove_adapter("discord").await?;
        state
            .gateway_state
            .reporter("discord")
            .degraded("discord enabled but token missing")
            .await;
        return Ok(());
    };

    state
        .gateway_control
        .upsert_adapter(
            Arc::new(rushdino_discord::DiscordAdapter::new(token)) as Arc<dyn ChannelAdapter>
        )
        .await
}

async fn reconcile_slack_adapter(
    state: &AppState,
    config: &AppConfig,
    credentials: &CredentialsConfig,
) -> Result<()> {
    if !config.gateway.slack.enabled {
        state.gateway_control.remove_adapter("slack").await?;
        state.gateway_state.reporter("slack").disabled().await;
        return Ok(());
    }

    let bot = credentials
        .slack_bot_token
        .as_deref()
        .filter(|value| !value.trim().is_empty());
    let app = credentials
        .slack_app_token
        .as_deref()
        .filter(|value| !value.trim().is_empty());
    let (Some(bot), Some(app)) = (bot, app) else {
        state.gateway_control.remove_adapter("slack").await?;
        state
            .gateway_state
            .reporter("slack")
            .degraded("slack enabled but tokens missing")
            .await;
        return Ok(());
    };

    state
        .gateway_control
        .upsert_adapter(
            Arc::new(rushdino_slack::SlackAdapter::new(bot, app)) as Arc<dyn ChannelAdapter>
        )
        .await
}
