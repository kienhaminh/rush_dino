// Approval gate for pending network access requests in the agent sandbox.
//
// When the `EgressProxy` returns `EgressDecision::PendingApproval`, the agent
// execution must pause and wait for a human decision. The `ApprovalGate` manages
// this lifecycle: it stores in-flight requests keyed by a UUID, exposes async
// futures that the agent task can `.await`, and provides `approve`/`deny` methods
// for the user-facing API layer to resolve those futures.
//
// Each request uses a `tokio::sync::oneshot` channel: the agent task holds the
// receiver end and the API handler holds (via the gate) the sender end.

use std::{collections::HashMap, sync::Arc};

use tokio::sync::{oneshot, Mutex};
use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/// Snapshot of a blocked request waiting for human approval.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PendingRequest {
    /// Unique identifier for this approval request (UUID recommended).
    pub request_id: String,
    /// ID of the agent session that issued the request.
    pub session_id: String,
    /// Target hostname the agent attempted to reach.
    pub host: String,
    /// TCP port the agent targeted.
    pub port: u16,
    /// HTTP method in uppercase (e.g. `"GET"`, `"POST"`).
    pub method: String,
    /// URL path component (e.g. `"/v1/chat/completions"`).
    pub path: String,
    /// Wall-clock time the request was submitted for approval.
    pub created_at: chrono::DateTime<chrono::Utc>,
}

/// The outcome of a user decision (or absence of one) on a pending request.
#[derive(Debug, Clone, PartialEq)]
pub enum ApprovalDecision {
    /// User explicitly allowed the request.
    Approved,
    /// User explicitly denied the request, or the sender was dropped.
    Denied,
    /// No decision was made before the configured deadline elapsed.
    TimedOut,
}

// ---------------------------------------------------------------------------
// ApprovalGate
// ---------------------------------------------------------------------------

/// Thread-safe gate that coordinates approval hand-offs between agent tasks
/// and the user-facing API.
///
/// Construct via [`ApprovalGate::new`], which wraps `Self` in an `Arc` so it
/// can be cloned cheaply and shared across Axum state, agent executors, etc.
pub struct ApprovalGate {
    /// Live map from `request_id` → the oneshot sender used to resolve the
    /// agent task that is awaiting the decision.
    pending: Mutex<HashMap<String, oneshot::Sender<ApprovalDecision>>>,
}

impl ApprovalGate {
    /// Create a new, empty gate wrapped in an `Arc`.
    pub fn new() -> Arc<Self> {
        Arc::new(Self {
            pending: Mutex::new(HashMap::new()),
        })
    }

    /// Pause execution and wait for a human decision on `request`.
    ///
    /// The caller registers the request in the pending map, then awaits a
    /// oneshot channel.  If no decision arrives within `timeout_secs` the
    /// entry is cleaned up and [`ApprovalDecision::TimedOut`] is returned.
    ///
    /// # Cancellation safety
    /// If the future is dropped before it completes, the pending entry remains
    /// in the map until `timeout_secs` elapses and the internal cleanup runs
    /// (or until an explicit `approve`/`deny` call resolves it harmlessly).
    pub async fn request_approval(
        &self,
        request: PendingRequest,
        timeout_secs: u64,
    ) -> ApprovalDecision {
        let (tx, rx) = oneshot::channel();

        // Register the sender before yielding to the executor.
        {
            let mut pending = self.pending.lock().await;
            pending.insert(request.request_id.clone(), tx);
        }

        // Race the oneshot against the deadline.
        match tokio::time::timeout(
            std::time::Duration::from_secs(timeout_secs),
            rx,
        )
        .await
        {
            // A decision arrived in time.
            Ok(Ok(decision)) => decision,
            // Sender was dropped without sending — treat as Denied.
            Ok(Err(_)) => ApprovalDecision::Denied,
            // Deadline exceeded — remove the stale entry and report TimedOut.
            Err(_timeout) => {
                let mut pending = self.pending.lock().await;
                pending.remove(&request.request_id);
                ApprovalDecision::TimedOut
            }
        }
    }

    /// Resolve a pending request with an `Approved` decision.
    ///
    /// Returns `true` if the request was found and signalled, `false` if no
    /// matching `request_id` exists (already resolved or never registered).
    pub async fn approve(&self, request_id: &str) -> bool {
        let mut pending = self.pending.lock().await;
        if let Some(tx) = pending.remove(request_id) {
            // Ignore the error: the receiver may have been dropped (timeout).
            let _ = tx.send(ApprovalDecision::Approved);
            true
        } else {
            false
        }
    }

