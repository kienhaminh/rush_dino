use std::{
    collections::HashMap,
    sync::Arc,
    time::{Duration, Instant},
};

use arc_swap::ArcSwapOption;
use tokio::{
    sync::{mpsc, Mutex},
    time::sleep,
};

use rushdino_agent::AgentEngine;
use rushdino_common::{AppError, Result};

use crate::{
    adapter::ChannelAdapter, message::OutgoingMessage, session::SessionManager,
    state::GatewayStateStore,
};

const DELIVERY_QUEUE_BUFFER: usize = 128;

#[derive(Debug, Clone)]
pub enum DeliveryJob {
    Final {
        channel_id: String,
        recipient: String,
        gateway_session_id: String,
        run_id: String,
        message: OutgoingMessage,
    },
    PreviewUpdate {
        channel_id: String,
        recipient: String,
        gateway_session_id: String,
        run_id: String,
        text: String,
    },
    PreviewFinalize {
        channel_id: String,
        recipient: String,
        gateway_session_id: String,
        run_id: String,
    },
    PreviewClear {
        channel_id: String,
        recipient: String,
        gateway_session_id: String,
        run_id: String,
    },
    SetTyping {
        channel_id: String,
        recipient: String,
        gateway_session_id: String,
    },
}

impl DeliveryJob {
    fn channel_id(&self) -> &str {
        match self {
            Self::Final { channel_id, .. }
            | Self::PreviewUpdate { channel_id, .. }
            | Self::PreviewFinalize { channel_id, .. }
            | Self::PreviewClear { channel_id, .. }
            | Self::SetTyping { channel_id, .. } => channel_id,
        }
    }
}

#[derive(Clone)]
pub struct GatewayDeliveryHandle {
    inner: Arc<GatewayDeliveryInner>,
}

struct GatewayDeliveryInner {
    queues: Mutex<HashMap<String, mpsc::Sender<DeliveryJob>>>,
    engine: Arc<ArcSwapOption<AgentEngine>>,
    sessions: Arc<SessionManager>,
    state: Arc<GatewayStateStore>,
}

impl GatewayDeliveryHandle {
    pub async fn enqueue(&self, job: DeliveryJob) -> Result<()> {
        let queue = self
            .inner
            .queues
            .lock()
            .await
            .get(job.channel_id())
            .cloned()
            .ok_or_else(|| {
                AppError::Validation(format!(
                    "gateway delivery queue not available for channel '{}'",
                    job.channel_id()
                ))
            })?;
        queue
            .send(job)
            .await
            .map_err(|_| AppError::Agent("gateway delivery queue closed unexpectedly".to_owned()))
    }

    pub fn new(
        engine: Arc<ArcSwapOption<AgentEngine>>,
        sessions: Arc<SessionManager>,
        state: Arc<GatewayStateStore>,
    ) -> Self {
        Self {
            inner: Arc::new(GatewayDeliveryInner {
                queues: Mutex::new(HashMap::new()),
                engine,
                sessions,
                state,
            }),
        }
    }

    pub async fn register_adapter(&self, channel_id: String, adapter: Arc<dyn ChannelAdapter>) {
        let (tx, rx) = mpsc::channel(DELIVERY_QUEUE_BUFFER);
        let worker = DeliveryWorker::new(
            channel_id.clone(),
            adapter,
            self.inner.engine.clone(),
            self.inner.sessions.clone(),
            self.inner.state.clone(),
        );
        tokio::spawn(async move {
            worker.run(rx).await;
        });
        self.inner.queues.lock().await.insert(channel_id, tx);
    }

    pub async fn unregister_adapter(&self, channel_id: &str) {
        self.inner.queues.lock().await.remove(channel_id);
    }
}

struct DeliveryWorker {
    channel_id: String,
    adapter: Arc<dyn ChannelAdapter>,
    engine: Arc<ArcSwapOption<AgentEngine>>,
    sessions: Arc<SessionManager>,
    state: Arc<GatewayStateStore>,
    policy: DeliveryPolicy,
}

