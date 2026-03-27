use std::{collections::HashMap, sync::Arc, time::Duration};

use chrono::{DateTime, Utc};
use serde::Serialize;
use serde_json::Value;
use tokio::sync::{mpsc, oneshot, Mutex};
use uuid::Uuid;

use rushdino_common::{AppError, Result};

const DEFAULT_APPROVAL_TIMEOUT: Duration = Duration::from_secs(120);

#[derive(Debug, Clone, Serialize)]
pub struct ApprovalRequest {
    pub request_id: String,
    pub session_id: String,
    pub conversation_id: String,
    pub run_id: Option<String>,
    pub tool: String,
    pub args: Value,
}

struct PendingApproval {
    owner_session_id: String,
    request: ApprovalRequest,
    created_at: DateTime<Utc>,
    responder: oneshot::Sender<bool>,
}

pub struct ApprovalGate {
    sessions: Mutex<HashMap<String, mpsc::Sender<ApprovalRequest>>>,
    pending: Mutex<HashMap<String, PendingApproval>>,
    timeout: Duration,
}

impl ApprovalGate {
    pub fn new() -> Arc<Self> {
        Self::with_timeout(DEFAULT_APPROVAL_TIMEOUT)
    }

    pub fn with_timeout(timeout: Duration) -> Arc<Self> {
        Arc::new(Self {
            sessions: Mutex::new(HashMap::new()),
            pending: Mutex::new(HashMap::new()),
            timeout,
        })
    }

    pub async fn register_session(&self, session_id: &str) -> mpsc::Receiver<ApprovalRequest> {
        let (tx, rx) = mpsc::channel(64);
        self.sessions.lock().await.insert(session_id.to_owned(), tx);
        rx
    }

    pub async fn unregister_session(&self, session_id: &str) {
        self.sessions.lock().await.remove(session_id);

        let request_ids = {
            let pending = self.pending.lock().await;
            pending
                .iter()
                .filter(|(_, entry)| entry.owner_session_id == session_id)
                .map(|(request_id, _)| request_id.clone())
                .collect::<Vec<_>>()
        };

        let mut pending = self.pending.lock().await;
        for request_id in request_ids {
            if let Some(entry) = pending.remove(&request_id) {
                let _ = entry.responder.send(false);
            }
        }
    }

    pub async fn request_approval(
        &self,
        session_id: &str,
        conversation_id: &str,
        run_id: Option<&str>,
        tool: &str,
        args: Value,
    ) -> Result<()> {
        let sender = self
            .sessions
            .lock()
            .await
            .get(session_id)
            .cloned()
            .ok_or_else(|| {
                AppError::Agent(format!(
                    "tool approval blocked: no active session for {session_id}"
                ))
            })?;

        let request_id = Uuid::new_v4().to_string();
        let (response_tx, response_rx) = oneshot::channel::<bool>();
        let request = ApprovalRequest {
            request_id: request_id.clone(),
            session_id: session_id.to_owned(),
            conversation_id: conversation_id.to_owned(),
            run_id: run_id.map(ToOwned::to_owned),
            tool: tool.to_owned(),
            args,
        };
        self.pending.lock().await.insert(
            request_id.clone(),
            PendingApproval {
                owner_session_id: session_id.to_owned(),
                request: request.clone(),
                created_at: Utc::now(),
                responder: response_tx,
            },
        );

        if sender.send(request).await.is_err() {
            self.pending.lock().await.remove(&request_id);
            return Err(AppError::Agent(
                "tool approval blocked: websocket session unavailable".to_owned(),
            ));
        }

        match tokio::time::timeout(self.timeout, response_rx).await {
            Ok(Ok(true)) => Ok(()),
            Ok(Ok(false)) => Err(AppError::Agent(format!("tool '{tool}' denied by user"))),
            Ok(Err(_)) => Err(AppError::Agent(
                "tool approval blocked: approval channel dropped".to_owned(),
            )),
            Err(_) => {
                self.pending.lock().await.remove(&request_id);
                Err(AppError::Agent(format!(
                    "tool approval timed out after {}s",
                    self.timeout.as_secs()
                )))
            }
        }
    }

    /// Returns `true` if a pending approval with the given `request_id` exists.
    pub async fn has_pending(&self, request_id: &str) -> bool {
        self.pending.lock().await.contains_key(request_id)
    }