    /// Resolve a pending request with a `Denied` decision.
    ///
    /// Returns `true` if the request was found and signalled, `false` otherwise.
    pub async fn deny(&self, request_id: &str) -> bool {
        let mut pending = self.pending.lock().await;
        if let Some(tx) = pending.remove(request_id) {
            let _ = tx.send(ApprovalDecision::Denied);
            true
        } else {
            false
        }
    }

    /// Return the IDs of all currently pending requests.
    ///
    /// Intended for display in admin/approval UIs; the order is unspecified.
    pub async fn list_pending(&self) -> Vec<String> {
        let pending = self.pending.lock().await;
        pending.keys().cloned().collect()
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    /// Build a minimal `PendingRequest` with a given `request_id`.
    fn make_request(request_id: &str) -> PendingRequest {
        PendingRequest {
            request_id: request_id.to_string(),
            session_id: "session-1".to_string(),
            host: "example.com".to_string(),
            port: 443,
            method: "GET".to_string(),
            path: "/".to_string(),
            created_at: chrono::Utc::now(),
        }
    }

    // -----------------------------------------------------------------------
    // approve() resolves the awaiting future with Approved
    // -----------------------------------------------------------------------

    #[tokio::test]
    async fn test_approve_resolves_with_approved() {
        let gate = ApprovalGate::new();
        let gate_clone = Arc::clone(&gate);

        // Spawn the agent side: submit and await approval.
        let agent: tokio::task::JoinHandle<ApprovalDecision> = tokio::spawn(async move {
            gate_clone
                .request_approval(make_request("req-001"), 5)
                .await
        });

        // Give the spawned task a moment to register in the map.
        tokio::time::sleep(std::time::Duration::from_millis(10)).await;

        // Simulate user clicking "Approve" in the UI.
        let found = gate.approve("req-001").await;
        assert!(found, "request should have been found in pending map");

        let decision = agent.await.expect("agent task panicked");
        assert_eq!(decision, ApprovalDecision::Approved);
    }

    // -----------------------------------------------------------------------
    // deny() resolves the awaiting future with Denied
    // -----------------------------------------------------------------------

    #[tokio::test]
    async fn test_deny_resolves_with_denied() {
        let gate = ApprovalGate::new();
        let gate_clone = Arc::clone(&gate);

        let agent: tokio::task::JoinHandle<ApprovalDecision> = tokio::spawn(async move {
            gate_clone
                .request_approval(make_request("req-002"), 5)
                .await
        });

        tokio::time::sleep(std::time::Duration::from_millis(10)).await;

        let found = gate.deny("req-002").await;
        assert!(found, "request should have been found in pending map");

        let decision = agent.await.expect("agent task panicked");
        assert_eq!(decision, ApprovalDecision::Denied);
    }

    // -----------------------------------------------------------------------
    // Timeout returns TimedOut and cleans up the map
    // -----------------------------------------------------------------------

    #[tokio::test]
    async fn test_timeout_returns_timed_out() {
        let gate = ApprovalGate::new();

        // Use a 1-second timeout; no approve/deny will be called.
        let decision = gate
            .request_approval(make_request("req-003"), 1)
            .await;

        assert_eq!(decision, ApprovalDecision::TimedOut);

        // The entry must have been removed from the map on timeout.
        let pending = gate.list_pending().await;
        assert!(
            !pending.contains(&"req-003".to_string()),
            "timed-out entry should be cleaned up"
        );
    }

    // -----------------------------------------------------------------------
    // list_pending() reflects the current state of the map
    // -----------------------------------------------------------------------

    #[tokio::test]
    async fn test_list_pending_shows_request_id() {
        let gate = ApprovalGate::new();
        let gate_clone = Arc::clone(&gate);

        // Submit a request but do not resolve it yet.
        let _agent: tokio::task::JoinHandle<ApprovalDecision> = tokio::spawn(async move {
            gate_clone
                .request_approval(make_request("req-004"), 10)
                .await
        });

        // Brief sleep so the spawned task registers itself before we inspect.
        tokio::time::sleep(std::time::Duration::from_millis(10)).await;

        let pending = gate.list_pending().await;
        assert!(
            pending.contains(&"req-004".to_string()),
            "req-004 should appear in the pending list; got: {:?}",
            pending
        );
    }

    // -----------------------------------------------------------------------
    // approve/deny on unknown ID returns false
    // -----------------------------------------------------------------------

    #[tokio::test]
    async fn test_approve_unknown_id_returns_false() {
        let gate = ApprovalGate::new();
        assert!(!gate.approve("nonexistent").await);
    }

    #[tokio::test]
    async fn test_deny_unknown_id_returns_false() {
        let gate = ApprovalGate::new();
        assert!(!gate.deny("nonexistent").await);
    }
}
