use std::{path::Path, sync::Arc};

use rushdino_agent::{AgentConfig, AgentEngine, KnowledgeGraphAccess};
use rushdino_common::{
    config::{ProfileSecrets, ProviderKind, ProviderProfile},
    AppConfig, AppError, CredentialsConfig, Result,
};
use rushdino_knowledge_graph::KnowledgeGraphService;
use rushdino_providers::{codex_refresh, types::ProviderConfig, Provider};

use crate::{
    knowledge_graph_bridge::KnowledgeGraphBridge,
    runtime_state::{RuntimeState, RuntimeStatus},
};

#[derive(Debug)]
pub struct ResolvedRuntimeProvider {
    pub profile_id: String,
    pub provider_kind: ProviderKind,
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
    find_default_profile(config).map(|profile| match profile.provider_kind {
        ProviderKind::Plugin => "plugin".to_owned(),
        _ => profile.default_model.clone(),
    })
}

pub fn validate_default_profile_execution(
    config: &AppConfig,
    credentials: &CredentialsConfig,
) -> Result<(String, ProviderKind)> {
    let profile = require_default_profile(config)?;
    let secrets = credentials.profiles.get(&profile.id);

    if profile.default_model.trim().is_empty() && profile.provider_kind != ProviderKind::Plugin {
        return Err(AppError::Provider(format!(
            "default profile '{}' has an empty default model",
            profile.id
        )));
    }

    match profile.provider_kind {
        ProviderKind::Ollama => Ok((profile.id.clone(), profile.provider_kind.clone())),
        ProviderKind::Openai | ProviderKind::Anthropic => {
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
            Ok((profile.id.clone(), profile.provider_kind.clone()))
        }
        ProviderKind::Codex | ProviderKind::OpenaiCodex => {
            let access_token = secrets
                .and_then(|secret| secret.access_token.as_deref())
                .map(str::trim)
                .unwrap_or("");
            let refresh_token = secrets
                .and_then(|secret| secret.refresh_token.as_deref())
                .map(str::trim)
                .unwrap_or("");
            let expires_at = secrets.and_then(|secret| secret.token_expires_at);

            if access_token.is_empty() && refresh_token.is_empty() {
                return Err(AppError::Provider(format!(
                    "default profile '{}' requires an OAuth access token",
                    profile.id
                )));
            }
            if codex_refresh::token_needs_refresh(expires_at) && refresh_token.is_empty() {
                return Err(AppError::Provider(format!(
                    "default profile '{}' needs an OAuth refresh token before execution can start",
                    profile.id
                )));
            }
            Ok((profile.id.clone(), profile.provider_kind.clone()))
        }
        ProviderKind::Plugin => {
            let manifest_path = config.data_dir.join("plugins/default.toml");
            if !manifest_path.exists() {
                return Err(AppError::Provider(format!(
                    "default profile '{}' plugin provider requires manifest at {}",
                    profile.id,
                    manifest_path.display()
                )));
            }
            Ok((profile.id.clone(), profile.provider_kind.clone()))
        }
    }
}

