use rushdino_common::{AppConfig, CredentialsConfig};

use super::{
    execution_runtime_reload_required_from_config,
    execution_runtime_reload_required_from_credentials,
    gateway_runtime_reload_required_from_config,
    gateway_runtime_reload_required_from_credentials, mask_credentials_for_response,
    validate_security_config,
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
fn config_reload_triggers_for_mobile_gateway_changes() {
    let current = AppConfig::default();
    let mut updated = AppConfig::default();
    updated.gateway.mobile.enabled = true;
    updated.gateway.mobile.publish_host = "https://rushdino.tailnet.ts.net".to_owned();

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
fn get_credentials_response_masks_all_secret_fields() {
    use serde_json::Value;

    let creds = CredentialsConfig {
        openai_api_key: Some("sk-real-openai".to_owned()),
        anthropic_api_key: Some("sk-ant-real".to_owned()),
        brave_api_key: Some("brave-real".to_owned()),
        gemini_api_key: Some("gemini-real".to_owned()),
        telegram_bot_token: Some("12345:real-token".to_owned()),
        discord_bot_token: Some("discord-real".to_owned()),
        slack_bot_token: Some("slack-bot-real".to_owned()),
        slack_app_token: Some("slack-app-real".to_owned()),
        api_secret: Some("deadbeef".to_owned()),
        ..CredentialsConfig::default()
    };

    let masked = mask_credentials_for_response(&creds);

    let check = |field: &str| {
        let v = masked.get(field).and_then(Value::as_str).unwrap_or("");
        assert_eq!(v, "***", "field {field} should be masked");
    };

    check("openai_api_key");
    check("anthropic_api_key");
    check("brave_api_key");
    check("gemini_api_key");
    check("telegram_bot_token");
    check("discord_bot_token");
    check("slack_bot_token");
    check("slack_app_token");
    check("api_secret");
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
