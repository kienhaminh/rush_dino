use std::{collections::HashMap, sync::Arc, time::Duration};

use chrono::{DateTime, Utc};
use tokio::sync::{mpsc, oneshot, Mutex};
use uuid::Uuid;

use rushdino_agent::{InputRequest, InputRequestPayload, InputRequestResult, InputRequestSpec};
use rushdino_common::{AppError, Result};

const DEFAULT_INPUT_REQUEST_TIMEOUT: Duration = Duration::from_secs(1800);

struct PendingInputRequest {
    request: InputRequest,
    created_at: DateTime<Utc>,
    responder: oneshot::Sender<InputRequestResult>,
}

pub struct InputRequestGate {
    sessions: Mutex<HashMap<String, mpsc::Sender<InputRequest>>>,
    pending: Mutex<HashMap<String, PendingInputRequest>>,
    timeout: Duration,
}

impl InputRequestGate {
    pub fn new() -> Arc<Self> {
        Self::with_timeout(DEFAULT_INPUT_REQUEST_TIMEOUT)
    }

    pub fn with_timeout(timeout: Duration) -> Arc<Self> {
        Arc::new(Self {
            sessions: Mutex::new(HashMap::new()),
            pending: Mutex::new(HashMap::new()),
            timeout,
        })
    }

    pub async fn register_session(&self, session_id: &str) -> mpsc::Receiver<InputRequest> {
        let (tx, rx) = mpsc::channel(64);
        self.sessions.lock().await.insert(session_id.to_owned(), tx);
        rx
    }

    pub async fn unregister_session(&self, session_id: &str) {
        self.sessions.lock().await.remove(session_id);
    }

    pub async fn request_input(
        &self,
        session_id: &str,
        conversation_id: &str,
        run_id: Option<&str>,
        payload: InputRequestPayload,
    ) -> Result<InputRequestResult> {
        let request_id = Uuid::new_v4().to_string();
        let created_at = Utc::now();
        let request = InputRequest {
            request_id: request_id.clone(),
            session_id: session_id.to_owned(),
            conversation_id: conversation_id.to_owned(),
            run_id: run_id.map(ToOwned::to_owned),
            payload,
            created_at: created_at.to_rfc3339(),
        };
        let (response_tx, response_rx) = oneshot::channel();

        self.pending.lock().await.insert(
            request_id.clone(),
            PendingInputRequest {
                request: request.clone(),
                created_at,
                responder: response_tx,
            },
        );

        if let Some(sender) = self.sessions.lock().await.get(session_id).cloned() {
            if sender.send(request).await.is_err() {
                tracing::warn!(
                    session_id = session_id,
                    "failed to deliver input request to live session"
                );
            }
        }

        match tokio::time::timeout(self.timeout, response_rx).await {
            Ok(Ok(result)) => Ok(result),
            Ok(Err(_)) => Err(AppError::Agent(
                "input request failed: response channel dropped".to_owned(),
            )),
            Err(_) => {
                self.pending.lock().await.remove(&request_id);
                Err(AppError::Agent(format!(
                    "input request timed out after {}s",
                    self.timeout.as_secs()
                )))
            }
        }
    }

    pub async fn has_pending(&self, request_id: &str) -> bool {
        self.pending.lock().await.contains_key(request_id)
    }

    pub async fn list_pending(&self) -> Vec<InputRequest> {
        let mut pending = self
            .pending
            .lock()
            .await
            .values()
            .map(|entry| (entry.created_at, entry.request.clone()))
            .collect::<Vec<_>>();
        pending.sort_by(|a, b| b.0.cmp(&a.0));
        pending.into_iter().map(|(_, request)| request).collect()
    }

    pub async fn list_pending_for_conversation(&self, conversation_id: &str) -> Vec<InputRequest> {
        let mut pending = self
            .pending
            .lock()
            .await
            .values()
            .filter(|entry| entry.request.conversation_id == conversation_id)
            .map(|entry| (entry.created_at, entry.request.clone()))
            .collect::<Vec<_>>();
        pending.sort_by(|a, b| a.0.cmp(&b.0));
        pending.into_iter().map(|(_, request)| request).collect()
    }

    pub async fn find_pending_for_run(&self, run_id: &str) -> Option<InputRequest> {
        self.pending
            .lock()
            .await
            .values()
            .find(|entry| entry.request.run_id.as_deref() == Some(run_id))
            .map(|entry| entry.request.clone())
    }

