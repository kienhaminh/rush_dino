use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AuthProviderId {
    Ollama,
    Openai,
    Anthropic,
    Codex,
    Plugin,
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
        AuthProviderId::Openai => vec![
            AuthOption {
                provider_id: AuthProviderId::Openai,
                method: AuthMethod::ApiKey,
                label: "OpenAI API key",
            },
            AuthOption {
                provider_id: AuthProviderId::Codex,
                method: AuthMethod::OAuthPkce,
                label: "OpenAI OAuth (Codex)",
            },
        ],
        AuthProviderId::Anthropic => vec![AuthOption {
            provider_id: AuthProviderId::Anthropic,
            method: AuthMethod::ApiKey,
            label: "Anthropic API key",
        }],
        AuthProviderId::Codex => vec![AuthOption {
            provider_id: AuthProviderId::Codex,
            method: AuthMethod::OAuthPkce,
            label: "OpenAI OAuth (Codex)",
        }],
        AuthProviderId::Plugin => vec![AuthOption {
            provider_id: AuthProviderId::Plugin,
            method: AuthMethod::None,
            label: "Plugin-managed auth",
        }],
    }
}
