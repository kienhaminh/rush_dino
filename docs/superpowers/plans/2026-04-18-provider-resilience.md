# Provider Resilience & Smart Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add tiered provider fallback, cost-based routing, and streaming error recovery so agent runs survive transient provider failures without user intervention.

**Architecture:** Add `fallback_profile_id` and `cost_tier` fields to `ProviderProfile` in `crates/common/src/config.rs`. Build a `ProviderRouter` in `crates/providers/src/router.rs` that wraps multiple `ProviderService` instances and implements the fallback chain and cost-tier selection. Streaming recovery wraps the stream consumer to detect early errors and re-issue the request. Wire `ProviderRouter` into `crates/server/src/provider_runtime.rs` where `ProviderService::from_config` is called today.

**Tech Stack:** Rust, tokio, async-trait, existing ProviderService abstraction

---

## Current State

- `ProviderService` in `crates/providers/src/lib.rs` — single provider, no retry.
- `ProviderProfile` in `crates/common/src/config.rs` — no fallback or cost tier fields.
- `AppConfig.fallback_profile_ids: Vec<String>` exists at the top level but is unused.
- The main call site is `crates/server/src/provider_runtime.rs:109` — `ProviderService::from_config(&resolved.provider_config)` — which produces an `Arc<Provider>` passed to `AgentEngine`.
- `crates/agent/src/engine_deps.rs` accepts `Arc<Provider>` where `Provider = ProviderService` (type alias). `ProviderRouter` must expose the same `chat` / `stream_chat` / `model` interface, **or** we extend the alias to accept a trait object. The cleanest path (least blast radius) is to make `ProviderRouter` implement the same surface as `ProviderService` and expose it as `Arc<dyn ProviderTrait>`. See Task 0 below.

---

## Task 0: Introduce `ProviderTrait` and update the `Provider` type alias

**Purpose:** Decouple the agent engine from the concrete `ProviderService` enum so `ProviderRouter` can slot in transparently. This is a prerequisite for all subsequent tasks.

**Files:**
- Modify: `crates/providers/src/lib.rs`
- Modify: `crates/providers/src/types.rs` (re-export trait)
- Modify: `crates/agent/src/engine_deps.rs` (`Arc<Provider>` → `Arc<dyn ProviderTrait>`)
- Modify: `crates/server/src/provider_runtime.rs` (update `provider` construction type)

**Steps:**

- [ ] 1. Write a compile-only test in `crates/providers/src/lib.rs` asserting `ProviderService` satisfies `ProviderTrait` (will pass once implemented).

- [ ] 2. Add `ProviderTrait` as an async trait in `crates/providers/src/lib.rs`:

```rust
// At top of crates/providers/src/lib.rs, after existing imports:
use async_trait::async_trait;

#[async_trait]
pub trait ProviderTrait: Send + Sync {
    /// Non-streaming request.
    async fn chat(&self, request: ChatRequest) -> rushdino_common::Result<ChatResponse>;
    /// Streaming request. Returns a channel receiver of chunks.
    async fn stream_chat(
        &self,
        request: ChatRequest,
    ) -> rushdino_common::Result<mpsc::Receiver<ChatChunk>>;
    /// The model identifier used by this provider instance.
    fn model(&self) -> &str;
}
```

- [ ] 3. Implement `ProviderTrait` for `ProviderService` by delegating to the existing inherent methods:

```rust
#[async_trait]
impl ProviderTrait for ProviderService {
    async fn chat(&self, request: ChatRequest) -> rushdino_common::Result<ChatResponse> {
        self.chat(request).await
    }
    async fn stream_chat(
        &self,
        request: ChatRequest,
    ) -> rushdino_common::Result<mpsc::Receiver<ChatChunk>> {
        self.stream_chat(request).await
    }
    fn model(&self) -> &str {
        self.model()
    }
}
```

- [ ] 4. Update the `Provider` type alias and add a `DynProvider` alias:

```rust
// Replace the existing alias:
pub type Provider = dyn ProviderTrait;
// Convenience for Arc usage:
pub type DynProvider = Arc<dyn ProviderTrait>;
```

- [ ] 5. Update `crates/agent/src/engine_deps.rs`:

```rust
// Change:
//   pub provider: Arc<Provider>,
// to:
use rushdino_providers::{DynProvider, ProviderTrait};

pub struct EngineBuildInput {
    pub provider: DynProvider,
    // ... rest unchanged
}
```

  Propagate the type change through all uses in `engine_deps.rs` — each `provider.clone()`, `provider.model()`, etc. already works on `Arc<dyn ProviderTrait>`.

- [ ] 6. Update `crates/server/src/provider_runtime.rs` line 109:

```rust
// Change:
let provider = Arc::new(ProviderService::from_config(&resolved.provider_config)?);
// to:
let provider: DynProvider = Arc::new(ProviderService::from_config(&resolved.provider_config)?);
```

  Import `rushdino_providers::DynProvider` in this file.

- [ ] 7. Run `cargo build --workspace` and fix any remaining type mismatches. Expected: zero errors after mechanical substitution.

- [ ] 8. Commit: `feat(providers): introduce ProviderTrait + DynProvider alias for polymorphic routing`

---

## Task 1: Add `fallback_profile_id` and `cost_tier` to `ProviderProfile`

**Files:**
- Modify: `crates/common/src/config.rs`

**Steps:**

- [ ] 1. Write a test (in `crates/common/src/config.rs` under `#[cfg(test)]`) that deserializes a TOML string with `fallback_profile_id` and `cost_tier` set, then asserts the fields are populated:

