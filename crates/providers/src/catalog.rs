use crate::types::ModelInfo;
use rushdino_common::config::{AuthMethod, Provider};

fn openai_api_key_models() -> Vec<ModelInfo> {
    vec![
        ModelInfo {
            id: "gpt-5".into(),
            name: Some("GPT-5".into()),
            description: Some("Next-generation flagship model".into()),
            context_window: Some(256_000),
            is_reasoning: Some(false),
        },
        ModelInfo {
            id: "gpt-5-pro".into(),
            name: Some("GPT-5 Pro".into()),
            description: Some("Highly capable professional model".into()),
            context_window: Some(256_000),
            is_reasoning: Some(true),
        },
        ModelInfo {
            id: "gpt-5.1".into(),
            name: Some("GPT-5.1".into()),
            description: Some("Incremental update to GPT-5".into()),
            context_window: Some(256_000),
            is_reasoning: Some(false),
        },
        ModelInfo {
            id: "gpt-5.2".into(),
            name: Some("GPT-5.2".into()),
            description: Some("Latest GPT-5 iteration".into()),
            context_window: Some(256_000),
            is_reasoning: Some(false),
        },
        ModelInfo {
            id: "gpt-5.4".into(),
            name: Some("GPT-5.4".into()),
            description: Some("Frontier model for complex professional work".into()),
            context_window: Some(1_050_000),
            is_reasoning: Some(true),
        },
        ModelInfo {
            id: "gpt-4.1".into(),
            name: Some("GPT-4.1".into()),
            description: Some("Advanced GPT-4 capability".into()),
            context_window: Some(128_000),
            is_reasoning: Some(false),
        },
        ModelInfo {
            id: "gpt-4.1-mini".into(),
            name: Some("GPT-4.1 Mini".into()),
            description: Some("Fast, efficient iteration of 4.1".into()),
            context_window: Some(128_000),
            is_reasoning: Some(false),
        },
        ModelInfo {
            id: "o4-mini".into(),
            name: Some("o4 Mini".into()),
            description: Some("Latest compact reasoning model".into()),
            context_window: Some(200_000),
            is_reasoning: Some(true),
        },
        ModelInfo {
            id: "o3".into(),
            name: Some("o3".into()),
            description: Some("Fastest reasoning model framework".into()),
            context_window: Some(200_000),
            is_reasoning: Some(true),
        },
        ModelInfo {
            id: "o3-mini".into(),
            name: Some("o3 Mini".into()),
            description: Some("Fastest reasoning model for coding/math".into()),
            context_window: Some(200_000),
            is_reasoning: Some(true),
        },
        ModelInfo {
            id: "gpt-4o".into(),
            name: Some("GPT-4o".into()),
            description: Some("Omni model, most capable and versatile".into()),
            context_window: Some(128_000),
            is_reasoning: Some(false),
        },
        ModelInfo {
            id: "gpt-4o-mini".into(),
            name: Some("GPT-4o Mini".into()),
            description: Some("Fast, affordable small model for lightweight tasks".into()),
            context_window: Some(128_000),
            is_reasoning: Some(false),
        },
        ModelInfo {
            id: "o1".into(),
            name: Some("o1".into()),
            description: Some("Reasoning model for complex technical tasks".into()),
            context_window: Some(128_000),
            is_reasoning: Some(true),
        },
    ]
}

fn openai_codex_only_models() -> Vec<ModelInfo> {
    vec![
        ModelInfo {
            id: "gpt-5.4".into(),
            name: Some("GPT-5.4".into()),
            description: Some("Codex model — requires Codex (OAuth) authentication".into()),
            context_window: Some(1_050_000),
            is_reasoning: Some(true),
        },
        ModelInfo {
            id: "gpt-5.3-codex".into(),
            name: Some("GPT-5.3 Codex".into()),
            description: Some(
                "Codex model — requires Codex (OAuth) authentication".into(),
            ),
            context_window: Some(256_000),
            is_reasoning: Some(false),
        },
        ModelInfo {
            id: "gpt-5.1-codex-max".into(),
            name: Some("GPT-5.1 Codex Max".into()),
            description: Some(
                "High-capacity Codex model — requires Codex (OAuth) authentication".into(),
            ),
            context_window: Some(256_000),
            is_reasoning: Some(false),
        },
    ]
}

