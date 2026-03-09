use std::sync::Arc;

use chrono::Utc;
use rushdino_common::models::{Message, Role};
use rushdino_providers::{
    types::{ChatRequest, ChatResponse},
    Provider,
};
use uuid::Uuid;

use crate::agent_manager::AgentManager;

/// Routes incoming user messages to the best-matching specialist agent.
///
/// Makes a single cheap LLM call (no tools, temperature 0, max ~20 tokens) to
/// classify the user's intent and return the name of the matching agent. Returns
/// `None` when no confident match is found, on any error, or when the LLM response
/// does not exactly match a registered agent name — all of which cause the caller
/// to fall back to the orchestrator's full ReAct loop.
pub struct AgentRouter {
    provider: Arc<Provider>,
    agent_manager: Arc<AgentManager>,
}

impl AgentRouter {
    pub fn new(provider: Arc<Provider>, agent_manager: Arc<AgentManager>) -> Self {
        Self {
            provider,
            agent_manager,
        }
    }

    /// Returns the matched agent name, or `None` for orchestrator fallback.
    ///
    /// The LLM receives a one-shot classification prompt listing all registered
    /// agents and is instructed to reply with a single agent name or "none".
    /// The response is validated against the live agent roster — any hallucinated
    /// or unknown name is treated as `None`.
    pub async fn route(&self, user_input: &str) -> Option<String> {
        let agents = self.agent_manager.list();
        if agents.is_empty() {
            return None;
        }

        // Build the agent roster string: "- {name}: {description}"
        let roster = agents
            .iter()
            .map(|a| format!("- {}: {}", a.name, a.description))
            .collect::<Vec<_>>()
            .join("\n");

        let system_content = format!(
            "Reply with ONLY one agent name from the list below, or 'none' if nothing fits.\n\nAgents:\n{roster}"
        );

        let messages = vec![
            Message {
                id: Uuid::new_v4().to_string(),
                role: Role::System,
                content: system_content,
                tool_calls: None,
                rich_content: None,
                created_at: Utc::now(),
            },
            Message {
                id: Uuid::new_v4().to_string(),
                role: Role::User,
                content: user_input.to_owned(),
                tool_calls: None,
                rich_content: None,
                created_at: Utc::now(),
            },
        ];

        let request = ChatRequest {
            messages,
            tools: None,
            temperature: Some(0.0),
            max_tokens: Some(20),
            model: None,
        };

        let response: ChatResponse = match self.provider.chat(request).await {
            Ok(r) => r,
            Err(e) => {
                tracing::debug!(error = %e, "router LLM call failed; falling back to orchestrator");
                return None;
            }
        };

        let raw = response.content.trim().to_lowercase();

        // Reject explicit "none" responses.
        if raw == "none" || raw.is_empty() {
            return None;
        }

        // Validate against the registered agent roster (case-insensitive comparison).
        let agent_names: Vec<String> = agents.iter().map(|a| a.name.clone()).collect();
        agent_names
            .into_iter()
            .find(|name| name.to_lowercase() == raw)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent_manager::AgentTemplate;
    use rushdino_providers::OpenAIProvider;
    use std::fs;
    use uuid::Uuid;

    fn make_dummy_provider() -> Arc<Provider> {
        Arc::new(Provider::Ollama(OpenAIProvider::new(
            "http://localhost:0".to_owned(),
            "noop-model".to_owned(),
            None,
        )))
    }

    #[test]
    fn route_returns_none_when_no_agents() {
        let dir = std::env::temp_dir().join(Uuid::new_v4().to_string());
        fs::create_dir_all(&dir).unwrap();
        let manager = Arc::new(AgentManager::new(dir.clone()));
        let router = AgentRouter::new(make_dummy_provider(), manager);

        // list() returns empty; route() should short-circuit to None without
        // ever calling the provider.
        let rt = tokio::runtime::Runtime::new().unwrap();
        let result = rt.block_on(router.route("hello"));
        assert!(result.is_none());

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn route_skips_invalid_provider_gracefully() {
        // Build a manager with one agent but a provider that will never connect.
        let dir = std::env::temp_dir().join(Uuid::new_v4().to_string());
        let manager = Arc::new(AgentManager::new(dir.clone()));
        manager
            .save(&AgentTemplate {
                name: "researcher".to_owned(),
                description: "Does research".to_owned(),
                system_prompt: "You research things.".to_owned(),
                icon: None,
                model: None,
            })
            .unwrap();

        let router = AgentRouter::new(make_dummy_provider(), manager);

        let rt = tokio::runtime::Runtime::new().unwrap();
        // Provider call will fail (port 0) → should return None, not panic.
        let result = rt.block_on(router.route("research AI news"));
        assert!(result.is_none());

        let _ = fs::remove_dir_all(&dir);
    }
}