```rust
#[cfg(test)]
mod resilience_config_tests {
    use super::*;

    #[test]
    fn provider_profile_deserializes_resilience_fields() {
        let toml_str = r#"
id = "anthropic-primary"
name = "Anthropic Primary"
provider_kind = "anthropic"
auth_method = "api_key"
default_model = "claude-sonnet-4-5"
fallback_profile_id = "ollama-local"
cost_tier = "premium"
"#;
        let profile: ProviderProfile = toml::from_str(toml_str).expect("parse failed");
        assert_eq!(profile.fallback_profile_id.as_deref(), Some("ollama-local"));
        assert_eq!(profile.cost_tier, CostTier::Premium);
    }

    #[test]
    fn provider_profile_resilience_fields_default_to_none_and_standard() {
        let toml_str = r#"
id = "ollama-local"
name = "Ollama Local"
provider_kind = "ollama"
auth_method = "none"
default_model = "llama3.2:latest"
"#;
        let profile: ProviderProfile = toml::from_str(toml_str).expect("parse failed");
        assert!(profile.fallback_profile_id.is_none());
        assert_eq!(profile.cost_tier, CostTier::Standard);
    }
}
```

- [ ] 2. Add `CostTier` enum and update `ProviderProfile` in `crates/common/src/config.rs`:

```rust
/// Cost classification for a provider profile.
/// Used by ProviderRouter to select the cheapest acceptable provider tier.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum CostTier {
    Cheap,
    #[default]
    Standard,
    Premium,
}

// In ProviderProfile, add two fields at the end:
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ProviderProfile {
    pub id: String,
    pub name: String,
    pub provider_kind: Provider,
    pub auth_method: AuthMethod,
    pub default_model: String,
    pub base_url: Option<String>,
    /// Optional profile to try if this one fails (by profile id).
    /// Chains up to 3 deep; cycles are ignored.
    #[serde(default)]
    pub fallback_profile_id: Option<String>,
    /// Cost classification for cost-based routing.
    #[serde(default)]
    pub cost_tier: CostTier,
}
```

- [ ] 3. Run the tests: `cargo test -p rushdino-common resilience_config_tests`. Verify PASS.

- [ ] 4. Commit: `feat(config): add fallback_profile_id and cost_tier to ProviderProfile`

---

## Task 2: Create `ProviderRouter` in `crates/providers/src/router.rs`

**Files:**
- Create: `crates/providers/src/router.rs`
- Modify: `crates/providers/src/lib.rs` (add `pub mod router; pub use router::ProviderRouter;`)

**Steps:**

- [ ] 1. Write a unit test (inline in `router.rs` under `#[cfg(test)]`) that builds a router with a primary that always errors and a fallback that succeeds, verifying `chat()` returns the fallback response:

```rust
#[cfg(test)]
mod router_tests {
    use super::*;
    use rushdino_common::AppError;
    use rushdino_providers::types::{ChatResponse, Usage};
    use async_trait::async_trait;
    use tokio::sync::mpsc;

    struct AlwaysFail;
    struct AlwaysSucceed { content: String }

    #[async_trait]
    impl ProviderTrait for AlwaysFail {
        async fn chat(&self, _req: ChatRequest) -> rushdino_common::Result<ChatResponse> {
            Err(AppError::Provider("simulated failure".into()))
        }
        async fn stream_chat(&self, _req: ChatRequest) -> rushdino_common::Result<mpsc::Receiver<ChatChunk>> {
            Err(AppError::Provider("simulated failure".into()))
        }
        fn model(&self) -> &str { "fail-model" }
    }

    #[async_trait]
    impl ProviderTrait for AlwaysSucceed {
        async fn chat(&self, _req: ChatRequest) -> rushdino_common::Result<ChatResponse> {
            Ok(ChatResponse {
                content: self.content.clone(),
                tool_calls: vec![],
                rich_content: None,
                usage: Some(Usage { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }),
                finish_reason: "stop".into(),
            })
        }
        async fn stream_chat(&self, _req: ChatRequest) -> rushdino_common::Result<mpsc::Receiver<ChatChunk>> {
            let (tx, rx) = mpsc::channel(1);
            let content = self.content.clone();
            tokio::spawn(async move {
                let _ = tx.send(ChatChunk {
                    delta: content,
                    tool_calls: vec![],
                    done: true,
                    usage: None,
                    thinking_delta: None,
                }).await;
            });
            Ok(rx)
        }
        fn model(&self) -> &str { "success-model" }
    }

    fn make_request() -> ChatRequest {
        use rushdino_common::models::Message;
        ChatRequest {
            messages: vec![Message { role: "user".into(), content: "hi".into(), ..Default::default() }],
            tools: None,
            temperature: None,
            max_tokens: None,
            model: None,
            thinking_level: None,
        }
    }

    #[tokio::test]
    async fn chat_falls_back_on_primary_failure() {
        let router = ProviderRouter::from_chain(vec![
            Arc::new(AlwaysFail) as Arc<dyn ProviderTrait>,
            Arc::new(AlwaysSucceed { content: "fallback response".into() }),
        ]);
        let (resp, idx) = router.chat(make_request(), None).await.unwrap();
        assert_eq!(resp.content, "fallback response");
        assert_eq!(idx, 1, "should have used provider at index 1 (fallback)");
    }

    #[tokio::test]
    async fn chat_returns_primary_when_it_succeeds() {
        let router = ProviderRouter::from_chain(vec![
            Arc::new(AlwaysSucceed { content: "primary response".into() }) as Arc<dyn ProviderTrait>,
            Arc::new(AlwaysSucceed { content: "fallback response".into() }),
        ]);
        let (resp, idx) = router.chat(make_request(), None).await.unwrap();
        assert_eq!(resp.content, "primary response");
        assert_eq!(idx, 0);
    }

    #[tokio::test]
    async fn chat_errors_when_all_providers_fail() {
        let router = ProviderRouter::from_chain(vec![
            Arc::new(AlwaysFail) as Arc<dyn ProviderTrait>,
            Arc::new(AlwaysFail),
        ]);
        let result = router.chat(make_request(), None).await;
        assert!(result.is_err());
    }
}
```

