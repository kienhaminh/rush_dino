//! Credential provider injection module.
//!
//! Resolves credential providers into a flat map of environment variable names to values.
//! Supports both secret references (`${secret:key}`) and literal values.

use crate::policy::types::CredentialProvider;
use std::collections::HashMap;

/// Resolves credential providers into a flat map of env var name → value.
///
/// `${secret:key}` references are looked up from secrets_store.
/// Literal values (no `${secret:...}` prefix) are passed through as-is.
pub struct CredentialInjector;

impl CredentialInjector {
    /// Resolves all providers into a HashMap<env_var_name, value>.
    ///
    /// For each provider in `providers`:
    ///   For each (env_name, value_template) in provider.inject:
    ///     If value_template matches "${secret:KEY}" pattern:
    ///       Look up KEY in secrets_store, insert as env_name → secret_value
    ///     Else:
    ///       Insert env_name → value_template as-is
    ///
    /// If a secret reference is not found in the secrets_store, a warning is logged
    /// and that environment variable is skipped (not inserted).
    pub fn resolve(
        providers: &[CredentialProvider],
        secrets_store: &HashMap<String, String>,
    ) -> HashMap<String, String> {
        let mut result = HashMap::new();

        for provider in providers {
            for (env_name, template) in &provider.inject {
                let value = if let Some(key) = Self::parse_secret_ref(template) {
                    // Look up the secret; skip if not found
                    match secrets_store.get(key) {
                        Some(v) => v.clone(),
                        None => {
                            tracing::warn!(
                                key = %key,
                                env = %env_name,
                                "secret ref not found in store, skipping"
                            );
                            continue;
                        }
                    }
                } else {
                    template.clone()
                };
                result.insert(env_name.clone(), value);
            }
        }

        result
    }

    /// Parses `${secret:KEY}` from a template string.
    ///
    /// Returns `Some("KEY")` if the template is a secret reference, `None` otherwise.
    ///
    /// # Examples
    ///
    /// ```ignore
    /// assert_eq!(CredentialInjector::parse_secret_ref("${secret:openai_api_key}"), Some("openai_api_key"));
    /// assert_eq!(CredentialInjector::parse_secret_ref("literal_value"), None);
    /// ```
    pub fn parse_secret_ref(template: &str) -> Option<&str> {
        if template.starts_with("${secret:") && template.ends_with('}') {
            Some(&template[9..template.len() - 1])
        } else {
            None
        }
    }
}

#[cfg(test)]
mod tests {
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
}
