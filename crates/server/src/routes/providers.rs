use crate::state::AppState;
use axum::{
    extract::{Path, State},
    Json,
};
use rushdino_common::{
    config::{AuthMethod, ProfileSecrets, ProviderKind, ProviderProfile},
    AppConfig, AppError, CredentialsConfig, Result,
};
use rushdino_providers::types::{ModelInfo, ProviderConfig};
use rushdino_providers::Provider;
use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct CreateProfileRequest {
    pub name: String,
    pub provider_kind: ProviderKind,
    pub auth_method: AuthMethod,
    pub default_model: String,
    pub base_url: Option<String>,
    pub api_key: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateProfileRequest {
    pub name: String,
    pub auth_method: AuthMethod,
    pub default_model: String,
    pub base_url: Option<String>,
    pub api_key: Option<String>,
}

pub async fn list_profiles(State(state): State<AppState>) -> Result<Json<Vec<ProviderProfile>>> {
    let config = AppConfig::load_from_path(&state.config_path)?;
    Ok(Json(config.profiles.clone()))
}

pub async fn create_profile(
    State(state): State<AppState>,
    Json(payload): Json<CreateProfileRequest>,
) -> Result<Json<ProviderProfile>> {
    tracing::info!("POST /api/profiles - creating profile: {}", payload.name);
    let mut config = AppConfig::load_from_path(&state.config_path)?;
    let mut credentials = CredentialsConfig::load_from_path(&state.credentials_path)?;

    let id = uuid::Uuid::new_v4().to_string();

    let profile = ProviderProfile {
        id: id.clone(),
        name: payload.name,
        provider_kind: payload.provider_kind,
        auth_method: payload.auth_method,
        default_model: payload.default_model,
        base_url: payload.base_url,
    };

    config.profiles.push(profile.clone());
    if config.default_profile_id.is_none() {
        config.default_profile_id = Some(id.clone());
    }

    if let Some(api_key) = payload.api_key {
        let mut secrets = ProfileSecrets::default();
        secrets.api_key = Some(api_key);
        credentials.profiles.insert(id.clone(), secrets);
    }

    config.save_to_path(&state.config_path)?;
    credentials.save_to_path(&state.credentials_path)?;

    // Refresh engine with new config
    let _ = crate::refresh_engine_provider(&state).await;

    Ok(Json(profile))
}

pub async fn update_profile(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(payload): Json<UpdateProfileRequest>,
) -> Result<Json<ProviderProfile>> {
    let mut config = AppConfig::load_from_path(&state.config_path)?;
    let mut credentials = CredentialsConfig::load_from_path(&state.credentials_path)?;

    let profile = config
        .profiles
        .iter_mut()
        .find(|p| p.id == id)
        .ok_or_else(|| AppError::Validation(format!("Profile not found: {}", id)))?;

    profile.name = payload.name;
    profile.auth_method = payload.auth_method;
    profile.default_model = payload.default_model;
    profile.base_url = payload.base_url;

    if let Some(api_key) = payload.api_key {
        let mut secrets = credentials.profiles.entry(id.clone()).or_default().clone();
        if api_key.is_empty() {
            secrets.api_key = None;
        } else {
            secrets.api_key = Some(api_key);
        }
        credentials.profiles.insert(id.clone(), secrets);
    }

    let updated_profile = profile.clone();

    config.save_to_path(&state.config_path)?;
    credentials.save_to_path(&state.credentials_path)?;

    // Refresh engine with new config
    let _ = crate::refresh_engine_provider(&state).await;

    Ok(Json(updated_profile))
}

pub async fn delete_profile(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>> {
    let mut config = AppConfig::load_from_path(&state.config_path)?;
    let mut credentials = CredentialsConfig::load_from_path(&state.credentials_path)?;

    if config.default_profile_id.as_deref() == Some(id.as_str()) {
        config.default_profile_id = None;
    }
    config.fallback_profile_ids.retain(|fid| fid != &id);
    config.profiles.retain(|p| p.id != id);
    credentials.profiles.remove(&id);

    // If default profile was deleted, pick the first available one as default
    if config.default_profile_id.is_none() {
        config.default_profile_id = config.profiles.first().map(|p| p.id.clone());
    }

    config.save_to_path(&state.config_path)?;
    credentials.save_to_path(&state.credentials_path)?;

    // Refresh engine with new config
    let _ = crate::refresh_engine_provider(&state).await;

    Ok(Json(serde_json::json!({ "status": "deleted" })))
}
pub async fn list_provider_models(
    State(state): State<AppState>,
    Path(profile_id): Path<String>,
) -> Result<Json<Vec<ModelInfo>>> {
    let credentials = CredentialsConfig::load_from_path(&state.credentials_path)?;
    let config = AppConfig::load_from_path(&state.config_path)?;

    let profile = config
        .profiles
        .iter()
        .find(|p| p.id == profile_id)
        .ok_or_else(|| AppError::Validation(format!("Profile not found: {}", profile_id)))?;

    let secrets = credentials
        .profiles
        .get(&profile_id)
        .cloned()
        .unwrap_or_default();

    let defaults = rushdino_providers::catalog::get_static_models(profile.provider_kind.clone());

    let provider_config = match profile.provider_kind {
        ProviderKind::Ollama => {
            let mut base_url = profile
                .base_url
                .clone()
                .unwrap_or_else(|| "http://localhost:11434/v1".to_owned());
            if !base_url.ends_with("/v1") && !base_url.ends_with("/v1/") {
                base_url = format!("{}/v1", base_url.trim_end_matches('/'));
            }
            ProviderConfig::Ollama {
                base_url,
                model: profile.default_model.clone(),
                api_key: None,
            }
        }
        ProviderKind::Openai => {
            if secrets.api_key.is_none()
                || secrets.api_key.as_deref().unwrap_or_default().is_empty()
            {
                return Ok(Json(defaults));
            }
            ProviderConfig::OpenAI {
                api_key: secrets.api_key.unwrap_or_default(),
                model: profile.default_model.clone(),
                base_url: profile.base_url.clone(),
            }
        }
        ProviderKind::Anthropic => {
            if secrets.api_key.is_none()
                || secrets.api_key.as_deref().unwrap_or_default().is_empty()
            {
                return Ok(Json(defaults));
            }
            ProviderConfig::Anthropic {
                api_key: secrets.api_key.unwrap_or_default(),
                model: profile.default_model.clone(),
            }
        }
        ProviderKind::Codex | ProviderKind::OpenaiCodex => {
            if secrets.access_token.is_none()
                || secrets
                    .access_token
                    .as_deref()
                    .unwrap_or_default()
                    .is_empty()
            {
                return Ok(Json(defaults));
            }
            ProviderConfig::Codex {
                access_token: secrets.access_token.unwrap_or_default(),
                model: profile.default_model.clone(),
            }
        }
        ProviderKind::Plugin => return Ok(Json(Vec::new())),
    };

    let provider = Provider::from_config(&provider_config)?;
    match provider.list_models().await {
        Ok(mut models) if !models.is_empty() => {
            for m in models.iter_mut() {
                if let Some(d) = defaults.iter().find(|d| d.id == m.id) {
                    if m.name.is_none() {
                        m.name = d.name.clone();
                    }
                    if m.description.is_none() {
                        m.description = d.description.clone();
                    }
                    if m.context_window.is_none() {
                        m.context_window = d.context_window;
                    }
                    if m.is_reasoning.is_none() || m.is_reasoning == Some(false) {
                        m.is_reasoning = d.is_reasoning;
                    }
                }
            }

            // Sort: Known models (with descriptions) first, then alphabetically by ID
            models.sort_by(
                |a, b| match (a.description.is_some(), b.description.is_some()) {
                    (true, false) => std::cmp::Ordering::Less,
                    (false, true) => std::cmp::Ordering::Greater,
                    _ => a.id.cmp(&b.id),
                },
            );

            Ok(Json(models))
        }
        Err(e) => {
            tracing::error!("Failed to fetch models from API: {e}");
            Ok(Json(defaults))
        }
        _ => {
            tracing::error!("API returned empty models list, falling back to defaults.");
            Ok(Json(defaults))
        }
    }
}

pub async fn connect_codex(
    State(state): State<AppState>,
    Path(profile_id): Path<String>,
) -> Result<Json<serde_json::Value>> {
    let credentials_path = state.credentials_path.clone();
    let mut config = AppConfig::load_from_path(&state.config_path)?;
    let profile = config
        .profiles
        .iter_mut()
        .find(|p| p.id == profile_id)
        .ok_or_else(|| AppError::Validation(format!("Profile not found: {}", profile_id)))?;

    // Await the flow directly so the HTTP request stays open until the user finishes in the browser
    let tokens = rushdino_auth::oauth_pkce::run().await?;

    let mut creds = CredentialsConfig::load_from_path(&credentials_path)?;
    let mut profile_secrets = creds
        .profiles
        .entry(profile_id.clone())
        .or_default()
        .clone();
    profile_secrets.access_token = Some(tokens.access_token);
    profile_secrets.refresh_token = Some(tokens.refresh_token);
    profile_secrets.token_expires_at = Some(tokens.expires_at);
    creds.profiles.insert(profile_id.clone(), profile_secrets);
    creds.save_to_path(&credentials_path)?;

    // Ensure OAuth profile is immediately usable by the gateway runtime:
    // - enforce codex provider kind + oauth auth method
    // - set as default profile so Telegram/Discord/Slack route through this newly connected profile
    if profile.provider_kind != ProviderKind::OpenaiCodex {
        tracing::info!(
            "connect_codex: updating profile '{}' provider_kind to openai_codex (was {:?})",
            profile_id,
            profile.provider_kind
        );
        profile.provider_kind = ProviderKind::OpenaiCodex;
    }
    if profile.auth_method != AuthMethod::OAuth {
        tracing::info!(
            "connect_codex: updating profile '{}' auth_method to oauth (was {:?})",
            profile_id,
            profile.auth_method
        );
        profile.auth_method = AuthMethod::OAuth;
    }
    if config.default_profile_id.as_deref() != Some(profile_id.as_str()) {
        tracing::info!(
            "connect_codex: setting default profile to newly connected profile '{}'",
            profile_id
        );
        config.default_profile_id = Some(profile_id.clone());
    }
    config.save_to_path(&state.config_path)?;

    // Refresh engine with new config
    let _ = crate::refresh_engine_provider(&state).await;

    tracing::info!("Codex OAuth successful for profile: {}", profile_id);

    Ok(Json(serde_json::json!({ "status": "success" })))
}