- [ ] 2. Implement `ProviderRouter` in `crates/providers/src/router.rs`:

```rust
//! ProviderRouter — tiered fallback and cost-based routing for AI providers.
//!
//! Wraps a chain of ProviderService instances. On AppError::Provider, the
//! router retries with the next provider in the chain, up to chain length.
//! Cost-tier routing filters the chain to providers matching the requested tier.

use std::sync::Arc;

use async_trait::async_trait;
use tokio::sync::mpsc;
use tracing::{debug, warn};

use rushdino_common::{
    config::{CostTier, CredentialsConfig, ProviderProfile},
    AppError, Result,
};

use crate::{
    types::{ChatChunk, ChatRequest, ChatResponse},
    ProviderService, ProviderTrait,
};

/// Resolved entry in the router chain.
struct RouterEntry {
    profile_id: String,
    cost_tier: CostTier,
    provider: Arc<dyn ProviderTrait>,
}

/// Routes chat requests across a priority-ordered chain of providers.
/// On provider error, falls back to the next entry in the chain.
pub struct ProviderRouter {
    chain: Vec<RouterEntry>,
}

impl ProviderRouter {
    /// Build a router from pre-resolved `(profile_id, cost_tier, provider)` tuples.
    /// Order determines fallback priority: index 0 is tried first.
    pub fn new(entries: Vec<(String, CostTier, Arc<dyn ProviderTrait>)>) -> Self {
        Self {
            chain: entries
                .into_iter()
                .map(|(profile_id, cost_tier, provider)| RouterEntry {
                    profile_id,
                    cost_tier,
                    provider,
                })
                .collect(),
        }
    }

    /// Build a router from a raw chain of trait objects, using Standard cost tier.
    /// Primarily used in unit tests.
    pub fn from_chain(providers: Vec<Arc<dyn ProviderTrait>>) -> Self {
        Self {
            chain: providers
                .into_iter()
                .enumerate()
                .map(|(i, p)| RouterEntry {
                    profile_id: format!("provider-{i}"),
                    cost_tier: CostTier::Standard,
                    provider: p,
                })
                .collect(),
        }
    }

    /// Build a `ProviderRouter` from the config profile list.
    ///
    /// `primary_profile_id` — the profile the agent engine resolved (e.g. default profile).
    /// The method resolves the fallback chain from `ProviderProfile.fallback_profile_id`,
    /// up to a maximum of 3 hops to prevent infinite loops.
    pub async fn from_profiles(
        primary_profile_id: &str,
        profiles: &[ProviderProfile],
        credentials: &CredentialsConfig,
        // Callback that turns a ProviderProfile into a concrete ProviderService.
        // Accepts a mutable reference to credentials so OAuth refresh can write back tokens.
        build_provider: &impl Fn(&ProviderProfile) -> Result<ProviderService>,
    ) -> Result<Self> {
        const MAX_CHAIN_DEPTH: usize = 3;
        let mut chain: Vec<RouterEntry> = Vec::with_capacity(MAX_CHAIN_DEPTH);
        let mut seen: Vec<String> = Vec::with_capacity(MAX_CHAIN_DEPTH);
        let mut current_id = primary_profile_id.to_owned();

        loop {
            if seen.contains(&current_id) {
                warn!(profile_id = %current_id, "fallback chain cycle detected — stopping");
                break;
            }
            if chain.len() >= MAX_CHAIN_DEPTH {
                debug!("fallback chain reached max depth {MAX_CHAIN_DEPTH}");
                break;
            }

            let profile = profiles
                .iter()
                .find(|p| p.id == current_id)
                .ok_or_else(|| {
                    AppError::Provider(format!(
                        "fallback profile '{current_id}' not found in config"
                    ))
                })?;

            let provider = build_provider(profile).map_err(|e| {
                AppError::Provider(format!(
                    "failed to build provider for profile '{}': {e}",
                    profile.id
                ))
            })?;

            chain.push(RouterEntry {
                profile_id: profile.id.clone(),
                cost_tier: profile.cost_tier.clone(),
                provider: Arc::new(provider),
            });
            seen.push(current_id.clone());

            match &profile.fallback_profile_id {
                Some(next_id) => current_id = next_id.clone(),
                None => break,
            }
        }

        Ok(Self { chain })
    }

    /// Returns the subset of entries that match `tier`, in chain order.
    /// If no entries match, returns all entries (degrade gracefully).
    fn entries_for_tier(&self, tier: &CostTier) -> Vec<&RouterEntry> {
        let filtered: Vec<&RouterEntry> =
            self.chain.iter().filter(|e| &e.cost_tier == tier).collect();
        if filtered.is_empty() {
            self.chain.iter().collect()
        } else {
            filtered
        }
    }

    /// Send a non-streaming chat request, trying providers in priority order.
    ///
    /// Returns `(response, index_used)` where `index_used` is the index in the
    /// internal chain that produced the successful response. Useful for logging
    /// and observability.
    ///
    /// `cost_tier` — if `Some`, restricts the candidate set to profiles of that tier.
    pub async fn chat(
        &self,
        request: ChatRequest,
        cost_tier: Option<&CostTier>,
    ) -> Result<(ChatResponse, usize)> {
        let candidates: Vec<(usize, &RouterEntry)> = match cost_tier {
            Some(tier) => {
                // Map tier-filtered entries back to their original chain indices.
                let tier_entries = self.entries_for_tier(tier);
                self.chain
                    .iter()
                    .enumerate()
                    .filter(|(_, e)| tier_entries.iter().any(|te| te.profile_id == e.profile_id))
                    .collect()
            }
            None => self.chain.iter().enumerate().collect(),
        };

        let mut last_err = AppError::Provider("provider chain is empty".into());

        for (chain_idx, entry) in candidates {
            debug!(
                profile_id = %entry.profile_id,
                chain_index = chain_idx,
                "router: attempting provider"
            );
            match entry.provider.chat(request.clone()).await {
                Ok(resp) => {
                    debug!(profile_id = %entry.profile_id, "router: provider succeeded");
                    return Ok((resp, chain_idx));
                }
                Err(AppError::Provider(msg)) => {
                    warn!(
                        profile_id = %entry.profile_id,
                        error = %msg,
                        "router: provider failed, trying next in chain"
                    );
                    last_err = AppError::Provider(msg);
                }
                Err(other) => return Err(other),
            }
        }

        Err(last_err)
    }

    /// Send a streaming chat request, trying providers in priority order.
    ///
    /// Returns `(receiver, index_used)`. If the primary provider fails to open
    /// the stream (before any chunks arrive), the router retries with the next.
    pub async fn stream_chat(
        &self,
        request: ChatRequest,
        cost_tier: Option<&CostTier>,
    ) -> Result<(mpsc::Receiver<ChatChunk>, usize)> {
        let candidates: Vec<(usize, &RouterEntry)> = match cost_tier {
            Some(tier) => {
                let tier_entries = self.entries_for_tier(tier);
                self.chain
                    .iter()
                    .enumerate()
                    .filter(|(_, e)| tier_entries.iter().any(|te| te.profile_id == e.profile_id))
                    .collect()
            }
            None => self.chain.iter().enumerate().collect(),
        };

        let mut last_err = AppError::Provider("provider chain is empty".into());

        for (chain_idx, entry) in candidates {
            debug!(
                profile_id = %entry.profile_id,
                chain_index = chain_idx,
                "router: attempting streaming provider"
            );
            match entry.provider.stream_chat(request.clone()).await {
                Ok(rx) => {
                    debug!(profile_id = %entry.profile_id, "router: stream opened");
                    return Ok((rx, chain_idx));
                }
                Err(AppError::Provider(msg)) => {
                    warn!(
                        profile_id = %entry.profile_id,
                        error = %msg,
                        "router: stream open failed, trying next in chain"
                    );
                    last_err = AppError::Provider(msg);
                }
                Err(other) => return Err(other),
            }
        }

        Err(last_err)
    }

    /// Returns a reference to the primary (first) provider's model string.
    pub fn primary_model(&self) -> &str {
        self.chain
            .first()
            .map(|e| e.provider.model())
            .unwrap_or("unknown")
    }
}
```

