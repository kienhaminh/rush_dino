use std::{path::Path, sync::Arc};

use rushdino_agent::{AgentConfig, AgentEngine, KnowledgeGraphAccess};
use rushdino_common::{
    config::{AuthMethod, ProfileSecrets, Provider, ProviderProfile},
    AppConfig, AppError, CredentialsConfig, Result,
};
use rushdino_knowledge_graph::KnowledgeGraphService;
use rushdino_providers::{types::ProviderConfig, ProviderService};

use crate::{
    knowledge_graph_bridge::KnowledgeGraphBridge,
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

pub fn default_profile_model(config: &AppConfig) -> Option<String> {
    find_default_profile(config).map(|profile| profile.default_model.clone())
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
                let token = secrets
                    .and_then(|s| s.access_token.as_deref())
                    .map(str::trim)
                    .unwrap_or("");
                if token.is_empty() {
                    return Err(AppError::Provider(format!(
                        "default profile '{}' requires an OAuth access token",
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

pub async fn refresh_runtime_from_disk(runtime: &RuntimeState) -> Result<()> {
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
                Some(Arc::new(KnowledgeGraphService::new(
                    (*pool).clone(),
                    provider.clone(),
                    config.knowledge_graph.clone(),
                    config.data_dir.clone(),
                )))
            } else {
                None
            };
            let knowledge_graph_bridge = knowledge_graph_service.as_ref().map(|service| {
                Arc::new(KnowledgeGraphBridge::new(service.clone()))
                    as Arc<dyn KnowledgeGraphAccess>
            });
            let mut engine_inner = AgentEngine::new(
                provider,
                pool,
                config.data_dir.clone(),
                credentials.brave_api_key.clone(),
                provider_kind_label(&resolved.provider_kind).to_owned(),
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
                        ..AgentConfig::default()
                    }
                },
                runtime.agent_runtime(),
                runtime.system_broker(),
                knowledge_graph_bridge,
            )?;
            engine_inner.set_thinking_level_override_arc(runtime.thinking_level_override.clone());
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

fn find_default_profile(config: &AppConfig) -> Option<&ProviderProfile> {
    let profile_id = config.default_profile_id.as_ref()?;
    config
        .profiles
        .iter()
        .find(|profile| profile.id == *profile_id)
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
    _credentials_path: &Path,
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
            let secrets = credentials.profiles.get(&profile.id);
            let bearer = if profile.auth_method == AuthMethod::OAuth {
                let token = secrets
                    .and_then(|s| s.access_token.as_deref())
                    .map(str::trim)
                    .unwrap_or("");
                if token.is_empty() {
                    return Err(AppError::Provider(format!(
                        "default profile '{}' requires an OAuth access token",
                        profile.id
                    )));
                }
                token.to_owned()
            } else {
                require_api_key(secrets, &profile.id)?
            };
            Ok(ProviderConfig::OpenAI {
                api_key: bearer,
                model: profile.default_model.clone(),
                base_url: profile.base_url.clone(),
            })
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
mod tests {
    use std::{fs, path::PathBuf};

    use rushdino_common::{
        config::{AuthMethod, ProfileSecrets, Provider, ProviderProfile},
        AppConfig, CredentialsConfig,
    };
    use rushdino_providers::types::ProviderConfig;

    use super::{
        default_profile_model, resolve_default_profile_provider,
        validate_default_profile_execution,
    };

    fn temp_credentials_path() -> PathBuf {
        std::env::temp_dir().join(format!(
            "rushdino-profile-runtime-{}.toml",
            uuid::Uuid::new_v4()
        ))
    }

    fn openai_profile() -> ProviderProfile {
        ProviderProfile {
            id: "primary".to_owned(),
            name: "Primary".to_owned(),
            provider_kind: Provider::OpenAI,
            auth_method: AuthMethod::ApiKey,
            default_model: "gpt-4.1-mini".to_owned(),
            base_url: Some("https://api.openai.com/v1".to_owned()),
        }
    }

    #[tokio::test]
    async fn resolves_valid_default_openai_profile_from_profile_secrets() {
        let mut config = AppConfig::default();
        config.default_profile_id = Some("primary".to_owned());
        config.profiles = vec![openai_profile()];
        config.active_provider = Provider::Ollama;

        let mut credentials = CredentialsConfig::default();
        credentials.profiles.insert(
            "primary".to_owned(),
            ProfileSecrets {
                api_key: Some("sk-profile".to_owned()),
                ..ProfileSecrets::default()
            },
        );
        credentials.openai_api_key = Some("sk-legacy".to_owned());
        let temp_path = temp_credentials_path();

        let resolved =
            resolve_default_profile_provider(&config, &mut credentials, temp_path.as_path())
                .await
                .expect("profile should resolve");

        match resolved.provider_config {
            ProviderConfig::OpenAI {
                api_key,
                model,
                base_url,
            } => {
                assert_eq!(api_key, "sk-profile");
                assert_eq!(model, "gpt-4.1-mini");
                assert_eq!(base_url.as_deref(), Some("https://api.openai.com/v1"));
            }
            other => panic!("unexpected config: {other:?}"),
        }
        assert_eq!(resolved.profile_id, "primary");
        assert_eq!(resolved.provider_kind, Provider::OpenAI);

        let _ = fs::remove_file(temp_path);
    }

    #[test]
    fn rejects_missing_default_profile_without_legacy_fallback() {
        let config = AppConfig {
            active_provider: Provider::OpenAI,
            ..AppConfig::default()
        };
        let credentials = CredentialsConfig {
            openai_api_key: Some("sk-legacy".to_owned()),
            ..CredentialsConfig::default()
        };

        let err = validate_default_profile_execution(&config, &credentials)
            .expect_err("missing default profile must fail");
        assert!(err.to_string().contains("default_profile_id is not set"));
    }

    #[test]
    fn active_model_comes_from_default_profile() {
        let mut config = AppConfig::default();
        config.default_profile_id = Some("primary".to_owned());
        config.profiles = vec![openai_profile()];
        config.openai.model = "legacy-model".to_owned();

        assert_eq!(
            default_profile_model(&config).as_deref(),
            Some("gpt-4.1-mini")
        );
    }

    #[tokio::test]
    async fn refuses_uncredentialed_default_profile_even_with_legacy_keys() {
        let mut config = AppConfig::default();
        config.default_profile_id = Some("primary".to_owned());
        config.profiles = vec![openai_profile()];
        config.active_provider = Provider::OpenAI;

        let mut credentials = CredentialsConfig {
            openai_api_key: Some("sk-legacy".to_owned()),
            ..CredentialsConfig::default()
        };
        let temp_path = temp_credentials_path();

        let err = resolve_default_profile_provider(&config, &mut credentials, temp_path.as_path())
            .await
            .expect_err("missing profile secret must fail");
        assert!(err.to_string().contains("requires an API key"));

        let _ = fs::remove_file(temp_path);
    }

}
