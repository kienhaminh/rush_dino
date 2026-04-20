use std::time::{Duration, Instant};

use crate::state::AppState;
use crate::state::{PendingOAuthSession, PendingOAuthStore};
use axum::{
    extract::{Path, State},
    Json,
};
use rushdino_common::{
    config::{AuthMethod, ProfileSecrets, Provider, ProviderProfile},
    AppConfig, AppError, CredentialsConfig, Result,
};
use rushdino_providers::types::{AnthropicAuth, ModelInfo, OpenAIAuth, ProviderConfig};
use rushdino_providers::ProviderService;
use serde::{Deserialize, Serialize};

const OAUTH_PENDING_TTL: Duration = Duration::from_secs(300);

#[derive(Debug, Deserialize)]
pub struct CreateProfileRequest {
    pub name: String,
    pub provider_kind: Provider,
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

#[derive(Debug, Serialize)]
pub struct StartOAuthResponse {
    pub session_id: String,
    pub auth_url: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VerifyProviderResponse {
    pub ok: bool,
    pub source: String,
    pub message: String,
    pub model_count: usize,
}

#[derive(Debug, Deserialize)]
pub struct CompleteOAuthRequest {
    pub session_id: String,
    pub redirect_url: String,
}

fn profile_supports_oauth_connect(profile: &ProviderProfile) -> bool {
    profile.auth_method == AuthMethod::OAuth
        && matches!(
            profile.provider_kind,
            Provider::OpenAI | Provider::Anthropic
        )
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
    validate_create_profile_request(&payload)?;
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
        let api_key = state.secret_vault.resolve_in_string(&api_key).await;
        let secrets = ProfileSecrets {
            api_key: Some(api_key),
            ..Default::default()
        };
        credentials.profiles.insert(id.clone(), secrets);
    }

    config.save_to_path(&state.config_path)?;
    credentials.save_to_path(&state.credentials_path)?;

    // Refresh engine with new config
    let _ = crate::refresh_engine_provider(&state).await;