fn anthropic_models() -> Vec<ModelInfo> {
    vec![
        ModelInfo {
            id: "claude-opus-4-6".into(),
            name: Some("Claude Opus 4.6".into()),
            description: Some("Flagship Claude model for complex reasoning and tool use".into()),
            context_window: Some(1_000_000),
            is_reasoning: Some(true),
        },
        ModelInfo {
            id: "claude-sonnet-4-6".into(),
            name: Some("Claude Sonnet 4.6".into()),
            description: Some("High-intelligence model for fast, strong reasoning".into()),
            context_window: Some(1_000_000),
            is_reasoning: Some(true),
        },
        ModelInfo {
            id: "claude-haiku-4-5-20251001".into(),
            name: Some("Claude Haiku 4.5".into()),
            description: Some("Fast, cost-effective model for lightweight tasks".into()),
            context_window: Some(200_000),
            is_reasoning: Some(false),
        },
        ModelInfo {
            id: "claude-3-7-sonnet-20250219".into(),
            name: Some("Claude 3.7 Sonnet".into()),
            description: Some("Extended thinking model with hybrid reasoning (Legacy)".into()),
            context_window: Some(200_000),
            is_reasoning: Some(true),
        },
        ModelInfo {
            id: "claude-3-5-sonnet-20241022".into(),
            name: Some("Claude 3.5 Sonnet".into()),
            description: Some("High-intelligence model (Legacy 2024 version)".into()),
            context_window: Some(200_000),
            is_reasoning: Some(false),
        },
        ModelInfo {
            id: "claude-3-5-haiku-20241022".into(),
            name: Some("Claude 3.5 Haiku".into()),
            description: Some("Fastest, most cost-effective model".into()),
            context_window: Some(200_000),
            is_reasoning: Some(false),
        },
        ModelInfo {
            id: "claude-3-opus-20240229".into(),
            name: Some("Claude 3 Opus".into()),
            description: Some("Powerful model for highly complex tasks".into()),
            context_window: Some(200_000),
            is_reasoning: Some(false),
        },
    ]
}

/// Returns the static model catalog filtered to match the given authentication method.
///
/// For `Provider::OpenAI`:
///   - `AuthMethod::OAuth`   → Codex models (OpenAI API models + Codex-only variants)
///   - everything else       → standard OpenAI API-key models (excluding Codex-only variants)
///
/// All other providers ignore `auth` and return the full list.
pub fn get_static_models_for_auth(kind: Provider, auth: &AuthMethod) -> Vec<ModelInfo> {
    match kind {
        Provider::OpenAI => {
            if *auth == AuthMethod::OAuth {
                let mut models = openai_api_key_models();
                for codex_model in openai_codex_only_models() {
                    if let Some(existing) = models.iter_mut().find(|m| m.id == codex_model.id) {
                        // Prefer the codex entry when IDs overlap.
                        *existing = codex_model;
                    } else {
                        models.push(codex_model);
                    }
                }
                models
            } else {
                openai_api_key_models()
            }
        }
        _ => get_static_models(kind.clone()),
    }
}

/// Returns the context window (in tokens) for a known model ID.
/// Returns `None` for models that are not in the static catalog.
pub fn context_window_for_model(model_id: &str) -> Option<u32> {
    let all_models: Vec<ModelInfo> = [Provider::OpenAI, Provider::Anthropic]
        .into_iter()
        .flat_map(get_static_models)
        .collect();

    all_models
        .into_iter()
        .find(|info| info.id == model_id)
        .and_then(|info| info.context_window)
}

pub fn get_static_models(kind: Provider) -> Vec<ModelInfo> {
    match kind {
        Provider::OpenAI => {
            let mut models = openai_api_key_models();
            for codex_model in openai_codex_only_models() {
                if let Some(existing) = models.iter_mut().find(|m| m.id == codex_model.id) {
                    *existing = codex_model;
                } else {
                    models.push(codex_model);
                }
            }
            models
        }
        Provider::Anthropic => anthropic_models(),
        _ => Vec::new(),
    }
}
