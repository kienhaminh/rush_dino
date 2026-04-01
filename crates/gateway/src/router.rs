use std::{sync::Arc, time::Duration};

use arc_swap::ArcSwapOption;
use tokio::{
    sync::{mpsc, Semaphore},
    task::JoinHandle,
    time::{self, Instant},
};

use crate::{
    dedupe::GatewayMessageDedupe,
    delivery::{DeliveryJob, GatewayDeliveryHandle},
    ingress::{GatewayIngressPolicy, IngressDecision},
    message::IncomingMessage,
    observer::GatewayEventObserver,
    rich_message::markdown_message,
    session::SessionManager,
};
use rushdino_agent::{react_loop::StreamingEvent, AgentEngine};

const PREVIEW_UPDATE_THROTTLE: Duration = Duration::from_millis(1000);

/// Receives `IncomingMessage`s from all channel adapters, resolves or creates
/// a session, forwards the message to the shared runtime, and queues outbound
/// delivery through the gateway-owned delivery workers.
pub struct Router {
    session_manager: Arc<SessionManager>,
    engine: Arc<ArcSwapOption<AgentEngine>>,
    delivery: GatewayDeliveryHandle,
    dedupe: Arc<GatewayMessageDedupe>,
    concurrency: Arc<Semaphore>,
    observer: Option<Arc<dyn GatewayEventObserver>>,
    ingress_policy: Option<Arc<dyn GatewayIngressPolicy>>,
}

impl Router {
    pub fn new(
        session_manager: Arc<SessionManager>,
        engine: Arc<ArcSwapOption<AgentEngine>>,
        delivery: GatewayDeliveryHandle,
        dedupe: Arc<GatewayMessageDedupe>,
        observer: Option<Arc<dyn GatewayEventObserver>>,
        ingress_policy: Option<Arc<dyn GatewayIngressPolicy>>,
        concurrency_limit: usize,
    ) -> Self {
        Self {
            session_manager,
            engine,
            delivery,
            dedupe,
            concurrency: Arc::new(Semaphore::new(concurrency_limit.max(1))),
            observer,
            ingress_policy,
        }
    }

