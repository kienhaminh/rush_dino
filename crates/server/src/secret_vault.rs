use std::{collections::HashMap, sync::Arc};

use tokio::sync::Mutex;
use uuid::Uuid;

/// Server-side vault for sensitive values collected via secret input fields.
///
/// When a user submits a form with `secret: true` fields, the raw values are
/// stored here and replaced with opaque `secret://uuid` reference tokens in the
/// tool result returned to the agent. The agent only ever sees the token; the
/// actual value never enters the LLM context.
///
/// Tokens can be resolved back to their values by tools (e.g. the bash executor)
/// immediately before use, so the secret flows into the final command without
/// passing through the language model.
pub struct SecretVault {
    entries: Mutex<HashMap<String, String>>,
}

pub type SharedSecretVault = Arc<SecretVault>;

impl SecretVault {
    pub fn new() -> Arc<Self> {
        Arc::new(Self {
            entries: Mutex::new(HashMap::new()),
        })
    }

    /// Store a secret value and return its reference token (`secret://uuid`).
    pub async fn store(&self, value: String) -> String {
        let id = Uuid::new_v4().to_string();
        let token = format!("secret://{id}");
        self.entries.lock().await.insert(token.clone(), value);
        token
    }

    /// Replace all `secret://…` tokens in `input` with their stored values.
    /// Tokens without a matching entry are left unchanged.
    pub async fn resolve_in_string(&self, input: &str) -> String {
        if !input.contains("secret://") {
            return input.to_owned();
        }
        let entries = self.entries.lock().await;
        let mut result = input.to_owned();
        for (token, value) in entries.iter() {
            result = result.replace(token.as_str(), value.as_str());
        }
        result
    }
}