pub async fn refresh_runtime_from_disk(runtime: &RuntimeState) -> Result<()> {
    let config = Arc::new(AppConfig::load_from_path(runtime.config_path())?);
    let mut credentials = CredentialsConfig::load_from_path(runtime.credentials_path())?;
    let mut status = runtime_status_from_config(config.as_ref());

    match resolve_default_profile_provider(
        config.as_ref(),
        &mut credentials,
        runtime.credentials_path(),
    )
    .await
    {
        Ok(resolved) => {
            let pool = runtime.pool();
            let provider = Arc::new(Provider::from_config(&resolved.provider_config)?);
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
            let engine = Arc::new(AgentEngine::new(
                provider,
                pool,
                config.data_dir.clone(),
                credentials.brave_api_key.clone(),
                provider_kind_label(&resolved.provider_kind).to_owned(),
                AgentConfig::default(),
                runtime.agent_runtime(),
                runtime.system_broker(),
                knowledge_graph_bridge,
            )?);

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

fn find_default_profile<'a>(config: &'a AppConfig) -> Option<&'a ProviderProfile> {
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
    config: &AppConfig,
    credentials: &mut CredentialsConfig,
    credentials_path: &Path,
    profile: &ProviderProfile,
) -> Result<ProviderConfig> {
    if profile.default_model.trim().is_empty() && profile.provider_kind != ProviderKind::Plugin {
        return Err(AppError::Provider(format!(
            "default profile '{}' has an empty default model",
            profile.id
        )));
    }

    match profile.provider_kind {
        ProviderKind::Ollama => Ok(ProviderConfig::Ollama {
            base_url: normalize_ollama_base_url(profile.base_url.as_deref()),
            model: profile.default_model.clone(),
            api_key: None,
        }),
        ProviderKind::Openai => {
            let api_key = require_api_key(credentials.profiles.get(&profile.id), &profile.id)?;
            Ok(ProviderConfig::OpenAI {
                api_key,
                model: profile.default_model.clone(),
                base_url: profile.base_url.clone(),
            })
        }
        ProviderKind::Anthropic => {
            let api_key = require_api_key(credentials.profiles.get(&profile.id), &profile.id)?;
            Ok(ProviderConfig::Anthropic {
                api_key,
                model: profile.default_model.clone(),
            })
        }
        ProviderKind::Codex | ProviderKind::OpenaiCodex => {
            let access_token = resolve_codex_access_token(
                credentials,
                credentials_path,
                &profile.id,
                credentials
                    .profiles
                    .get(&profile.id)
                    .cloned()
                    .unwrap_or_default(),
            )
            .await?;
            Ok(ProviderConfig::Codex {
                access_token,
                model: profile.default_model.clone(),
            })
        }
        ProviderKind::Plugin => {
            let manifest_path = config.data_dir.join("plugins/default.toml");
            if !manifest_path.exists() {
                return Err(AppError::Provider(format!(
                    "default profile '{}' plugin provider requires manifest at {}",
                    profile.id,
                    manifest_path.display()
                )));
            }
            Ok(ProviderConfig::Plugin { manifest_path })
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

async fn resolve_codex_access_token(
    credentials: &mut CredentialsConfig,
    credentials_path: &Path,
    profile_id: &str,
    secrets: ProfileSecrets,
) -> Result<String> {
    let access_token = secrets
        .access_token
        .as_deref()
        .map(str::trim)
        .unwrap_or("")
        .to_owned();
    let refresh_token = secrets
        .refresh_token
        .as_deref()
        .map(str::trim)
        .unwrap_or("")
        .to_owned();
    let needs_refresh =
        access_token.is_empty() || codex_refresh::token_needs_refresh(secrets.token_expires_at);

    if !needs_refresh {
        return Ok(access_token);
    }

    if refresh_token.is_empty() {
        return Err(AppError::Provider(format!(
            "default profile '{}' requires an OAuth refresh token before execution can start",
            profile_id
        )));
    }

    let (new_access, new_refresh, new_expires_at) =
        codex_refresh::refresh_codex_token(&refresh_token)
            .await
            .map_err(|err| {
                AppError::Provider(format!(
                    "default profile '{}' token refresh failed: {err}",
                    profile_id
                ))
            })?;

    persist_refreshed_profile_tokens(
        credentials,
        credentials_path,
        profile_id,
        new_access.clone(),
        new_refresh,
        new_expires_at,
    )?;

    Ok(new_access)
}

fn persist_refreshed_profile_tokens(
    credentials: &mut CredentialsConfig,
    path: &Path,
    profile_id: &str,
    access_token: String,
    refresh_token: String,
    expires_at: i64,
) -> Result<()> {
    let profile_secrets = credentials
        .profiles
        .entry(profile_id.to_owned())
        .or_default();
    profile_secrets.access_token = Some(access_token);
    profile_secrets.refresh_token = Some(refresh_token);
    profile_secrets.token_expires_at = Some(expires_at);
    credentials.save_to_path(path)?;
    Ok(())
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

pub fn provider_kind_label(kind: &ProviderKind) -> &'static str {
    match kind {
        ProviderKind::Ollama => "ollama",
        ProviderKind::Openai => "openai",
        ProviderKind::Anthropic => "anthropic",
        ProviderKind::Codex => "codex",
        ProviderKind::OpenaiCodex => "openai_codex",
        ProviderKind::Plugin => "plugin",
    }
}

#[cfg(test)]
mod tests {
    use std::{fs, path::PathBuf};

    use rushdino_common::{
        config::{AuthMethod, ProfileSecrets, ProviderKind, ProviderProfile},
        AppConfig, CredentialsConfig,
    };
    use rushdino_providers::types::ProviderConfig;

    use super::{
        default_profile_model, persist_refreshed_profile_tokens, resolve_default_profile_provider,
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
            provider_kind: ProviderKind::Openai,
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
        config.active_provider = ProviderKind::Ollama;

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
        assert_eq!(resolved.provider_kind, ProviderKind::Openai);

        let _ = fs::remove_file(temp_path);
    }

    #[test]
    fn rejects_missing_default_profile_without_legacy_fallback() {
        let config = AppConfig {
            active_provider: ProviderKind::Openai,
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
        config.active_provider = ProviderKind::Openai;

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

    #[test]
    fn persists_refreshed_codex_tokens_into_profile_secrets() {
        let mut credentials = CredentialsConfig::default();
        let temp_path = temp_credentials_path();

        persist_refreshed_profile_tokens(
            &mut credentials,
            temp_path.as_path(),
            "primary",
            "access-new".to_owned(),
            "refresh-new".to_owned(),
            1_760_000_000,
        )
        .expect("profile token persistence should succeed");

        let reloaded =
            CredentialsConfig::load_from_path(temp_path.as_path()).expect("reload credentials");
        let secrets = reloaded
            .profiles
            .get("primary")
            .expect("profile secrets persisted");
        assert_eq!(secrets.access_token.as_deref(), Some("access-new"));
        assert_eq!(secrets.refresh_token.as_deref(), Some("refresh-new"));
        assert_eq!(secrets.token_expires_at, Some(1_760_000_000));

        let _ = fs::remove_file(temp_path);
    }
}