    async fn route(&self, msg: IncomingMessage) {
        if !self.dedupe.should_process(&msg).await {
            tracing::info!(
                "gateway duplicate suppressed for {}/{} ({:?})",
                msg.channel_id,
                msg.sender_id,
                msg.external_message_id
            );
            return;
        }

        if let Some(policy) = self.ingress_policy.as_ref() {
            match policy.evaluate(&msg).await {
                Ok(IngressDecision::Allow) => {}
                Ok(IngressDecision::Block { reason, response }) => {
                    tracing::info!(
                        "gateway ingress blocked for {}/{}: {}",
                        msg.channel_id,
                        msg.actor_id,
                        reason
                    );

                    if let Some(response) = response {
                        if let Err(err) = self
                            .delivery
                            .enqueue(DeliveryJob::Final {
                                channel_id: msg.channel_id.clone(),
                                recipient: response.recipient,
                                gateway_session_id: format!(
                                    "ingress-blocked:{}:{}",
                                    msg.channel_id, msg.actor_id
                                ),
                                run_id: format!("ingress-blocked:{}", msg.actor_id),
                                message: response.message,
                            })
                            .await
                        {
                            tracing::error!(
                                "gateway ingress reply queueing failed for {}/{}: {err}",
                                msg.channel_id,
                                msg.actor_id
                            );
                        }
                    }
                    return;
                }
                Err(err) => {
                    tracing::error!(
                        "gateway ingress policy error for {}/{}: {err}",
                        msg.channel_id,
                        msg.actor_id
                    );
                    return;
                }
            }
        }

        let gateway_session = match self
            .session_manager
            .get_or_create(&msg.channel_id, &msg.sender_id)
            .await
        {
            Ok(record) => record,
            Err(err) => {
                tracing::error!(
                    "session error for {}/{}: {err}",
                    msg.channel_id,
                    msg.sender_id
                );
                return;
            }
        };

        if let Some(observer) = self.observer.as_ref() {
            observer
                .on_user_message(
                    &gateway_session.conversation_id,
                    &gateway_session.channel_id,
                    &msg.text,
                )
                .await;
        }

        let Some(engine) = self.engine.load_full() else {
            let message =
                "Execution is unavailable. Configure a valid default AI profile and try again.";
            tracing::error!(
                "gateway runtime unavailable for session {}",
                gateway_session.id
            );
            let _ = self
                .delivery
                .enqueue(DeliveryJob::Final {
                    channel_id: msg.channel_id.clone(),
                    recipient: msg.sender_id.clone(),
                    gateway_session_id: gateway_session.id.clone(),
                    run_id: format!("runtime-unavailable:{}", gateway_session.id),
                    message: markdown_message(message.to_owned()),
                })
                .await;
            return;
        };

        let streaming_enabled = should_stream_preview(&msg);

        let _ = self
            .delivery
            .enqueue(DeliveryJob::SetTyping {
                channel_id: msg.channel_id.clone(),
                recipient: msg.sender_id.clone(),
                gateway_session_id: gateway_session.id.clone(),
            })
            .await;

        let run_handle = match engine
            .submit_gateway_run(
                &gateway_session.id,
                &gateway_session.conversation_id,
                &gateway_session.channel_id,
                &gateway_session.sender_id,
                &msg.text,
                streaming_enabled,
            )
            .await
        {
            Ok(result) => result,
            Err(err) => {
                tracing::error!(
                    "gateway runtime submit error for session {}: {err}",
                    gateway_session.id
                );
                return;
            }
        };
        let run = run_handle.snapshot.clone();
        let preview_stream_task = run_handle.stream_rx.map(|stream_rx| {
            spawn_preview_stream_task(
                self.delivery.clone(),
                msg.channel_id.clone(),
                msg.sender_id.clone(),
                gateway_session.id.clone(),
                run.id.clone(),
                stream_rx,
            )
        });

        let _ = self
            .session_manager
            .note_run_started(&gateway_session.id, &run.id)
            .await;

        let response = match run_handle.result_rx.await {
            Ok(Ok(response)) => response,
            Ok(Err(err)) => {
                if let Some(task) = preview_stream_task {
                    let _ = task.await;
                }
                if streaming_enabled {
                    let _ = enqueue_preview_clear(
                        &self.delivery,
                        &msg.channel_id,
                        &msg.sender_id,
                        &gateway_session.id,
                        &run.id,
                    )
                    .await;
                }
                let _ = self
                    .session_manager
                    .note_delivery_result(&gateway_session.id, &run.id, Some(&err))
                    .await;
                tracing::error!(
                    "agent error for conversation {}: {err}",
                    gateway_session.conversation_id
                );
                return;
            }
            Err(err) => {
                if let Some(task) = preview_stream_task {
                    let _ = task.await;
                }
                if streaming_enabled {
                    let _ = enqueue_preview_clear(
                        &self.delivery,
                        &msg.channel_id,
                        &msg.sender_id,
                        &gateway_session.id,
                        &run.id,
                    )
                    .await;
                }
                let message = format!("gateway run result channel dropped: {err}");
                let _ = self
                    .session_manager
                    .note_delivery_result(&gateway_session.id, &run.id, Some(&message))
                    .await;
                tracing::error!("{message}");
                return;
            }
        };
        if let Some(task) = preview_stream_task {
            let _ = task.await;
        }

        let outgoing_message = response
            .rich_content
            .clone()
            .unwrap_or_else(|| markdown_message(response.content.clone()));

        if let Some(observer) = self.observer.as_ref() {
            observer
                .on_assistant_message(
                    &run.id,
                    &gateway_session.conversation_id,
                    &gateway_session.channel_id,
                    &response.content,
                    Some(outgoing_message.clone()),
                )
                .await;
        }

        let run_id = run.id.clone();
        let gateway_session_id = gateway_session.id.clone();
        let enqueue_result = if streaming_enabled && response.rich_content.is_none() {
            self.delivery
                .enqueue(DeliveryJob::PreviewFinalize {
                    channel_id: msg.channel_id.clone(),
                    recipient: msg.sender_id.clone(),
                    gateway_session_id: gateway_session_id.clone(),
                    run_id: run_id.clone(),
                })
                .await
        } else if streaming_enabled {
            if let Err(err) = enqueue_preview_clear(
                &self.delivery,
                &msg.channel_id,
                &msg.sender_id,
                &gateway_session_id,
                &run_id,
            )
            .await
            {
                Err(err)
            } else {
                self.delivery
                    .enqueue(DeliveryJob::Final {
                        channel_id: msg.channel_id.clone(),
                        recipient: msg.sender_id.clone(),
                        gateway_session_id: gateway_session_id.clone(),
                        run_id: run_id.clone(),
                        message: outgoing_message.clone(),
                    })
                    .await
            }
        } else {
            self.delivery
                .enqueue(DeliveryJob::Final {
                    channel_id: msg.channel_id.clone(),
                    recipient: msg.sender_id.clone(),
                    gateway_session_id: gateway_session_id.clone(),
                    run_id: run_id.clone(),
                    message: outgoing_message,
                })
                .await
        };
        if let Err(err) = enqueue_result {
            let message = err.to_string();
            if let Some(engine) = self.engine.load_full() {
                let _ = engine
                    .record_run_event(
                        &run_id,
                        "delivery_failed",
                        format!("Gateway delivery queueing failed: {message}"),
                    )
                    .await;
            }
            let _ = self
                .session_manager
                .note_delivery_result(&gateway_session.id, &run_id, Some(&message))
                .await;
            tracing::error!(
                "gateway delivery queueing failed for run {}: {message}",
                run_id
            );
        }
    }