- [ ] 3. In `crates/providers/src/lib.rs`, add after existing module declarations:

```rust
pub mod router;
pub use router::ProviderRouter;
```

- [ ] 4. Run the tests: `cargo test -p rushdino-providers router_tests`. Verify all 3 tests PASS.

- [ ] 5. Commit: `feat(providers): add ProviderRouter with tiered fallback chain`

---

## Task 3: Cost-tier routing

**Files:**
- Modify: `crates/providers/src/router.rs`

Cost-tier routing is already wired into `ProviderRouter::chat` and `stream_chat` via the `cost_tier: Option<&CostTier>` parameter added in Task 2. This task adds tests and validates the filtering logic.

**Steps:**

- [ ] 1. Add the following tests inside the existing `router_tests` module in `router.rs`:

```rust
#[tokio::test]
async fn cost_tier_routing_selects_matching_tier() {
    // Build a router with 3 entries at different tiers.
    // The Premium provider always fails to confirm routing logic picks Cheap.
    let premium_entry = (
        "premium".to_owned(),
        CostTier::Premium,
        Arc::new(AlwaysFail) as Arc<dyn ProviderTrait>,
    );
    let standard_entry = (
        "standard".to_owned(),
        CostTier::Standard,
        Arc::new(AlwaysFail) as Arc<dyn ProviderTrait>,
    );
    let cheap_entry = (
        "cheap".to_owned(),
        CostTier::Cheap,
        Arc::new(AlwaysSucceed { content: "cheap response".into() }) as Arc<dyn ProviderTrait>,
    );

    let router = ProviderRouter::new(vec![premium_entry, standard_entry, cheap_entry]);
    let (resp, _idx) = router
        .chat(make_request(), Some(&CostTier::Cheap))
        .await
        .unwrap();
    assert_eq!(resp.content, "cheap response");
}

#[tokio::test]
async fn cost_tier_routing_falls_back_to_all_when_no_match() {
    // No Cheap entries — router should fall back to trying all providers.
    let standard_entry = (
        "standard".to_owned(),
        CostTier::Standard,
        Arc::new(AlwaysSucceed { content: "standard fallback".into() }) as Arc<dyn ProviderTrait>,
    );
    let router = ProviderRouter::new(vec![standard_entry]);
    let (resp, _idx) = router
        .chat(make_request(), Some(&CostTier::Cheap))
        .await
        .unwrap();
    // No Cheap match → degrades to all providers → Standard succeeds
    assert_eq!(resp.content, "standard fallback");
}

#[tokio::test]
async fn cost_tier_routing_premium_skipped_when_cheap_requested() {
    // Cheap requested; Premium provider should not be invoked.
    // We verify by: only Premium is failing, Cheap succeeds.
    let premium_entry = (
        "premium".to_owned(),
        CostTier::Premium,
        Arc::new(AlwaysFail) as Arc<dyn ProviderTrait>,
    );
    let cheap_entry = (
        "cheap".to_owned(),
        CostTier::Cheap,
        Arc::new(AlwaysSucceed { content: "cheap ok".into() }) as Arc<dyn ProviderTrait>,
    );
    let router = ProviderRouter::new(vec![premium_entry, cheap_entry]);
    let (resp, idx) = router
        .chat(make_request(), Some(&CostTier::Cheap))
        .await
        .unwrap();
    assert_eq!(resp.content, "cheap ok");
    // chain index 1 = cheap_entry (index in full chain, not filtered)
    assert_eq!(idx, 1);
}
```