impl DeliveryWorker {
    fn new(
        channel_id: String,
        adapter: Arc<dyn ChannelAdapter>,
        engine: Arc<ArcSwapOption<AgentEngine>>,
        sessions: Arc<SessionManager>,
        state: Arc<GatewayStateStore>,
    ) -> Self {
        Self {
            policy: DeliveryPolicy::for_channel(&channel_id),
            channel_id,
            adapter,
            engine,
            sessions,
            state,
        }
    }

    async fn run(self, mut rx: mpsc::Receiver<DeliveryJob>) {
        let lifecycle = self.state.reporter(self.channel_id.clone());
        let mut last_sent_at: Option<Instant> = None;

        while let Some(job) = rx.recv().await {
            self.process_job(&lifecycle, &mut last_sent_at, job).await;
        }
    }

    async fn process_job(
        &self,
        lifecycle: &crate::state::AdapterLifecycleHandle,
        last_sent_at: &mut Option<Instant>,
        job: DeliveryJob,
    ) {
        match job {
            DeliveryJob::Final {
                recipient,
                gateway_session_id,
                run_id,
                message,
                ..
            } => {
                self.process_final_job(
                    lifecycle,
                    last_sent_at,
                    &recipient,
                    &gateway_session_id,
                    &run_id,
                    message,
                )
                .await;
            }
            DeliveryJob::PreviewUpdate {
                recipient,
                run_id,
                text,
                ..
            } => {
                self.process_preview_update(lifecycle, last_sent_at, &recipient, &run_id, &text)
                    .await;
            }
            DeliveryJob::PreviewFinalize {
                recipient,
                gateway_session_id,
                run_id,
                ..
            } => {
                self.process_preview_finalize(
                    lifecycle,
                    last_sent_at,
                    &recipient,
                    &gateway_session_id,
                    &run_id,
                )
                .await;
            }
            DeliveryJob::PreviewClear {
                recipient, run_id, ..
            } => {
                self.process_preview_clear(lifecycle, last_sent_at, &recipient, &run_id)
                    .await;
            }
            DeliveryJob::SetTyping { recipient, .. } => {
                let _ = self.adapter.set_typing(&recipient).await;
            }
        }
    }

    async fn process_final_job(
        &self,
        lifecycle: &crate::state::AdapterLifecycleHandle,
        last_sent_at: &mut Option<Instant>,
        recipient: &str,
        gateway_session_id: &str,
        run_id: &str,
        message: OutgoingMessage,
    ) {
        let preview = self.adapter.preview_delivery(&message);
        self.record_run_event(
            run_id,
            "delivery_started",
            format!(
                "Queued gateway delivery to {} on {}.",
                recipient, self.channel_id
            ),
        )
        .await;
        self.record_native_fallback(run_id, preview.fallback_reason.as_deref())
            .await;

        for attempt in 1..=self.policy.max_attempts {
            self.enforce_rate_limit(last_sent_at).await;

            match self
                .adapter
                .send_message_with_outcome(recipient, message.clone())
                .await
            {
                Ok(outcome) => {
                    if outcome.fallback_reason.as_deref() != preview.fallback_reason.as_deref() {
                        self.record_native_fallback(run_id, outcome.fallback_reason.as_deref())
                            .await;
                    }
                    self.record_run_event(
                        run_id,
                        "delivery_succeeded",
                        format!(
                            "Gateway delivery succeeded on {} after {} attempt(s).",
                            self.channel_id, attempt
                        ),
                    )
                    .await;
                    let _ = self
                        .sessions
                        .note_delivery_result(gateway_session_id, run_id, None)
                        .await;
                    lifecycle.connected().await;
                    return;
                }
                Err(err) => {
                    let message = err.to_string();
                    if attempt < self.policy.max_attempts && is_transient_delivery_error(&message) {
                        self.record_run_event(
                            run_id,
                            "delivery_retry_scheduled",
                            format!(
                                "Gateway delivery attempt {} on {} failed transiently: {}",
                                attempt, self.channel_id, message
                            ),
                        )
                        .await;
                        lifecycle.degraded(message.clone()).await;
                        sleep(self.policy.backoff_for_attempt(attempt)).await;
                        continue;
                    }

                    self.record_run_event(
                        run_id,
                        "delivery_failed",
                        format!(
                            "Gateway delivery failed on {}: {}",
                            self.channel_id, message
                        ),
                    )
                    .await;
                    let _ = self
                        .sessions
                        .note_delivery_result(gateway_session_id, run_id, Some(&message))
                        .await;
                    lifecycle.degraded(message.clone()).await;
                    tracing::error!(
                        "gateway delivery failed on {} for run {}: {}",
                        self.channel_id,
                        run_id,
                        message
                    );
                    return;
                }
            }
        }
    }

