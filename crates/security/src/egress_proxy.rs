// Egress proxy for dynamic network enforcement in the agent sandbox.
//
// The `EgressProxy` evaluates outbound network requests against the active
// `NetworkPolicy` and returns an `EgressDecision` indicating whether to allow,
// deny, route for inference, or pend human approval.
//
// Policy can be hot-swapped at runtime via `update_policy()` without restarting
// the agent — the `RwLock` ensures reads are non-blocking under normal operation.

use std::sync::{Arc, RwLock};

use crate::policy::types::{BlockBehavior, DefaultAction, NetworkPolicy};

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/// Describes a single outbound network request to be evaluated.
#[derive(Debug, Clone)]
pub struct EgressRequest {
    /// Target hostname (e.g. `"api.anthropic.com"`).
    pub host: String,
    /// TCP destination port.
    pub port: u16,
    /// HTTP method in uppercase (e.g. `"GET"`, `"POST"`).
    pub method: String,
    /// URL path (e.g. `"/v1/chat/completions"`).
    pub path: String,
}

/// Outcome returned by `EgressProxy::check()`.
#[derive(Debug, Clone, PartialEq)]
pub enum EgressDecision {
    /// Request is permitted by an explicit allow rule or the default action.
    Allow,
    /// Request is denied; the inner string describes the reason.
    Deny(String),
    /// Request should be forwarded to the internal inference gateway.
    RouteForInference,
    /// Request is blocked but requires human approval before proceeding.
    PendingApproval,
}

// ---------------------------------------------------------------------------
// EgressProxy
// ---------------------------------------------------------------------------

/// Thread-safe egress proxy that enforces the current `NetworkPolicy`.
///
/// Wrap in an `Arc` to share across tasks:
/// ```rust,ignore
/// let proxy = Arc::new(EgressProxy::new(policy));
/// ```
pub struct EgressProxy {
    policy: Arc<RwLock<NetworkPolicy>>,
}

impl EgressProxy {
    /// Create a new proxy with the given initial policy.
    pub fn new(policy: NetworkPolicy) -> Self {
        Self {
            policy: Arc::new(RwLock::new(policy)),
        }
    }

    /// Evaluate an outbound request against the current policy.
    ///
    /// Decision priority:
    /// 1. If any `allow` rule matches → `Allow`.
    /// 2. Otherwise fall through to `policy.default`:
    ///    - `Allow`  → `Allow`
    ///    - `Deny`   → consult `policy.on_block` for final outcome.
    pub fn check(&self, request: &EgressRequest) -> EgressDecision {
        let policy = self
            .policy
            .read()
            .expect("EgressProxy policy RwLock poisoned");

        // Walk the explicit allow-list first.
        for rule in &policy.allow {
            if !host_matches(&rule.host, &request.host) {
                continue;
            }
            // Port 0 in a rule means "any port".
            if rule.port != 0 && rule.port != request.port {
                continue;
            }
            // Empty methods list means all methods are permitted.
            if !rule.methods.is_empty() && !rule.methods.contains(&request.method) {
                continue;
            }
            // Empty paths list means all paths are permitted.
            if !rule.paths.is_empty()
                && !rule
                    .paths
                    .iter()
                    .any(|p| request.path.starts_with(p.as_str()))
            {
                continue;
            }
            // All conditions satisfied — permit the request.
            return EgressDecision::Allow;
        }

        // No allow rule matched; apply the default action.
        match policy.default {
            DefaultAction::Allow => EgressDecision::Allow,
            DefaultAction::Deny => match policy.on_block {
                BlockBehavior::Prompt => EgressDecision::PendingApproval,
                BlockBehavior::Deny => {
                    EgressDecision::Deny("no matching policy rule".to_string())
                }
                BlockBehavior::HardStop => {
                    EgressDecision::Deny("hard-stop: no matching policy rule".to_string())
                }
            },
        }
    }

    /// Atomically replace the active policy.
    ///
    /// All `check()` calls that begin after this returns will observe the new
    /// policy. In-flight reads complete against the old policy.
    pub fn update_policy(&self, new_policy: NetworkPolicy) {
        let mut policy = self
            .policy
            .write()
            .expect("EgressProxy policy RwLock poisoned");
        *policy = new_policy;
    }

    /// Return a snapshot of the current policy.
    pub fn current_policy(&self) -> NetworkPolicy {
        self.policy
            .read()
            .expect("EgressProxy policy RwLock poisoned")
            .clone()
    }
}

// ---------------------------------------------------------------------------
// Host glob matching
// ---------------------------------------------------------------------------

/// Match a hostname against a pattern that may contain a leading `*.` wildcard.
///
/// Rules:
/// - `*.anthropic.com` matches `api.anthropic.com` but **not** `anthropic.com`
///   (the wildcard must cover at least one label).
/// - All other patterns are matched literally (case-sensitive).
pub(crate) fn host_matches(pattern: &str, host: &str) -> bool {
    if let Some(suffix_with_dot) = pattern.strip_prefix('*') {
        // suffix_with_dot is e.g. ".anthropic.com"
        host.ends_with(suffix_with_dot) && host.len() > suffix_with_dot.len()
    } else {
        pattern == host
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
#[path = "egress_proxy_tests.rs"]
mod tests;
