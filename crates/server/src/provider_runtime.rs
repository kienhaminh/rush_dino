use std::{path::Path, sync::Arc, time::{SystemTime, UNIX_EPOCH}};

use rushdino_agent::{AgentConfig, AgentEngine, KnowledgeGraphAccess};
use rushdino_common::{
    config::{AuthMethod, ProfileSecrets, Provider, ProviderProfile},
    AppConfig, AppError, CredentialsConfig, Result,
};
use rushdino_auth::refresh_access_token;
use rushdino_knowledge_graph::KgGateway;
use rushdino_providers::{
    types::{OpenAIAuth, ProviderConfig},
    ProviderService,
};

use crate::{
    knowledge_graph_bridge::KnowledgeGraphBridge,
    mcp_manager::McpManager,
    runtime_state::{RuntimeState, RuntimeStatus},
};

#[derive(Debug)]
pub struct ResolvedRuntimeProvider {
    pub profile_id: String,
    pub provider_kind: Provider,
    pub provider_config: ProviderConfig,
}

pub fn runtime_status_from_config(config: &AppConfig) -> RuntimeStatus {
    let effective_profile_id = config.default_profile_id.clone();
    let effective_provider_kind = effective_profile_id.as_ref().and_then(|profile_id| {
        config
            .profiles
            .iter()
            .find(|profile| profile.id == *profile_id)
            .map(|profile| profile.provider_kind.clone())
    });

    RuntimeStatus {
        effective_profile_id,
        effective_provider_kind,
        unavailable_error: None,
    }
}

pub fn validate_default_profile_execution(
    config: &AppConfig,
    credentials: &CredentialsConfig,
) -> Result<(String, Provider)> {
    let profile = require_default_profile(config)?;
    let secrets = credentials.profiles.get(&profile.id);

    if profile.default_model.trim().is_empty() {
        return Err(AppError::Provider(format!(
            "default profile '{}' has an empty default model",
            profile.id
        )));
    }

    match profile.provider_kind {
        Provider::Ollama => Ok((profile.id.clone(), profile.provider_kind.clone())),
        Provider::OpenAI | Provider::Anthropic => {
            if profile.auth_method == AuthMethod::OAuth {
                if !has_openai_oauth_runtime_credentials(secrets) {
                    return Err(AppError::Provider(format!(
                        "default profile '{}' requires OAuth login — no access token found",
                        profile.id
                    )));
                }
            } else {
                let api_key = secrets
                    .and_then(|secret| secret.api_key.as_deref())
                    .map(str::trim)
                    .unwrap_or("");
                if api_key.is_empty() {
                    return Err(AppError::Provider(format!(
                        "default profile '{}' requires an API key",
                        profile.id
                    )));
                }
            }
            Ok((profile.id.clone(), profile.provider_kind.clone()))
        }
    }
}