    pub async fn run(self: Arc<Self>, mut rx: mpsc::Receiver<IncomingMessage>) {
        while let Some(msg) = rx.recv().await {
            let Ok(permit) = self.concurrency.clone().acquire_owned().await else {
                tracing::warn!("gateway router concurrency semaphore closed");
                break;
            };
            let router = self.clone();
            tokio::spawn(async move {
                let _permit = permit;
                router.route(msg).await;
            });
        }
    }
}

fn should_stream_preview(msg: &IncomingMessage) -> bool {
    (msg.channel_id == "telegram" || msg.channel_id == "mobile")
        && msg.is_direct_message
        && msg.enable_streaming_preview
}

fn spawn_preview_stream_task(
    delivery: GatewayDeliveryHandle,
    channel_id: String,
    recipient: String,
    gateway_session_id: String,
    run_id: String,
    stream_rx: mpsc::Receiver<StreamingEvent>,
) -> JoinHandle<()> {
    tokio::spawn(async move {
        drive_preview_stream(
            delivery,
            channel_id,
            recipient,
            gateway_session_id,
            run_id,
            stream_rx,
        )
        .await;
    })
}

async fn drive_preview_stream(
    delivery: GatewayDeliveryHandle,
    channel_id: String,
    recipient: String,
    gateway_session_id: String,
    run_id: String,
    mut stream_rx: mpsc::Receiver<StreamingEvent>,
) {
    let sleep = time::sleep(Duration::from_secs(60));
    tokio::pin!(sleep);

    let mut timer_armed = false;
    let mut current_snapshot = String::new();
    let mut pending_snapshot: Option<String> = None;

    loop {
        tokio::select! {
            maybe_event = stream_rx.recv() => {
                let Some(event) = maybe_event else {
                    break;
                };

                match event {
                    StreamingEvent::ChatChunk(chunk) => {
                        if !chunk.delta.is_empty() {
                            current_snapshot.push_str(&chunk.delta);
                            pending_snapshot = Some(current_snapshot.clone());
                            arm_preview_timer(&mut sleep, &mut timer_armed);
                        }

                        if chunk.done {
                            flush_pending_preview(
                                &delivery,
                                &channel_id,
                                &recipient,
                                &gateway_session_id,
                                &run_id,
                                &mut pending_snapshot,
                            )
                            .await;
                            timer_armed = false;
                        }
                    }
                    StreamingEvent::AssistantReset => {
                        flush_pending_preview(
                            &delivery,
                            &channel_id,
                            &recipient,
                            &gateway_session_id,
                            &run_id,
                            &mut pending_snapshot,
                        )
                        .await;
                        timer_armed = false;
                        if !current_snapshot.trim().is_empty() {
                            let _ = delivery
                                .enqueue(DeliveryJob::PreviewFinalize {
                                    channel_id: channel_id.clone(),
                                    recipient: recipient.clone(),
                                    gateway_session_id: gateway_session_id.clone(),
                                    run_id: run_id.clone(),
                                })
                                .await;
                        }
                        current_snapshot.clear();
                    }
                    StreamingEvent::ToolStart { .. } | StreamingEvent::ToolEnd { .. } => {}
                }
            }
            _ = &mut sleep, if timer_armed => {
                flush_pending_preview(
                    &delivery,
                    &channel_id,
                    &recipient,
                    &gateway_session_id,
                    &run_id,
                    &mut pending_snapshot,
                )
                .await;
                timer_armed = false;
            }
        }
    }

    flush_pending_preview(
        &delivery,
        &channel_id,
        &recipient,
        &gateway_session_id,
        &run_id,
        &mut pending_snapshot,
    )
    .await;
}

fn arm_preview_timer(sleep: &mut std::pin::Pin<&mut time::Sleep>, timer_armed: &mut bool) {
    if *timer_armed {
        return;
    }

    sleep
        .as_mut()
        .reset(Instant::now() + PREVIEW_UPDATE_THROTTLE);
    *timer_armed = true;
}

async fn flush_pending_preview(
    delivery: &GatewayDeliveryHandle,
    channel_id: &str,
    recipient: &str,
    gateway_session_id: &str,
    run_id: &str,
    pending_snapshot: &mut Option<String>,
) {
    let Some(text) = pending_snapshot.take() else {
        return;
    };
    if text.trim().is_empty() {
        return;
    }

    let _ = delivery
        .enqueue(DeliveryJob::PreviewUpdate {
            channel_id: channel_id.to_owned(),
            recipient: recipient.to_owned(),
            gateway_session_id: gateway_session_id.to_owned(),
            run_id: run_id.to_owned(),
            text,
        })
        .await;
}

async fn enqueue_preview_clear(
    delivery: &GatewayDeliveryHandle,
    channel_id: &str,
    recipient: &str,
    gateway_session_id: &str,
    run_id: &str,
) -> rushdino_common::Result<()> {
    delivery
        .enqueue(DeliveryJob::PreviewClear {
            channel_id: channel_id.to_owned(),
            recipient: recipient.to_owned(),
            gateway_session_id: gateway_session_id.to_owned(),
            run_id: run_id.to_owned(),
        })
        .await
}
