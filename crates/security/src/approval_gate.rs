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
#[path = "approval_gate_tests.rs"]
mod tests;