pub async fn refresh_runtime_from_disk(runtime: &RuntimeState, mcp_manager: Option<&McpManager>) -> Result<()> {
    let config = Arc::new(AppConfig::load_from_path(runtime.config_path())?);
    let mut credentials = CredentialsConfig::load_from_path(runtime.credentials_path())?;
    let mut status = runtime_status_from_config(config.as_ref());
    let resolve_res = resolve_default_profile_provider(
        config.as_ref(),
        &mut credentials,
        runtime.credentials_path(),
    )
    .await;

    match resolve_res {
        Ok(resolved) => {
            let pool = runtime.pool();
            let provider = Arc::new(ProviderService::from_config(&resolved.provider_config)?);

            let knowledge_graph_service = if config.knowledge_graph.enabled {
                match KgGateway::from_config(
                    &config.knowledge_graph,
                    &credentials.knowledge_graph,
                    provider.clone(),
                    pool.clone(),
                    config.data_dir.clone(),
                )
                .await
                {
                    Ok(gw) => Some(Arc::new(gw)),
                    Err(err) => {
                        tracing::warn!("knowledge graph gateway init failed: {err}");
                        None
                    }
                }
            } else {
                None
            };
            let knowledge_graph_bridge = knowledge_graph_service.as_ref().map(|gw| {
                Arc::new(KnowledgeGraphBridge::new(gw.clone()))
                    as Arc<dyn KnowledgeGraphAccess>
            });

            let auth_method = match &resolved.provider_config {
                ProviderConfig::OpenAI { auth, .. } => match auth {
                    OpenAIAuth::ApiKey { .. } => AuthMethod::ApiKey,
                    OpenAIAuth::Codex { .. } => AuthMethod::OAuth,
                },
                ProviderConfig::Ollama { api_key, .. } => {
                    if api_key.as_deref().unwrap_or_default().trim().is_empty() {
                        AuthMethod::None
                    } else {
                        AuthMethod::ApiKey
                    }
                }
                ProviderConfig::Anthropic { .. } => AuthMethod::ApiKey,
            };
            let mut engine_inner = AgentEngine::new(
                provider,
                pool,
                config.data_dir.clone(),
                credentials.brave_api_key.clone(),
                credentials.gemini_api_key.clone(),
                provider_kind_label(&resolved.provider_kind).to_owned(),
                auth_method,
                {
                    use rushdino_agent::memory_bootstrap::{
                        DEFAULT_BOOTSTRAP_MAX_CHARS, DEFAULT_BOOTSTRAP_TOTAL_MAX_CHARS,
                    };
                    AgentConfig {
                        bootstrap_max_chars: config
                            .bootstrap
                            .max_chars_per_file
                            .unwrap_or(DEFAULT_BOOTSTRAP_MAX_CHARS),
                        bootstrap_total_max_chars: config
                            .bootstrap
                            .max_total_chars
                            .unwrap_or(DEFAULT_BOOTSTRAP_TOTAL_MAX_CHARS),
                        max_context_tokens: config
                            .agent
                            .max_context_tokens
                            .unwrap_or(200_000),
                        ..AgentConfig::default()
                    }
                },
                runtime.agent_runtime(),
                runtime.system_broker(),
                knowledge_graph_bridge,
                // No per-agent sandbox policy at global engine build time.
                // Sandboxed agents attach their egress proxy at session creation.
                None,
                runtime.broadcast_tx(),
            )?;
            engine_inner.set_thinking_level_override_arc(runtime.thinking_level_override.clone());
            if let Some(sg) = runtime.skill_graph() {
                engine_inner.set_skill_graph(sg);
            }
            // Re-register MCP tools into the fresh engine's tool registry.
            if let Some(mgr) = mcp_manager {
                mgr.register_into(&engine_inner.tool_registry);
            }
            let engine = Arc::new(engine_inner);

            status.effective_profile_id = Some(resolved.profile_id);
            status.effective_provider_kind = Some(resolved.provider_kind);
            status.unavailable_error = None;
            runtime.update_available(config, engine, knowledge_graph_service, status);
        }
        Err(err) => {
            status.unavailable_error = Some(err.to_string());
            tracing::warn!("runtime refresh unavailable: {err}");
            runtime.update_unavailable(config, status);
        }
    }

    Ok(())
}

pub async fn resolve_default_profile_provider(
    config: &AppConfig,
    credentials: &mut CredentialsConfig,
    credentials_path: &Path,
) -> Result<ResolvedRuntimeProvider> {
    let profile = require_default_profile(config)?;
    let provider_config =
        provider_config_from_profile(config, credentials, credentials_path, profile).await?;

    Ok(ResolvedRuntimeProvider {
        profile_id: profile.id.clone(),
        provider_kind: profile.provider_kind.clone(),
        provider_config,
    })
}


fn require_default_profile(config: &AppConfig) -> Result<&ProviderProfile> {
    let Some(profile_id) = config.default_profile_id.as_ref() else {
        return Err(AppError::Provider(
            "default_profile_id is not set; execution requires a configured default profile"
                .to_owned(),
        ));
    };

    config
        .profiles
        .iter()
        .find(|profile| profile.id == *profile_id)
        .ok_or_else(|| {
            AppError::Provider(format!("default profile '{}' does not exist", profile_id))
        })
}