    async fn process_preview_update(
        &self,
        lifecycle: &crate::state::AdapterLifecycleHandle,
        last_sent_at: &mut Option<Instant>,
        recipient: &str,
        run_id: &str,
        text: &str,
    ) {
        self.enforce_rate_limit(last_sent_at).await;

        match self.adapter.update_preview(run_id, recipient, text).await {
            Ok(outcome) => {
                if outcome.started {
                    self.record_run_event(
                        run_id,
                        "preview_started",
                        format!(
                            "Gateway preview streaming started for {} on {}.",
                            recipient, self.channel_id
                        ),
                    )
                    .await;
                }
                self.record_run_event(
                    run_id,
                    "preview_updated",
                    format!(
                        "Gateway preview updated for {} on {}.",
                        recipient, self.channel_id
                    ),
                )
                .await;
                self.record_run_event_if_any(run_id, "preview_fallback", outcome.fallback_reason)
                    .await;
                lifecycle.connected().await;
            }
            Err(err) => {
                let message = err.to_string();
                self.record_run_event(
                    run_id,
                    "preview_send_failure",
                    format!(
                        "Gateway preview update failed on {}: {}",
                        self.channel_id, message
                    ),
                )
                .await;
                lifecycle.degraded(message).await;
            }
        }
    }

    async fn process_preview_finalize(
        &self,
        lifecycle: &crate::state::AdapterLifecycleHandle,
        last_sent_at: &mut Option<Instant>,
        recipient: &str,
        gateway_session_id: &str,
        run_id: &str,
    ) {
        self.enforce_rate_limit(last_sent_at).await;

        match self.adapter.finalize_preview(run_id, recipient).await {
            Ok(()) => {
                self.record_run_event(
                    run_id,
                    "preview_finalized",
                    format!(
                        "Gateway preview finalized for {} on {}.",
                        recipient, self.channel_id
                    ),
                )
                .await;
                self.record_run_event(
                    run_id,
                    "delivery_succeeded",
                    format!(
                        "Gateway preview final delivery succeeded on {}.",
                        self.channel_id
                    ),
                )
                .await;
                let _ = self
                    .sessions
                    .note_delivery_result(gateway_session_id, run_id, None)
                    .await;
                lifecycle.connected().await;
            }
            Err(err) => {
                let message = err.to_string();
                self.record_run_event(
                    run_id,
                    "preview_send_failure",
                    format!(
                        "Gateway preview finalization failed on {}: {}",
                        self.channel_id, message
                    ),
                )
                .await;
                let _ = self
                    .sessions
                    .note_delivery_result(gateway_session_id, run_id, Some(&message))
                    .await;
                lifecycle.degraded(message).await;
            }
        }
    }