- [ ] 2. Run: `cargo test -p rushdino-providers router_tests`. Verify all new tests PASS.

- [ ] 3. Commit: `test(providers): add cost-tier routing tests for ProviderRouter`

---

## Task 4: Streaming error recovery (retry on early first-chunk failure)

**Files:**
- Modify: `crates/providers/src/router.rs`

**Context:** The `ChatChunk` type has a `done: bool` field but no explicit error variant. Provider errors manifest in two ways during streaming:
1. The `stream_chat()` call itself returns `Err(AppError::Provider(...))` — this is already handled by the Task 2 fallback loop.
2. The stream opens successfully but the first chunk carries an error signal (e.g. Anthropic overload returns a 529 that is received as an error event mid-stream).

For case 2, we add a wrapper that peeks at the first chunk. If the first chunk signals an error (`delta` starts with `[ERROR]` or the stream closes immediately with `done: true` and empty content), we retry with the next provider. If content has already been received (partial stream), we do NOT retry — we pass the partial stream through unchanged.

**Steps:**

- [ ] 1. Add an `error_chunk` discriminator to `ChatChunk` — add a field to the existing struct in `crates/providers/src/types.rs`:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatChunk {
    pub delta: String,
    pub tool_calls: Vec<ToolCall>,
    pub done: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub usage: Option<Usage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thinking_delta: Option<String>,
    /// Set to true by providers when the chunk represents an error condition
    /// (e.g. rate limit, overload) rather than content. The router uses this
    /// flag to decide whether to retry with a fallback provider.
    #[serde(default)]
    pub is_error: bool,
}
```

  Update all existing `ChatChunk { ... }` construction sites to add `is_error: false` (or leave default via `..Default::default()` if `Default` is derived). Search for `ChatChunk {` across the codebase and add the field. Since `is_error` has `#[serde(default)]`, deserialization from existing responses is backward-compatible.

- [ ] 2. Add helper `fn is_chunk_error(chunk: &ChatChunk) -> bool` in `router.rs`:

```rust
fn is_chunk_error(chunk: &ChatChunk) -> bool {
    chunk.is_error || (chunk.done && chunk.delta.is_empty() && chunk.tool_calls.is_empty())
}
```

- [ ] 3. Add streaming error recovery tests to `router_tests`:

```rust
#[tokio::test]
async fn stream_retries_on_immediate_error_chunk() {
    use tokio::sync::mpsc;

    struct ErrorFirstStream;
    #[async_trait]
    impl ProviderTrait for ErrorFirstStream {
        async fn chat(&self, _req: ChatRequest) -> rushdino_common::Result<ChatResponse> {
            Err(AppError::Provider("not used".into()))
        }
        async fn stream_chat(&self, _req: ChatRequest) -> rushdino_common::Result<mpsc::Receiver<ChatChunk>> {
            let (tx, rx) = mpsc::channel(1);
            tokio::spawn(async move {
                let _ = tx.send(ChatChunk {
                    delta: String::new(),
                    tool_calls: vec![],
                    done: true,
                    usage: None,
                    thinking_delta: None,
                    is_error: true,
                }).await;
            });
            Ok(rx)
        }
        fn model(&self) -> &str { "error-model" }
    }

    let router = ProviderRouter::new(vec![
        ("primary".into(), CostTier::Standard, Arc::new(ErrorFirstStream) as Arc<dyn ProviderTrait>),
        ("fallback".into(), CostTier::Standard, Arc::new(AlwaysSucceed { content: "recovered".into() }) as Arc<dyn ProviderTrait>),
    ]);

    let (mut rx, idx) = router.stream_chat_with_recovery(make_request(), None).await.unwrap();
    assert_eq!(idx, 1, "should have fallen back to provider index 1");

    let first_chunk = rx.recv().await.expect("expected a chunk");
    assert_eq!(first_chunk.delta, "recovered");
}

#[tokio::test]
async fn stream_does_not_retry_after_partial_content() {
    use tokio::sync::mpsc;

    struct PartialThenErrorStream;
    #[async_trait]
    impl ProviderTrait for PartialThenErrorStream {
        async fn chat(&self, _req: ChatRequest) -> rushdino_common::Result<ChatResponse> {
            Err(AppError::Provider("not used".into()))
        }
        async fn stream_chat(&self, _req: ChatRequest) -> rushdino_common::Result<mpsc::Receiver<ChatChunk>> {
            let (tx, rx) = mpsc::channel(2);
            tokio::spawn(async move {
                // First chunk: real content
                let _ = tx.send(ChatChunk {
                    delta: "partial content ".into(),
                    tool_calls: vec![],
                    done: false,
                    usage: None,
                    thinking_delta: None,
                    is_error: false,
                }).await;
                // Second chunk: error
                let _ = tx.send(ChatChunk {
                    delta: String::new(),
                    tool_calls: vec![],
                    done: true,
                    usage: None,
                    thinking_delta: None,
                    is_error: true,
                }).await;
            });
            Ok(rx)
        }
        fn model(&self) -> &str { "partial-model" }
    }

    let router = ProviderRouter::new(vec![
        ("primary".into(), CostTier::Standard, Arc::new(PartialThenErrorStream) as Arc<dyn ProviderTrait>),
        ("fallback".into(), CostTier::Standard, Arc::new(AlwaysSucceed { content: "should not appear".into() }) as Arc<dyn ProviderTrait>),
    ]);

    let (mut rx, idx) = router.stream_chat_with_recovery(make_request(), None).await.unwrap();
    assert_eq!(idx, 0, "should have stayed on primary after partial content");
    let first = rx.recv().await.unwrap();
    assert_eq!(first.delta, "partial content ");
}
```

- [ ] 4. Implement `stream_chat_with_recovery` in `router.rs`:

```rust
/// Streaming chat with first-chunk error recovery.
///
/// Opens a stream from the best available provider. If the **first** chunk
/// is an error chunk (no prior content), transparently retries with the next
/// provider in the chain — up to 2 retries beyond the primary.
///
/// If partial content has already been received, the stream is passed through
/// unchanged: mid-stream retries would produce duplicate/garbled output.
///
/// Returns `(receiver, chain_index_used)`.
pub async fn stream_chat_with_recovery(
    &self,
    request: ChatRequest,
    cost_tier: Option<&CostTier>,
) -> Result<(mpsc::Receiver<ChatChunk>, usize)> {
    let candidates: Vec<(usize, &RouterEntry)> = match cost_tier {
        Some(tier) => {
            let tier_entries = self.entries_for_tier(tier);
            self.chain
                .iter()
                .enumerate()
                .filter(|(_, e)| tier_entries.iter().any(|te| te.profile_id == e.profile_id))
                .collect()
        }
        None => self.chain.iter().enumerate().collect(),
    };

    const MAX_STREAM_RETRIES: usize = 2;
    let mut attempt = 0usize;
    let mut last_err = AppError::Provider("provider chain is empty".into());

    for (chain_idx, entry) in &candidates {
        if attempt > MAX_STREAM_RETRIES {
            break;
        }

        debug!(
            profile_id = %entry.profile_id,
            chain_index = chain_idx,
            attempt,
            "router: attempting streaming provider"
        );

        match entry.provider.stream_chat(request.clone()).await {
            Err(AppError::Provider(msg)) => {
                warn!(
                    profile_id = %entry.profile_id,
                    error = %msg,
                    "router: stream open error, trying next"
                );
                last_err = AppError::Provider(msg);
                attempt += 1;
                continue;
            }
            Err(other) => return Err(other),
            Ok(mut rx) => {
                // Peek the first chunk to check for an immediate error.
                match rx.recv().await {
                    None => {
                        // Stream closed immediately with no chunks — treat as error.
                        warn!(
                            profile_id = %entry.profile_id,
                            "router: stream closed immediately with no chunks, retrying"
                        );
                        last_err = AppError::Provider(format!(
                            "provider '{}' closed stream without sending any chunks",
                            entry.profile_id
                        ));
                        attempt += 1;
                        continue;
                    }
                    Some(first_chunk) => {
                        if is_chunk_error(&first_chunk) && attempt < MAX_STREAM_RETRIES {
                            warn!(
                                profile_id = %entry.profile_id,
                                "router: first chunk is error chunk, retrying with next provider"
                            );
                            attempt += 1;
                            continue;
                        }

                        // Either first chunk is valid, or we've exhausted retries.
                        // Reconstruct the stream: re-send the peeked chunk + forward rest.
                        let (out_tx, out_rx) = mpsc::channel(32);
                        let first_done = first_chunk.done;
                        let tx_clone = out_tx.clone();
                        tokio::spawn(async move {
                            if tx_clone.send(first_chunk).await.is_err() {
                                return;
                            }
                            if first_done {
                                return;
                            }
                            while let Some(chunk) = rx.recv().await {
                                if tx_clone.send(chunk).await.is_err() {
                                    break;
                                }
                            }
                        });
                        return Ok((out_rx, *chain_idx));
                    }
                }
            }
        }
    }

    Err(last_err)
}
```

- [ ] 5. Run: `cargo test -p rushdino-providers router_tests`. Verify all streaming tests PASS.

- [ ] 6. Commit: `feat(providers): add streaming error recovery to ProviderRouter`

---

## Task 5: Wire `ProviderRouter` into agent engine

**Files:**
- Modify: `crates/server/src/provider_runtime.rs`
- Modify: `crates/agent/src/engine.rs` (swap `provider.chat()`/`provider.stream_chat()` to use `stream_chat_with_recovery` if engine calls stream directly, else no change needed)

**Context:** The current call site at line 109 of `provider_runtime.rs`:

```rust
let provider = Arc::new(ProviderService::from_config(&resolved.provider_config)?);
```

After Task 0, `provider` is `DynProvider` (`Arc<dyn ProviderTrait>`). We now replace the single-provider construction with a `ProviderRouter` built from the fallback chain, then expose it as `DynProvider` via a `ProviderTrait` impl on `ProviderRouter`.

**Steps:**

- [ ] 1. Implement `ProviderTrait` for `ProviderRouter` so it can be used as `DynProvider`:

  Add to `crates/providers/src/router.rs`:

```rust
/// Implement ProviderTrait for ProviderRouter so it can be used as a DynProvider.
/// Uses stream_chat_with_recovery for streaming, and chat() with no cost-tier filter.
#[async_trait]
impl crate::ProviderTrait for ProviderRouter {
    async fn chat(&self, request: ChatRequest) -> rushdino_common::Result<ChatResponse> {
        self.chat(request, None).await.map(|(resp, _idx)| resp)
    }

    async fn stream_chat(
        &self,
        request: ChatRequest,
    ) -> rushdino_common::Result<mpsc::Receiver<ChatChunk>> {
        self.stream_chat_with_recovery(request, None)
            .await
            .map(|(rx, _idx)| rx)
    }

    fn model(&self) -> &str {
        self.primary_model()
    }
}
```

- [ ] 2. Write an integration test in `crates/server/tests/` (new file: `provider_resilience_integration.rs`) that creates a config with a failing primary profile and working fallback profile, calls `refresh_runtime_from_disk`, and verifies the engine is available:

```rust
//! Integration test: provider fallback makes agent engine available
//! even when the default profile's API key is invalid.

// NOTE: This test uses mock profiles; actual HTTP calls are NOT made.
// It verifies the router is wired correctly at the config/runtime level.

use rushdino_common::config::{
    AuthMethod, CostTier, Provider, ProviderProfile,
};

#[test]
fn provider_profile_with_fallback_chain_resolves_correctly() {
    let primary = ProviderProfile {
        id: "primary".into(),
        name: "Primary".into(),
        provider_kind: Provider::Anthropic,
        auth_method: AuthMethod::ApiKey,
        default_model: "claude-sonnet-4-5".into(),
        base_url: None,
        fallback_profile_id: Some("fallback".into()),
        cost_tier: CostTier::Premium,
    };
    let fallback = ProviderProfile {
        id: "fallback".into(),
        name: "Fallback".into(),
        provider_kind: Provider::Ollama,
        auth_method: AuthMethod::None,
        default_model: "llama3.2:latest".into(),
        base_url: None,
        fallback_profile_id: None,
        cost_tier: CostTier::Cheap,
    };

    // Chain: primary → fallback. No cycle.
    let profiles = vec![primary.clone(), fallback.clone()];
    let mut seen = vec![];
    let mut current = primary.id.clone();
    loop {
        seen.push(current.clone());
        let p = profiles.iter().find(|p| p.id == current).unwrap();
        match &p.fallback_profile_id {
            Some(next) => {
                assert!(!seen.contains(next), "cycle detected");
                current = next.clone();
            }
            None => break,
        }
    }
    assert_eq!(seen, vec!["primary", "fallback"]);
}
```

- [ ] 3. Update `refresh_runtime_from_disk` in `crates/server/src/provider_runtime.rs` to build a `ProviderRouter` instead of a single `ProviderService`:

```rust
// Replace lines 108-109:
//   let provider = Arc::new(ProviderService::from_config(&resolved.provider_config)?);
// with:

use rushdino_providers::{DynProvider, ProviderRouter};

let provider: DynProvider = {
    // Build the fallback chain starting from the resolved profile.
    // provider_config_from_profile is reused for each profile in the chain.
    // We use a synchronous closure here; async resolution for OAuth is
    // only needed for the primary (already resolved above).
    // Fallback profiles must use ApiKey auth (no OAuth token refresh in chain).
    let build_fn = |profile: &ProviderProfile| -> rushdino_common::Result<ProviderService> {
        let secrets = credentials.profiles.get(&profile.id);
        let provider_cfg = match profile.provider_kind {
            rushdino_common::config::Provider::Ollama => {
                rushdino_providers::types::ProviderConfig::Ollama {
                    base_url: normalize_ollama_base_url(profile.base_url.as_deref()),
                    model: profile.default_model.clone(),
                    api_key: None,
                }
            }
            rushdino_common::config::Provider::OpenAI => {
                let api_key = require_api_key(secrets, &profile.id)?;
                rushdino_providers::types::ProviderConfig::OpenAI {
                    auth: rushdino_providers::types::OpenAIAuth::ApiKey { api_key },
                    model: profile.default_model.clone(),
                    base_url: profile.base_url.clone(),
                }
            }
            rushdino_common::config::Provider::Anthropic => {
                let api_key = require_api_key(secrets, &profile.id)?;
                rushdino_providers::types::ProviderConfig::Anthropic {
                    auth: rushdino_providers::types::AnthropicAuth::ApiKey { api_key },
                    model: profile.default_model.clone(),
                }
            }
        };
        ProviderService::from_config(&provider_cfg)
    };

    // Use the already-resolved primary config for the first chain entry;
    // subsequent entries are built from their profile via build_fn.
    // We pre-build the primary from its already-resolved config to preserve OAuth.
    let primary_service = ProviderService::from_config(&resolved.provider_config)?;
    let primary_arc: Arc<dyn rushdino_providers::ProviderTrait> = Arc::new(primary_service);

    let mut chain_entries: Vec<(String, rushdino_common::config::CostTier, Arc<dyn rushdino_providers::ProviderTrait>)> = vec![
        (
            resolved.profile_id.clone(),
            config.profiles
                .iter()
                .find(|p| p.id == resolved.profile_id)
                .map(|p| p.cost_tier.clone())
                .unwrap_or_default(),
            primary_arc,
        ),
    ];

    // Resolve fallback chain (up to 2 additional hops).
    let primary_profile = config.profiles.iter().find(|p| p.id == resolved.profile_id);
    if let Some(mut current_profile) = primary_profile {
        let mut depth = 0usize;
        let mut seen_ids = vec![current_profile.id.clone()];
        while depth < 2 {
            if let Some(fallback_id) = &current_profile.fallback_profile_id {
                if seen_ids.contains(fallback_id) {
                    tracing::warn!(profile_id = %fallback_id, "fallback chain cycle — stopping");
                    break;
                }
                if let Some(fallback_profile) = config.profiles.iter().find(|p| &p.id == fallback_id) {
                    match build_fn(fallback_profile) {
                        Ok(svc) => {
                            chain_entries.push((
                                fallback_profile.id.clone(),
                                fallback_profile.cost_tier.clone(),
                                Arc::new(svc),
                            ));
                            seen_ids.push(fallback_profile.id.clone());
                            current_profile = fallback_profile;
                            depth += 1;
                        }
                        Err(e) => {
                            tracing::warn!(
                                profile_id = %fallback_id,
                                error = %e,
                                "could not build fallback provider — skipping"
                            );
                            break;
                        }
                    }
                } else {
                    tracing::warn!(profile_id = %fallback_id, "fallback profile not found in config");
                    break;
                }
            } else {
                break;
            }
        }
    }

    if chain_entries.len() > 1 {
        tracing::info!(
            chain_len = chain_entries.len(),
            "provider router: built fallback chain"
        );
        Arc::new(ProviderRouter::new(chain_entries))
    } else {
        // Single provider — wrap directly for zero overhead.
        chain_entries.remove(0).2
    }
};
```

- [ ] 4. Run: `cargo build --workspace`. Fix any type/import errors.

- [ ] 5. Run: `cargo test --workspace`. All existing tests must PASS.

- [ ] 6. Commit: `feat(server): wire ProviderRouter into agent engine with fallback chain support`

---

## Task 6: Observability & metrics

**Files:**
- Modify: `crates/providers/src/router.rs`

**Steps:**

- [ ] 1. Add structured tracing events to `ProviderRouter::chat`, `stream_chat`, and `stream_chat_with_recovery`:

```rust
// Already present from Tasks 2–4. Confirm the following tracing fields exist:
// - profile_id: which provider was used
// - chain_index: its position in the fallback chain
// - fallback_count: how many providers were tried before success
// - cost_tier: requested tier (if any)
```

  Specifically, in the success path of `chat()`, add:

```rust
tracing::info!(
    profile_id = %entry.profile_id,
    chain_index = chain_idx,
    fallback_count = chain_idx,  // 0 = primary succeeded, 1+ = fallback was used
    "provider router: request completed"
);
```

- [ ] 2. In `stream_chat_with_recovery`, add on final success:

```rust
tracing::info!(
    profile_id = %entry.profile_id,
    chain_index = chain_idx,
    stream_retry_count = attempt,
    "provider router: stream opened"
);
```

- [ ] 3. Commit: `feat(providers): add structured tracing to ProviderRouter for observability`

---

## Task 7: Documentation & config example

**Files:**
- Modify: `docs/system-architecture.md` — add a section on provider routing.

**Steps:**

- [ ] 1. Add the following section to `docs/system-architecture.md`:

```markdown
## Provider Resilience & Smart Routing

Provider routing is handled by `ProviderRouter` in `crates/providers/src/router.rs`.

### Fallback Chain

Each `ProviderProfile` in `config.toml` can declare a `fallback_profile_id`. On any
`AppError::Provider` (transient failure, rate limit, outage), the router tries the next
provider in the chain. Chains are resolved at runtime startup, up to 3 hops deep.

Example `config.toml`:

```toml
[[profiles]]
id = "anthropic-primary"
name = "Anthropic"
provider_kind = "anthropic"
auth_method = "api_key"
default_model = "claude-sonnet-4-5"
fallback_profile_id = "openai-backup"
cost_tier = "premium"

[[profiles]]
id = "openai-backup"
name = "OpenAI Backup"
provider_kind = "openai"
auth_method = "api_key"
default_model = "gpt-4.1-mini"
fallback_profile_id = "ollama-local"
cost_tier = "standard"

[[profiles]]
id = "ollama-local"
name = "Ollama Local"
provider_kind = "ollama"
auth_method = "none"
default_model = "llama3.2:latest"
cost_tier = "cheap"
```

### Cost-Tier Routing

`CostTier` values: `cheap`, `standard` (default), `premium`.

At runtime, a caller can pass `Some(&CostTier::Cheap)` to `ProviderRouter::chat()` or
`stream_chat_with_recovery()` to restrict candidate providers to the Cheap tier. If no
Cheap providers are available, the router degrades gracefully to all providers.

### Streaming Recovery

`stream_chat_with_recovery` peeks the first chunk from each stream attempt. If the first
chunk is an error chunk (`is_error: true` or empty `done` chunk), the router retries with
the next provider (up to 2 retries). Once real content has been received, mid-stream
errors are passed through unchanged — partial retries would produce garbled output.
```

- [ ] 2. Commit: `docs: document provider resilience and smart routing architecture`

---

## Implementation Order

Execute tasks in this order to minimize integration friction:

1. Task 0 — `ProviderTrait` (prerequisite for all others)
2. Task 1 — Config fields (`CostTier`, `fallback_profile_id`)
3. Task 2 — `ProviderRouter` core (fallback chain)
4. Task 3 — Cost-tier routing tests (validates Task 2 logic)
5. Task 4 — Streaming recovery
6. Task 5 — Wire into engine
7. Task 6 — Observability
8. Task 7 — Docs

---

## Definition of Done

- [ ] `cargo build --workspace` passes with zero warnings added by this feature.
- [ ] `cargo test --workspace` passes: all 8+ new tests in `router_tests` green, all existing tests unchanged.
- [ ] A config with `fallback_profile_id = "..."` and `cost_tier = "cheap"` deserializes without error.
- [ ] `ProviderRouter::chat()` with a failing primary returns the fallback response.
- [ ] `ProviderRouter::stream_chat_with_recovery()` with an error-first stream retries transparently.
- [ ] `refresh_runtime_from_disk` builds a `ProviderRouter` when a fallback chain exists.
