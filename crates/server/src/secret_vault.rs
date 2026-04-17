use std::{
    collections::HashMap,
    sync::Arc,
    time::{Duration, Instant},
};

use tokio::sync::Mutex;
use uuid::Uuid;

const DEFAULT_TTL: Duration = Duration::from_secs(300); // 5 minutes

struct Entry {
    value: String,
    expires_at: Instant,
}

/// Server-side vault for sensitive values collected via secret input fields.
///
/// When a user submits a form with `secret: true` fields, the raw values are
/// stored here and replaced with opaque `secret://uuid` reference tokens in the
/// tool result returned to the agent. The agent only ever sees the token; the
/// actual value never enters the LLM context.
///
/// Entries expire after `ttl` (default 5 minutes) to limit how long secrets
/// linger in process memory.
pub struct SecretVault {
    entries: Mutex<HashMap<String, Entry>>,
    ttl: Duration,
}

pub type SharedSecretVault = Arc<SecretVault>;

impl SecretVault {
    pub fn new() -> Arc<Self> {
        Self::new_with_ttl(DEFAULT_TTL)
    }

    pub fn new_with_ttl(ttl: Duration) -> Arc<Self> {
        Arc::new(Self {
            entries: Mutex::new(HashMap::new()),
            ttl,
        })
    }

    /// Store a secret value and return its reference token (`secret://uuid`).
    pub async fn store(&self, value: String) -> String {
        let id = Uuid::new_v4().to_string();
        let token = format!("secret://{id}");
        self.entries.lock().await.insert(
            token.clone(),
            Entry {
                value,
                expires_at: Instant::now() + self.ttl,
            },
        );
        token
    }

    /// Replace all `secret://…` tokens in `input` with their stored values.
    /// Expired or unknown tokens are left unchanged. Evicts expired entries
    /// on each call.
    pub async fn resolve_in_string(&self, input: &str) -> String {
        if !input.contains("secret://") {
            return input.to_owned();
        }
        let mut entries = self.entries.lock().await;
        let now = Instant::now();
        // Evict expired entries while we hold the lock.
        entries.retain(|_, e| e.expires_at > now);

        let mut result = input.to_owned();
        for (token, entry) in entries.iter() {
            result = result.replace(token.as_str(), entry.value.as_str());
        }
        result
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[tokio::test]
    async fn stored_secret_resolves_before_expiry() {
        let vault = SecretVault::new();
        let token = vault.store("my-secret".to_owned()).await;
        let resolved = vault.resolve_in_string(&token).await;
        assert_eq!(resolved, "my-secret");
    }

    #[tokio::test]
    async fn expired_secret_is_evicted_and_token_left_unchanged() {
        let vault = SecretVault::new_with_ttl(Duration::from_millis(10));
        let token = vault.store("ephemeral".to_owned()).await;
        tokio::time::sleep(Duration::from_millis(50)).await;
        let result = vault.resolve_in_string(&token).await;
        // Expired token left as-is (not resolved)
        assert_eq!(result, token, "expired token should not resolve");
    }
}
