use super::*;

#[test]
fn test_parse_secret_ref_valid() {
    assert_eq!(
        CredentialInjector::parse_secret_ref("${secret:openai_api_key}"),
        Some("openai_api_key")
    );
}

#[test]
fn test_parse_secret_ref_with_underscores() {
    assert_eq!(
        CredentialInjector::parse_secret_ref("${secret:my_secret_key_123}"),
        Some("my_secret_key_123")
    );
}

#[test]
fn test_parse_secret_ref_invalid_no_secret_prefix() {
    assert_eq!(CredentialInjector::parse_secret_ref("${prefix:key}"), None);
}

#[test]
fn test_parse_secret_ref_invalid_no_closing_brace() {
    assert_eq!(CredentialInjector::parse_secret_ref("${secret:key"), None);
}

#[test]
fn test_parse_secret_ref_invalid_no_opening_brace() {
    assert_eq!(CredentialInjector::parse_secret_ref("$secret:key}"), None);
}

#[test]
fn test_parse_secret_ref_literal_value() {
    assert_eq!(CredentialInjector::parse_secret_ref("literal_value"), None);
}

#[test]
fn test_parse_secret_ref_empty_key() {
    assert_eq!(CredentialInjector::parse_secret_ref("${secret:}"), Some(""));
}

#[test]
fn test_resolve_secret_references() {
    let provider = CredentialProvider {
        name: "openai".to_string(),
        inject: {
            let mut map = HashMap::new();
            map.insert("OPENAI_API_KEY".to_string(), "${secret:openai_key}".to_string());
            map
        },
    };

    let mut secrets_store = HashMap::new();
    secrets_store.insert("openai_key".to_string(), "sk-1234567890".to_string());

    let result = CredentialInjector::resolve(&[provider], &secrets_store);

    assert_eq!(result.get("OPENAI_API_KEY"), Some(&"sk-1234567890".to_string()));
}

#[test]
fn test_resolve_literal_values() {
    let provider = CredentialProvider {
        name: "custom".to_string(),
        inject: {
            let mut map = HashMap::new();
            map.insert("CUSTOM_VAR".to_string(), "literal_value".to_string());
            map
        },
    };

    let secrets_store = HashMap::new();

    let result = CredentialInjector::resolve(&[provider], &secrets_store);

    assert_eq!(result.get("CUSTOM_VAR"), Some(&"literal_value".to_string()));
}

#[test]
fn test_resolve_missing_secret_ref_skipped() {
    let provider = CredentialProvider {
        name: "missing".to_string(),
        inject: {
            let mut map = HashMap::new();
            map.insert("MISSING_KEY".to_string(), "${secret:nonexistent}".to_string());
            map
        },
    };

    let secrets_store = HashMap::new();

    let result = CredentialInjector::resolve(&[provider], &secrets_store);

    // The env var should not be present since the secret was not found
    assert!(!result.contains_key("MISSING_KEY"));
}

#[test]
fn test_resolve_multiple_providers_merged() {
    let provider1 = CredentialProvider {
        name: "openai".to_string(),
        inject: {
            let mut map = HashMap::new();
            map.insert("OPENAI_API_KEY".to_string(), "${secret:openai_key}".to_string());
            map
        },
    };

    let provider2 = CredentialProvider {
        name: "anthropic".to_string(),
        inject: {
            let mut map = HashMap::new();
            map.insert("ANTHROPIC_API_KEY".to_string(), "${secret:anthropic_key}".to_string());
            map
        },
    };

    let mut secrets_store = HashMap::new();
    secrets_store.insert("openai_key".to_string(), "openai-secret".to_string());
    secrets_store.insert("anthropic_key".to_string(), "anthropic-secret".to_string());

    let result = CredentialInjector::resolve(&[provider1, provider2], &secrets_store);

    assert_eq!(result.get("OPENAI_API_KEY"), Some(&"openai-secret".to_string()));
    assert_eq!(result.get("ANTHROPIC_API_KEY"), Some(&"anthropic-secret".to_string()));
    assert_eq!(result.len(), 2);
}

#[test]
fn test_resolve_mixed_secrets_and_literals() {
    let provider = CredentialProvider {
        name: "mixed".to_string(),
        inject: {
            let mut map = HashMap::new();
            map.insert("SECRET_VAR".to_string(), "${secret:my_secret}".to_string());
            map.insert("LITERAL_VAR".to_string(), "literal_value".to_string());
            map.insert("ANOTHER_SECRET".to_string(), "${secret:another}".to_string());
            map
        },
    };

    let mut secrets_store = HashMap::new();
    secrets_store.insert("my_secret".to_string(), "secret_value".to_string());
    secrets_store.insert("another".to_string(), "another_value".to_string());

    let result = CredentialInjector::resolve(&[provider], &secrets_store);

    assert_eq!(result.get("SECRET_VAR"), Some(&"secret_value".to_string()));
    assert_eq!(result.get("LITERAL_VAR"), Some(&"literal_value".to_string()));
    assert_eq!(result.get("ANOTHER_SECRET"), Some(&"another_value".to_string()));
    assert_eq!(result.len(), 3);
}

#[test]
fn test_resolve_provider_override() {
    // When multiple providers define the same env var, the last one wins
    let provider1 = CredentialProvider {
        name: "first".to_string(),
        inject: {
            let mut map = HashMap::new();
            map.insert("KEY".to_string(), "value1".to_string());
            map
        },
    };

    let provider2 = CredentialProvider {
        name: "second".to_string(),
        inject: {
            let mut map = HashMap::new();
            map.insert("KEY".to_string(), "value2".to_string());
            map
        },
    };

    let secrets_store = HashMap::new();

    let result = CredentialInjector::resolve(&[provider1, provider2], &secrets_store);

    assert_eq!(result.get("KEY"), Some(&"value2".to_string()));
}