async fn provider_config_from_profile(
    _config: &AppConfig,
    credentials: &mut CredentialsConfig,
    credentials_path: &Path,
    profile: &ProviderProfile,
) -> Result<ProviderConfig> {
    if profile.default_model.trim().is_empty() {
        return Err(AppError::Provider(format!(
            "default profile '{}' has an empty default model",
            profile.id
        )));
    }

    match profile.provider_kind {
        Provider::Ollama => Ok(ProviderConfig::Ollama {
            base_url: normalize_ollama_base_url(profile.base_url.as_deref()),
            model: profile.default_model.clone(),
            api_key: None,
        }),
        Provider::OpenAI => {
            if profile.auth_method == AuthMethod::OAuth {
                let access_token =
                    resolve_openai_oauth_api_key(credentials, credentials_path, profile).await?;
                Ok(ProviderConfig::OpenAI {
                    auth: OpenAIAuth::Codex { access_token },
                    model: profile.default_model.clone(),
                    base_url: None,
                })
            } else {
                let api_key =
                    require_api_key(credentials.profiles.get(&profile.id), &profile.id)?;
                Ok(ProviderConfig::OpenAI {
                    auth: OpenAIAuth::ApiKey { api_key },
                    model: profile.default_model.clone(),
                    base_url: profile.base_url.clone(),
                })
            }
        }
        Provider::Anthropic => {
            let api_key = require_api_key(credentials.profiles.get(&profile.id), &profile.id)?;
            Ok(ProviderConfig::Anthropic {
                api_key,
                model: profile.default_model.clone(),
            })
        }
    }
}

fn require_api_key(secrets: Option<&ProfileSecrets>, profile_id: &str) -> Result<String> {
    let api_key = secrets
        .and_then(|secret| secret.api_key.as_deref())
        .map(str::trim)
        .unwrap_or("");
    if api_key.is_empty() {
        return Err(AppError::Provider(format!(
            "default profile '{}' requires an API key",
            profile_id
        )));
    }
    Ok(api_key.to_owned())
}

fn has_openai_oauth_runtime_credentials(secrets: Option<&ProfileSecrets>) -> bool {
    secrets
        .and_then(|secret| secret.access_token.as_deref())
        .map(str::trim)
        .is_some_and(|value| !value.is_empty())
}

async fn resolve_openai_oauth_api_key(
    credentials: &mut CredentialsConfig,
    credentials_path: &Path,
    profile: &ProviderProfile,
) -> Result<String> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;

    let secrets = credentials.profiles.get(&profile.id);

    let access_token = secrets
        .and_then(|s| s.access_token.as_deref())
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map(str::to_owned);
    let expires_at = secrets.and_then(|s| s.token_expires_at);
    let is_expired = expires_at.is_some_and(|exp| exp <= now);

    if let Some(token) = access_token {
        if !is_expired {
            return Ok(token);
        }

        let refresh_token = secrets
            .and_then(|s| s.refresh_token.as_deref())
            .map(str::trim)
            .filter(|v| !v.is_empty())
            .map(str::to_owned);

        if let Some(ref_token) = refresh_token {
            let client = reqwest::Client::new();
            match refresh_access_token(&client, &ref_token).await {
                Ok(new_tokens) => {
                    let entry = credentials
                        .profiles
                        .entry(profile.id.clone())
                        .or_default();
                    entry.access_token = Some(new_tokens.access_token.clone());
                    entry.refresh_token = Some(new_tokens.refresh_token);
                    entry.token_expires_at = Some(new_tokens.expires_at);
                    credentials.save_to_path(credentials_path)?;
                    return Ok(new_tokens.access_token);
                }
                Err(err) => {
                    tracing::warn!(
                        "OAuth token refresh failed for profile '{}': {err}; falling back to cached access token",
                        profile.id
                    );
                    return Ok(token);
                }
            }
        }
    }

    Err(AppError::Provider(format!(
        "default profile '{}' is connected with OAuth but no valid credentials were found — please log in again",
        profile.id
    )))
}

fn normalize_ollama_base_url(base_url: Option<&str>) -> String {
    let raw = base_url
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("http://localhost:11434/v1");
    if raw.ends_with("/v1") || raw.ends_with("/v1/") {
        raw.trim_end_matches('/').to_owned()
    } else {
        format!("{}/v1", raw.trim_end_matches('/'))
    }
}

pub fn provider_kind_label(kind: &Provider) -> &'static str {
    match kind {
        Provider::Ollama => "ollama",
        Provider::OpenAI => "openai",
        Provider::Anthropic => "anthropic",
    }
}

#[cfg(test)]
#[path = "provider_runtime_tests.rs"]
mod tests;
