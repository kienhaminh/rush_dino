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