    Ok(Json(profile))
}

fn validate_create_profile_request(payload: &CreateProfileRequest) -> Result<()> {
    if payload.default_model.trim().is_empty() {
        return Err(AppError::Validation("default_model is required".to_owned()));
    }

    match payload.provider_kind {
        Provider::Ollama => {
            if payload.auth_method == AuthMethod::OAuth {
                return Err(AppError::Validation(
                    "ollama profiles do not support OAuth".to_owned(),
                ));
            }
        }
        Provider::OpenAI | Provider::Anthropic => match payload.auth_method {
            AuthMethod::ApiKey => {
                let api_key = payload.api_key.as_deref().map(str::trim).unwrap_or("");
                if api_key.is_empty() {
                    return Err(AppError::Validation(
                        "API key is required for API-key profiles".to_owned(),
                    ));
                }
            }
            AuthMethod::OAuth => {}
            AuthMethod::None => {
                return Err(AppError::Validation(
                    "provider profiles must use API key or OAuth authentication".to_owned(),
                ));
            }
        },
    }

    Ok(())
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
        let api_key = state.secret_vault.resolve_in_string(&api_key).await;
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

fn get_oauth_profile(config: &AppConfig, profile_id: &str) -> Result<ProviderProfile> {
    let profile = config
        .profiles
        .iter()
        .find(|p| p.id == profile_id)
        .cloned()
        .ok_or_else(|| AppError::Validation(format!("Profile not found: {}", profile_id)))?;

    if !profile_supports_oauth_connect(&profile) {
        return Err(AppError::Validation(format!(
            "Profile '{}' does not support OAuth connect",
            profile.name
        )));
    }

    Ok(profile)
}

async fn consume_pending_oauth_session(
    store: &PendingOAuthStore,
    session_id: &str,
    max_age: Duration,
    now: Instant,
) -> Result<PendingOAuthSession> {
    store
        .take_if_fresh(session_id, max_age, now)
        .await
        .ok_or_else(|| {
            AppError::Validation("OAuth session expired or was not found. Start again.".into())
        })
}

pub async fn connect_profile_oauth_start(
    State(state): State<AppState>,
    Path(profile_id): Path<String>,
) -> Result<Json<StartOAuthResponse>> {
    let config = AppConfig::load_from_path(&state.config_path)?;
    let profile = get_oauth_profile(&config, &profile_id)?;
    let login = match profile.provider_kind {
        Provider::OpenAI => rushdino_auth::oauth_pkce::start_login(),
        Provider::Anthropic => rushdino_auth::oauth_pkce::anthropic::start_anthropic_login(),
        _ => unreachable!(),
    };
    let session_id = uuid::Uuid::new_v4().to_string();
    let auth_url = login.auth_url.clone();
    state
        .pending_oauth
        .insert(
            session_id.clone(),
            PendingOAuthSession::from_login(profile.id.clone(), login, Instant::now()),
        )
        .await;

    Ok(Json(StartOAuthResponse {
        session_id,
        auth_url,
    }))
}

pub async fn connect_profile_oauth_complete(
    State(state): State<AppState>,
    Path(profile_id): Path<String>,
    Json(payload): Json<CompleteOAuthRequest>,
) -> Result<Json<serde_json::Value>> {
    let config = AppConfig::load_from_path(&state.config_path)?;
    let profile = get_oauth_profile(&config, &profile_id)?;
    let pending = consume_pending_oauth_session(
        &state.pending_oauth,
        &payload.session_id,
        OAUTH_PENDING_TTL,
        Instant::now(),
    )
    .await?;

    if pending.profile_id != profile.id {
        return Err(AppError::Validation(
            "OAuth session does not match the selected profile. Start again.".into(),
        ));
    }

    let client = reqwest::Client::new();
    let tokens = match profile.provider_kind {
        Provider::OpenAI => {
            let code = rushdino_auth::oauth_pkce::extract_authorization_code(
                &payload.redirect_url,
                &pending.state,
            )?;
            rushdino_auth::oauth_pkce::complete_login(&client, &code, &pending.verifier).await?
        }
        Provider::Anthropic => {
            let code = rushdino_auth::oauth_pkce::anthropic::extract_anthropic_code(
                &payload.redirect_url,
                &pending.verifier,
            )?;
            rushdino_auth::oauth_pkce::anthropic::complete_anthropic_login(
                &client,
                &code,
                &pending.verifier,
            )
            .await?
        }
        _ => unreachable!(),
    };
    let mut credentials = CredentialsConfig::load_from_path(&state.credentials_path)?;
    let mut secrets = credentials
        .profiles
        .entry(profile.id.clone())
        .or_default()
        .clone();
    secrets.access_token = Some(tokens.access_token);
    secrets.refresh_token = Some(tokens.refresh_token);
    secrets.token_expires_at = Some(tokens.expires_at);
    credentials.profiles.insert(profile.id.clone(), secrets);
    credentials.save_to_path(&state.credentials_path)?;

    let _ = crate::refresh_engine_provider(&state).await;

    Ok(Json(serde_json::json!({ "status": "connected" })))
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
    let (profile, secrets, defaults) =
        load_profile_runtime_state(&config, &credentials, &profile_id)?;
    let Some(provider_config) = build_provider_config(&profile, &secrets) else {
        return Ok(Json(defaults));
    };

    let provider = ProviderService::from_config(&provider_config)?;
    match provider.list_models().await {
        Ok(models) if !models.is_empty() => Ok(Json(normalize_models(models, &defaults))),
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

pub async fn verify_provider_connection(
    State(state): State<AppState>,
    Path(profile_id): Path<String>,
) -> Result<Json<VerifyProviderResponse>> {
    let credentials = CredentialsConfig::load_from_path(&state.credentials_path)?;
    let config = AppConfig::load_from_path(&state.config_path)?;
    let (profile, secrets, defaults) =
        load_profile_runtime_state(&config, &credentials, &profile_id)?;

    let Some(provider_config) = build_provider_config(&profile, &secrets) else {
        return Ok(Json(VerifyProviderResponse {
            ok: false,
            source: "missing_credentials".to_owned(),
            message: "No API key or OAuth token is saved for this profile yet.".to_owned(),
            model_count: defaults.len(),
        }));
    };

    let provider = ProviderService::from_config(&provider_config)?;
    match provider.list_models().await {
        Ok(models) if !models.is_empty() => Ok(Json(VerifyProviderResponse {
            ok: true,
            source: "remote".to_owned(),
            message: "Connected successfully and fetched models from the provider.".to_owned(),
            model_count: normalize_models(models, &defaults).len(),
        })),
        Ok(_) => Ok(Json(VerifyProviderResponse {
            ok: false,
            source: "empty_remote".to_owned(),
            message: "The provider responded, but returned an empty model list.".to_owned(),
            model_count: 0,
        })),
        Err(error) => Ok(Json(VerifyProviderResponse {
            ok: false,
            source: "remote_error".to_owned(),
            message: error.to_string(),
            model_count: defaults.len(),
        })),
    }
}

fn load_profile_runtime_state(
    config: &AppConfig,
    credentials: &CredentialsConfig,
    profile_id: &str,
) -> Result<(ProviderProfile, ProfileSecrets, Vec<ModelInfo>)> {
    let profile = config
        .profiles
        .iter()
        .find(|p| p.id == profile_id)
        .cloned()
        .ok_or_else(|| AppError::Validation(format!("Profile not found: {}", profile_id)))?;

    let secrets = credentials
        .profiles
        .get(profile_id)
        .cloned()
        .unwrap_or_default();

    let defaults = rushdino_providers::catalog::get_static_models_for_auth(
        profile.provider_kind.clone(),
        &profile.auth_method,
    );

    Ok((profile, secrets, defaults))
}

fn build_provider_config(
    profile: &ProviderProfile,
    secrets: &ProfileSecrets,
) -> Option<ProviderConfig> {
    match profile.provider_kind {
        Provider::Ollama => {
            let mut base_url = profile
                .base_url
                .clone()
                .unwrap_or_else(|| "http://localhost:11434/v1".to_owned());
            if !base_url.ends_with("/v1") && !base_url.ends_with("/v1/") {
                base_url = format!("{}/v1", base_url.trim_end_matches('/'));
            }
            Some(ProviderConfig::Ollama {
                base_url,
                model: profile.default_model.clone(),
                api_key: None,
            })
        }
        Provider::OpenAI => {
            let bearer = secrets
                .api_key
                .as_deref()
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(str::to_owned)?;
            Some(ProviderConfig::OpenAI {
                auth: OpenAIAuth::ApiKey { api_key: bearer },
                model: profile.default_model.clone(),
                base_url: profile.base_url.clone(),
            })
        }
        Provider::Anthropic => {
            let auth = if profile.auth_method == AuthMethod::OAuth {
                let access_token = secrets
                    .access_token
                    .as_deref()
                    .map(str::trim)
                    .filter(|s| !s.is_empty())
                    .map(str::to_owned)?;
                AnthropicAuth::OAuth { access_token }
            } else {
                let api_key = secrets
                    .api_key
                    .as_deref()
                    .map(str::trim)
                    .filter(|s| !s.is_empty())
                    .map(str::to_owned)?;
                AnthropicAuth::ApiKey { api_key }
            };
            Some(ProviderConfig::Anthropic {
                auth,
                model: profile.default_model.clone(),
            })
        }
    }
}

fn normalize_models(mut models: Vec<ModelInfo>, defaults: &[ModelInfo]) -> Vec<ModelInfo> {
    // Filter returned models to those that match our static catalog selection
    // for the profile's authentication method.
    //
    // (This avoids relying on a fragile `id.contains("codex")` heuristic,
    // since Codex models can now include IDs like `gpt-5.4`.)
    models.retain(|m| defaults.iter().any(|d| d.id == m.id));

    for model in models.iter_mut() {
        if let Some(default_model) = defaults.iter().find(|d| d.id == model.id) {
            if model.name.is_none() {
                model.name = default_model.name.clone();
            }
            if model.description.is_none() {
                model.description = default_model.description.clone();
            }
            if model.context_window.is_none() {
                model.context_window = default_model.context_window;
            }
            if model.is_reasoning.is_none() || model.is_reasoning == Some(false) {
                model.is_reasoning = default_model.is_reasoning;
            }
        }
    }

    models.sort_by(
        |a, b| match (a.description.is_some(), b.description.is_some()) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.id.cmp(&b.id),
        },
    );

    models
}

#[cfg(test)]
mod tests {
    use std::time::{Duration, Instant};

    use rushdino_common::{config::{AuthMethod, Provider, ProviderProfile}, AppError};

    use crate::state::PendingOAuthStore;

    use super::{
        consume_pending_oauth_session, profile_supports_oauth_connect,
        validate_create_profile_request, CreateProfileRequest,
    };

    fn profile(provider_kind: Provider, auth_method: AuthMethod) -> ProviderProfile {
        ProviderProfile {
            id: "profile-1".to_owned(),
            name: "Test".to_owned(),
            provider_kind,
            auth_method,
            default_model: "gpt-5.3-codex".to_owned(),
            base_url: None,
        }
    }

    #[test]
    fn oauth_connect_supports_openai_oauth_profiles() {
        assert!(profile_supports_oauth_connect(&profile(
            Provider::OpenAI,
            AuthMethod::OAuth,
        )));
    }

    #[test]
    fn oauth_connect_rejects_non_oauth_profiles() {
        assert!(!profile_supports_oauth_connect(&profile(
            Provider::OpenAI,
            AuthMethod::ApiKey,
        )));
    }

    #[test]
    fn oauth_connect_supports_anthropic_oauth_profiles() {
        assert!(profile_supports_oauth_connect(&profile(
            Provider::Anthropic,
            AuthMethod::OAuth,
        )));
    }

    #[test]
    fn create_profile_requires_api_key_for_api_key_auth() {
        let err = validate_create_profile_request(&CreateProfileRequest {
            name: "OpenAI".to_owned(),
            provider_kind: Provider::OpenAI,
            auth_method: AuthMethod::ApiKey,
            default_model: "gpt-5.4".to_owned(),
            base_url: None,
            api_key: None,
        })
        .expect_err("missing API key should be rejected");

        assert!(matches!(err, AppError::Validation(_)));
    }

    #[test]
    fn create_profile_allows_oauth_without_api_key() {
        validate_create_profile_request(&CreateProfileRequest {
            name: "OpenAI OAuth".to_owned(),
            provider_kind: Provider::OpenAI,
            auth_method: AuthMethod::OAuth,
            default_model: "gpt-5.4".to_owned(),
            base_url: None,
            api_key: None,
        })
        .expect("OAuth profiles should not require an API key");
    }

    #[test]
    fn create_profile_rejects_oauth_for_ollama() {
        let err = validate_create_profile_request(&CreateProfileRequest {
            name: "Ollama".to_owned(),
            provider_kind: Provider::Ollama,
            auth_method: AuthMethod::OAuth,
            default_model: "llama3.2".to_owned(),
            base_url: Some("http://localhost:11434".to_owned()),
            api_key: None,
        })
        .expect_err("Ollama should not accept OAuth");

        assert!(matches!(err, AppError::Validation(_)));
    }

    #[tokio::test]
    async fn oauth_complete_rejects_unknown_pending_session() {
        let store = PendingOAuthStore::new();
        let error = consume_pending_oauth_session(
            &store,
            "missing",
            Duration::from_secs(300),
            Instant::now(),
        )
        .await
        .expect_err("missing session should fail");

        assert!(error.to_string().contains("expired"));
    }
}
