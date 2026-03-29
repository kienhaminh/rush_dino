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
#[path = "credential_injector_tests.rs"]
mod tests;
