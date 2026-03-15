use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AuthProviderId {
    Ollama,
    OpenAI,
    Anthropic,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AuthMethod {
    None,
    ApiKey,
    OAuthPkce,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AuthOption {
    pub provider_id: AuthProviderId,
    pub method: AuthMethod,
    pub label: &'static str,
}

pub fn auth_options_for_provider(provider: AuthProviderId) -> Vec<AuthOption> {
    match provider {
        AuthProviderId::Ollama => vec![AuthOption {
            provider_id: AuthProviderId::Ollama,
            method: AuthMethod::None,
            label: "Local/Ollama (no remote auth)",
        }],
        AuthProviderId::OpenAI => vec![AuthOption {
            provider_id: AuthProviderId::OpenAI,
            method: AuthMethod::ApiKey,
            label: "OpenAI API key",
        }],
        AuthProviderId::Anthropic => vec![AuthOption {
            provider_id: AuthProviderId::Anthropic,
            method: AuthMethod::ApiKey,
            label: "Anthropic API key",
        }],
    }
}
