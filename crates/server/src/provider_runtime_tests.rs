use std::{fs, path::PathBuf};

use rushdino_common::{
    config::{AuthMethod, ProfileSecrets, Provider, ProviderProfile},
    AppConfig, CredentialsConfig,
};
use rushdino_providers::types::{OpenAIAuth, ProviderConfig};

use super::{resolve_default_profile_provider, validate_default_profile_execution};

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

fn openai_oauth_profile() -> ProviderProfile {
    ProviderProfile {
        auth_method: AuthMethod::OAuth,
        default_model: "gpt-5.3-codex".to_owned(),
        ..openai_profile()
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
            auth: OpenAIAuth::ApiKey { api_key },
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

#[tokio::test]
async fn resolves_openai_oauth_profile_from_stored_access_token() {
    let mut config = AppConfig::default();
    config.default_profile_id = Some("primary".to_owned());
    config.profiles = vec![openai_oauth_profile()];

    let mut credentials = CredentialsConfig::default();
    credentials.profiles.insert(
        "primary".to_owned(),
        ProfileSecrets {
            access_token: Some("stored-access-token".to_owned()),
            refresh_token: Some("stored-refresh-token".to_owned()),
            ..ProfileSecrets::default()
        },
    );
    let temp_path = temp_credentials_path();

    let resolved =
        resolve_default_profile_provider(&config, &mut credentials, temp_path.as_path())
            .await
            .expect("oauth profile should resolve from stored access token");

    match resolved.provider_config {
        ProviderConfig::OpenAI {
            auth: OpenAIAuth::Codex { access_token },
            model,
            ..
        } => {
            assert_eq!(access_token, "stored-access-token");
            assert_eq!(model, "gpt-5.3-codex");
        }
        other => panic!("unexpected config: {other:?}"),
    }

    let _ = fs::remove_file(temp_path);
}

#[tokio::test]
async fn rejects_oauth_profile_with_no_stored_credentials() {
    let mut config = AppConfig::default();
    config.default_profile_id = Some("primary".to_owned());
    config.profiles = vec![openai_oauth_profile()];

    let mut credentials = CredentialsConfig::default();
    let temp_path = temp_credentials_path();

    let err =
        resolve_default_profile_provider(&config, &mut credentials, temp_path.as_path())
            .await
            .expect_err("oauth profile with no credentials must fail");
    assert!(err.to_string().contains("please log in again"));

    let _ = fs::remove_file(temp_path);
}
