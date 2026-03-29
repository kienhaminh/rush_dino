use super::*;
use std::sync::Arc;

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