    pub async fn list_pending(&self) -> Vec<ApprovalRequest> {
        let mut requests = self
            .pending
            .lock()
            .await
            .values()
            .map(|entry| (entry.created_at, entry.request.clone()))
            .collect::<Vec<_>>();
        requests.sort_by(|a, b| b.0.cmp(&a.0));
        requests.into_iter().map(|(_, request)| request).collect()
    }

    pub async fn find_pending_for_run(&self, run_id: &str) -> Option<ApprovalRequest> {
        self.pending
            .lock()
            .await
            .values()
            .find(|entry| entry.request.run_id.as_deref() == Some(run_id))
            .map(|entry| entry.request.clone())
    }

    pub async fn resolve(
        &self,
        session_id: &str,
        request_id: &str,
        approved: bool,
    ) -> Result<ApprovalRequest> {
        let mut pending = self.pending.lock().await;
        let Some(owner) = pending
            .get(request_id)
            .map(|entry| entry.owner_session_id.clone())
        else {
            return Err(AppError::NotFound(format!(
                "approval request '{request_id}' not found"
            )));
        };

        if owner != session_id {
            return Err(AppError::Agent(format!(
                "approval request '{request_id}' is not owned by session {session_id}"
            )));
        }

        let Some(entry) = pending.remove(request_id) else {
            return Err(AppError::NotFound(format!(
                "approval request '{request_id}' not found"
            )));
        };
        let request = entry.request.clone();
        let _ = entry.responder.send(approved);
        Ok(request)
    }
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use serde_json::json;

    use super::ApprovalGate;

    #[tokio::test]
    async fn request_is_delivered_only_to_owner_session() {
        let gate = ApprovalGate::with_timeout(Duration::from_secs(1));
        let mut rx_owner = gate.register_session("owner").await;
        let mut rx_other = gate.register_session("other").await;

        let gate_clone = gate.clone();
        let approval_task = tokio::spawn(async move {
            gate_clone
                .request_approval(
                    "owner",
                    "conv-1",
                    Some("run-1"),
                    "bash",
                    json!({"command": "rm -rf /tmp/x"}),
                )
                .await
        });

        let request = rx_owner.recv().await.expect("owner should receive request");
        assert_eq!(request.session_id, "owner");
        assert_eq!(request.run_id.as_deref(), Some("run-1"));
        assert!(
            tokio::time::timeout(Duration::from_millis(100), rx_other.recv())
                .await
                .is_err()
        );

        gate.resolve("owner", &request.request_id, true)
            .await
            .expect("owner resolves");
        assert!(approval_task.await.expect("task should complete").is_ok());
    }

    #[tokio::test]
    async fn wrong_owner_cannot_resolve_request() {
        let gate = ApprovalGate::with_timeout(Duration::from_secs(1));
        let mut rx_owner = gate.register_session("owner").await;
        gate.register_session("other").await;

        let gate_clone = gate.clone();
        let approval_task = tokio::spawn(async move {
            gate_clone
                .request_approval(
                    "owner",
                    "conv-2",
                    Some("run-2"),
                    "bash",
                    json!({"command": "sudo reboot"}),
                )
                .await
        });

        let request = rx_owner.recv().await.expect("owner should receive request");
        assert!(gate
            .resolve("other", &request.request_id, true)
            .await
            .is_err());
        gate.resolve("owner", &request.request_id, true)
            .await
            .expect("owner resolves");
        assert!(approval_task.await.expect("task should complete").is_ok());
    }

    #[tokio::test]
    async fn request_times_out_when_unanswered() {
        let gate = ApprovalGate::with_timeout(Duration::from_millis(50));
        let _rx_owner = gate.register_session("owner").await;

        let result = gate
            .request_approval(
                "owner",
                "conv-3",
                Some("run-3"),
                "bash",
                json!({"command": "rm -rf /"}),
            )
            .await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn unregister_session_denies_pending_requests() {
        let gate = ApprovalGate::with_timeout(Duration::from_secs(1));
        let mut rx_owner = gate.register_session("owner").await;

        let gate_clone = gate.clone();
        let approval_task = tokio::spawn(async move {
            gate_clone
                .request_approval(
                    "owner",
                    "conv-4",
                    Some("run-4"),
                    "bash",
                    json!({"command": "sudo rm -rf /tmp/x"}),
                )
                .await
        });

        let _request = rx_owner.recv().await.expect("owner should receive request");
        gate.unregister_session("owner").await;
        assert!(approval_task.await.expect("task should complete").is_err());
    }
}