    /// Peek at the spec for a pending request without removing or resolving it.
    /// Returns `None` if the request has already been resolved or does not exist.
    pub async fn get_spec(&self, request_id: &str) -> Option<InputRequestSpec> {
        self.pending
            .lock()
            .await
            .get(request_id)
            .map(|entry| entry.request.payload.spec.clone())
    }

    pub async fn resolve(
        &self,
        request_id: &str,
        result: InputRequestResult,
    ) -> Result<InputRequest> {
        let mut pending = self.pending.lock().await;
        let Some(entry) = pending.remove(request_id) else {
            return Err(AppError::NotFound(format!(
                "input request '{request_id}' not found"
            )));
        };
        let request = entry.request.clone();
        let _ = entry.responder.send(result);
        Ok(request)
    }
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use serde_json::json;

    use rushdino_agent::{
        InputFieldOption, InputFieldSpec, InputFieldType, InputRequestKind, InputRequestPayload,
        InputRequestResult, InputRequestSpec,
    };

    use super::InputRequestGate;

    fn sample_spec() -> InputRequestSpec {
        InputRequestSpec {
            kind: InputRequestKind::Question,
            title: "Project details".to_owned(),
            description: Some("Tell me about the target".to_owned()),
            submit_label: None,
            cancel_label: None,
            fields: vec![InputFieldSpec {
                name: "project_name".to_owned(),
                label: "Project name".to_owned(),
                description: Some("Used in the final summary".to_owned()),
                field_type: InputFieldType::Select,
                required: true,
                placeholder: None,
                default_value: None,
                min: None,
                max: None,
                min_length: Some(2),
                max_length: Some(40),
                options: vec![
                    InputFieldOption {
                        label: "RushDino".to_owned(),
                        value: "rushdino".to_owned(),
                    },
                    InputFieldOption {
                        label: "Gateway".to_owned(),
                        value: "gateway".to_owned(),
                    },
                ],
                secret: false,
            }],
        }
    }

    #[tokio::test]
    async fn request_is_delivered_and_resolves_with_submitted_values() {
        let gate = InputRequestGate::with_timeout(Duration::from_secs(1));
        let mut rx = gate.register_session("session-1").await;

        let gate_clone = gate.clone();
        let waiter = tokio::spawn(async move {
            gate_clone
                .request_input(
                    "session-1",
                    "conv-1",
                    Some("run-1"),
                    InputRequestPayload {
                        spec: sample_spec(),
                    },
                )
                .await
        });

        let request = rx.recv().await.expect("request should be emitted");
        assert_eq!(request.session_id, "session-1");
        assert_eq!(request.conversation_id, "conv-1");
        assert_eq!(request.run_id.as_deref(), Some("run-1"));
        assert_eq!(request.payload.spec.fields.len(), 1);

        let resolution = InputRequestResult::submitted(json!({
            "project_name": "rushdino"
        }));
        let resolved = gate
            .resolve(&request.request_id, resolution.clone())
            .await
            .expect("request should resolve");
        assert_eq!(resolved.request_id, request.request_id);

        let result = waiter
            .await
            .expect("waiter should complete")
            .expect("request should succeed");
        assert_eq!(result, resolution);
    }

    #[tokio::test]
    async fn request_survives_session_unregister_for_reload_recovery() {
        let gate = InputRequestGate::with_timeout(Duration::from_secs(1));
        let mut rx = gate.register_session("session-1").await;

        let gate_clone = gate.clone();
        let waiter = tokio::spawn(async move {
            gate_clone
                .request_input(
                    "session-1",
                    "conv-1",
                    Some("run-1"),
                    InputRequestPayload {
                        spec: sample_spec(),
                    },
                )
                .await
        });

        let request = rx.recv().await.expect("request should be emitted");
        gate.unregister_session("session-1").await;

        assert!(gate.has_pending(&request.request_id).await);

        let result = InputRequestResult::cancelled();
        gate.resolve(&request.request_id, result.clone())
            .await
            .expect("reload recovery should still resolve");

        let waited = waiter
            .await
            .expect("waiter should complete")
            .expect("request should succeed");
        assert_eq!(waited, result);
    }

    #[tokio::test]
    async fn request_times_out_when_unanswered() {
        let gate = InputRequestGate::with_timeout(Duration::from_millis(50));

        let result = gate
            .request_input(
                "session-1",
                "conv-1",
                Some("run-1"),
                InputRequestPayload {
                    spec: sample_spec(),
                },
            )
            .await;

        assert!(result.is_err());
    }
}
