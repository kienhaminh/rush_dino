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
fn host_matches(pattern: &str, host: &str) -> bool {
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
mod tests {
    use super::*;
    use crate::policy::types::{BlockBehavior, DefaultAction, NetworkPolicy, NetworkRule};

    fn make_rule(host: &str, port: u16, methods: &[&str], paths: &[&str]) -> NetworkRule {
        NetworkRule {
            host: host.to_string(),
            port,
            methods: methods.iter().map(|s| s.to_string()).collect(),
            paths: paths.iter().map(|s| s.to_string()).collect(),
        }
    }

    fn make_request(host: &str, port: u16, method: &str, path: &str) -> EgressRequest {
        EgressRequest {
            host: host.to_string(),
            port,
            method: method.to_string(),
            path: path.to_string(),
        }
    }

    // -----------------------------------------------------------------------
    // Allow rules
    // -----------------------------------------------------------------------

    #[test]
    fn test_allow_exact_host_and_path() {
        let policy = NetworkPolicy {
            default: DefaultAction::Deny,
            on_block: BlockBehavior::Deny,
            allow: vec![make_rule("api.anthropic.com", 443, &["POST"], &["/v1/"])],
        };
        let proxy = EgressProxy::new(policy);
        let req = make_request("api.anthropic.com", 443, "POST", "/v1/chat/completions");
        assert_eq!(proxy.check(&req), EgressDecision::Allow);
    }

    #[test]
    fn test_deny_when_host_not_in_allow_list() {
        let policy = NetworkPolicy {
            default: DefaultAction::Deny,
            on_block: BlockBehavior::Deny,
            allow: vec![make_rule("api.anthropic.com", 443, &[], &[])],
        };
        let proxy = EgressProxy::new(policy);
        let req = make_request("evil.example.com", 443, "GET", "/");
        assert_eq!(
            proxy.check(&req),
            EgressDecision::Deny("no matching policy rule".to_string())
        );
    }

    // -----------------------------------------------------------------------
    // on_block: Prompt → PendingApproval
    // -----------------------------------------------------------------------

    #[test]
    fn test_pending_approval_when_on_block_is_prompt() {
        let policy = NetworkPolicy {
            default: DefaultAction::Deny,
            on_block: BlockBehavior::Prompt,
            allow: vec![make_rule("api.anthropic.com", 443, &[], &[])],
        };
        let proxy = EgressProxy::new(policy);
        let req = make_request("unlisted.example.com", 80, "GET", "/data");
        assert_eq!(proxy.check(&req), EgressDecision::PendingApproval);
    }

    // -----------------------------------------------------------------------
    // Glob host matching
    // -----------------------------------------------------------------------

    #[test]
    fn test_glob_matches_subdomain() {
        assert!(host_matches("*.anthropic.com", "api.anthropic.com"));
        assert!(host_matches("*.anthropic.com", "beta.anthropic.com"));
    }

    #[test]
    fn test_glob_does_not_match_apex_domain() {
        // The wildcard must cover at least one DNS label.
        assert!(!host_matches("*.anthropic.com", "anthropic.com"));
    }

    #[test]
    fn test_glob_does_not_match_unrelated_domain() {
        assert!(!host_matches("*.anthropic.com", "api.openai.com"));
    }

    #[test]
    fn test_exact_match_only_matches_exact() {
        assert!(host_matches("api.anthropic.com", "api.anthropic.com"));
        assert!(!host_matches("api.anthropic.com", "beta.anthropic.com"));
    }

    #[test]
    fn test_glob_rule_allows_matching_subdomain() {
        let policy = NetworkPolicy {
            default: DefaultAction::Deny,
            on_block: BlockBehavior::Deny,
            allow: vec![make_rule("*.anthropic.com", 443, &[], &[])],
        };
        let proxy = EgressProxy::new(policy);

        // Subdomain should be allowed.
        let allowed = make_request("api.anthropic.com", 443, "POST", "/v1/messages");
        assert_eq!(proxy.check(&allowed), EgressDecision::Allow);

        // Apex domain must not be allowed by the wildcard rule.
        let denied = make_request("anthropic.com", 443, "GET", "/");
        assert_eq!(
            proxy.check(&denied),
            EgressDecision::Deny("no matching policy rule".to_string())
        );
    }

    // -----------------------------------------------------------------------
    // update_policy
    // -----------------------------------------------------------------------

    #[test]
    fn test_update_policy_changes_behavior() {
        // Start with a permissive policy.
        let permissive = NetworkPolicy {
            default: DefaultAction::Allow,
            on_block: BlockBehavior::Deny,
            allow: vec![],
        };
        let proxy = EgressProxy::new(permissive);
        let req = make_request("example.com", 80, "GET", "/");
        assert_eq!(proxy.check(&req), EgressDecision::Allow);

        // Switch to a restrictive policy.
        let restrictive = NetworkPolicy {
            default: DefaultAction::Deny,
            on_block: BlockBehavior::Deny,
            allow: vec![],
        };
        proxy.update_policy(restrictive);
        assert_eq!(
            proxy.check(&req),
            EgressDecision::Deny("no matching policy rule".to_string())
        );
    }

    #[test]
    fn test_update_policy_reflected_in_current_policy() {
        let initial = NetworkPolicy {
            default: DefaultAction::Allow,
            on_block: BlockBehavior::Deny,
            allow: vec![],
        };
        let proxy = EgressProxy::new(initial);
        assert_eq!(proxy.current_policy().default, DefaultAction::Allow);

        let updated = NetworkPolicy {
            default: DefaultAction::Deny,
            on_block: BlockBehavior::HardStop,
            allow: vec![],
        };
        proxy.update_policy(updated);
        let current = proxy.current_policy();
        assert_eq!(current.default, DefaultAction::Deny);
        assert_eq!(current.on_block, BlockBehavior::HardStop);
    }

    // -----------------------------------------------------------------------
    // HardStop
    // -----------------------------------------------------------------------

    #[test]
    fn test_hard_stop_returns_deny_with_prefix() {
        let policy = NetworkPolicy {
            default: DefaultAction::Deny,
            on_block: BlockBehavior::HardStop,
            allow: vec![],
        };
        let proxy = EgressProxy::new(policy);
        let req = make_request("example.com", 443, "GET", "/");
        assert_eq!(
            proxy.check(&req),
            EgressDecision::Deny("hard-stop: no matching policy rule".to_string())
        );
    }

    // -----------------------------------------------------------------------
    // Port + method filtering
    // -----------------------------------------------------------------------

    #[test]
    fn test_wrong_port_is_not_matched() {
        let policy = NetworkPolicy {
            default: DefaultAction::Deny,
            on_block: BlockBehavior::Deny,
            allow: vec![make_rule("api.example.com", 443, &[], &[])],
        };
        let proxy = EgressProxy::new(policy);
        let req = make_request("api.example.com", 80, "GET", "/");
        assert_eq!(
            proxy.check(&req),
            EgressDecision::Deny("no matching policy rule".to_string())
        );
    }

    #[test]
    fn test_port_zero_in_rule_matches_any_port() {
        let policy = NetworkPolicy {
            default: DefaultAction::Deny,
            on_block: BlockBehavior::Deny,
            allow: vec![make_rule("api.example.com", 0, &[], &[])],
        };
        let proxy = EgressProxy::new(policy);
        assert_eq!(
            proxy.check(&make_request("api.example.com", 80, "GET", "/")),
            EgressDecision::Allow
        );
        assert_eq!(
            proxy.check(&make_request("api.example.com", 443, "POST", "/")),
            EgressDecision::Allow
        );
    }

    #[test]
    fn test_wrong_method_is_not_matched() {
        let policy = NetworkPolicy {
            default: DefaultAction::Deny,
            on_block: BlockBehavior::Deny,
            allow: vec![make_rule("api.example.com", 443, &["GET"], &[])],
        };
        let proxy = EgressProxy::new(policy);
        let req = make_request("api.example.com", 443, "POST", "/");
        assert_eq!(
            proxy.check(&req),
            EgressDecision::Deny("no matching policy rule".to_string())
        );
    }

    #[test]
    fn test_default_allow_with_no_rules() {
        let policy = NetworkPolicy {
            default: DefaultAction::Allow,
            on_block: BlockBehavior::Deny,
            allow: vec![],
        };
        let proxy = EgressProxy::new(policy);
        let req = make_request("anywhere.example.com", 9000, "DELETE", "/resource");
        assert_eq!(proxy.check(&req), EgressDecision::Allow);
    }
}