    async fn process_preview_clear(
        &self,
        lifecycle: &crate::state::AdapterLifecycleHandle,
        last_sent_at: &mut Option<Instant>,
        recipient: &str,
        run_id: &str,
    ) {
        self.enforce_rate_limit(last_sent_at).await;

        match self.adapter.clear_preview(run_id, recipient).await {
            Ok(()) => {
                self.record_run_event(
                    run_id,
                    "preview_cleared",
                    format!(
                        "Gateway preview cleared for {} on {}.",
                        recipient, self.channel_id
                    ),
                )
                .await;
                lifecycle.connected().await;
            }
            Err(err) => {
                let message = err.to_string();
                self.record_run_event(
                    run_id,
                    "preview_send_failure",
                    format!(
                        "Gateway preview clear failed on {}: {}",
                        self.channel_id, message
                    ),
                )
                .await;
                lifecycle.degraded(message).await;
            }
        }
    }

    async fn record_native_fallback(&self, run_id: &str, reason: Option<&str>) {
        let Some(reason) = reason else {
            return;
        };
        self.record_run_event(run_id, "delivery_native_fallback", reason)
            .await;
    }

    async fn record_run_event_if_any(&self, run_id: &str, event: &str, message: Option<String>) {
        let Some(message) = message else {
            return;
        };
        self.record_run_event(run_id, event, message).await;
    }

    async fn record_run_event(&self, run_id: &str, event: &str, message: impl Into<String>) {
        let Some(engine) = self.engine.load_full() else {
            return;
        };
        let _ = engine.record_run_event(run_id, event, message.into()).await;
    }

    async fn enforce_rate_limit(&self, last_sent_at: &mut Option<Instant>) {
        if let Some(previous) = *last_sent_at {
            let elapsed = previous.elapsed();
            if elapsed < self.policy.min_interval {
                sleep(self.policy.min_interval - elapsed).await;
            }
        }
        *last_sent_at = Some(Instant::now());
    }
}

#[derive(Debug, Clone, Copy)]
struct DeliveryPolicy {
    min_interval: Duration,
    max_attempts: usize,
    base_backoff: Duration,
}

impl DeliveryPolicy {
    fn for_channel(channel_id: &str) -> Self {
        match channel_id {
            "telegram" => Self {
                min_interval: Duration::from_millis(250),
                max_attempts: 3,
                base_backoff: Duration::from_millis(400),
            },
            "slack" => Self {
                min_interval: Duration::from_millis(500),
                max_attempts: 3,
                base_backoff: Duration::from_millis(600),
            },
            "discord" => Self {
                min_interval: Duration::from_millis(250),
                max_attempts: 3,
                base_backoff: Duration::from_millis(350),
            },
            "webchat" => Self {
                min_interval: Duration::ZERO,
                max_attempts: 1,
                base_backoff: Duration::ZERO,
            },
            _ => Self {
                min_interval: Duration::from_millis(250),
                max_attempts: 3,
                base_backoff: Duration::from_millis(500),
            },
        }
    }

    fn backoff_for_attempt(&self, attempt: usize) -> Duration {
        if attempt <= 1 {
            return self.base_backoff;
        }

        self.base_backoff
            .saturating_mul(attempt as u32)
            .min(Duration::from_secs(5))
    }
}

fn is_transient_delivery_error(message: &str) -> bool {
    let lower = message.to_ascii_lowercase();
    [
        "timeout",
        "temporar",
        "connection reset",
        "connection refused",
        "broken pipe",
        "rate limit",
        "429",
        "502",
        "503",
        "504",
        "unavailable",
        "network",
        "socket",
        "tls",
        "dns",
        "closed",
    ]
    .iter()
    .any(|needle| lower.contains(needle))
}

#[cfg(test)]
mod tests {
    use super::is_transient_delivery_error;

    #[test]
    fn classifies_transient_delivery_errors() {
        assert!(is_transient_delivery_error(
            "socket timeout talking to provider"
        ));
        assert!(is_transient_delivery_error("429 rate limit from upstream"));
        assert!(!is_transient_delivery_error("invalid recipient id"));
    }
}
