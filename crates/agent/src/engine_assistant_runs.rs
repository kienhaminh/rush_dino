//! Assistant run submission, execution, and runtime event forwarding.
//!
//! Extracted from `engine.rs` to keep the main file focused on struct
//! definitions and construction.

use std::sync::Arc;
use std::time::Duration;

use tokio::sync::{mpsc, oneshot};
use uuid::Uuid;

use rushdino_common::{
    models::Message,
    Result,
};
use rushdino_providers::types::ChatResponse;

use crate::{
    engine::{AgentConfig, AssistantRunJob, GatewayRunHandle, WsStreamEvent},
    engine_bootstrap::{resolve_skills_for_prompt, session_title_from_id, system_message, title_from, user_message},
    react_loop::{run_react_loop, run_react_loop_streaming, StreamingEvent},
    runtime::{AgentRuntime, AssistantRunParams, RunCounts, RunDetail, RunListFilter, RunOriginMetadata, RunSnapshot},
    tools::bash::{with_tool_execution_context, ToolExecutionContext},
};

impl crate::engine::AgentEngine {
    pub async fn submit_http_run(
        self: &Arc<Self>,
        session_id: &str,
        conversation_id: Option<String>,
        user_input: &str,
    ) -> Result<(
        RunSnapshot,
        oneshot::Receiver<std::result::Result<ChatResponse, String>>,
    )> {
        let conversation_id = conversation_id.unwrap_or_else(|| Uuid::new_v4().to_string());
        let (snapshot, start_now) = self
            .runtime
            .submit_assistant_run(
                session_id,
                &conversation_id,
                title_from(user_input),
                user_input,
                &self.provider_name,
                self.provider.model(),
            )
            .await?;

        let (result_tx, result_rx) = oneshot::channel();
        self.pending_assistant_runs.lock().await.insert(
            snapshot.id.clone(),
            AssistantRunJob {
                run_id: snapshot.id.clone(),
                session_id: session_id.to_owned(),
                conversation_id,
                user_input: user_input.to_owned(),
                ws_event_tx: None,
                gateway_event_tx: None,
                completion_tx: Some(result_tx),
            },
        );

        if start_now {
            if let Some(job) = self
                .pending_assistant_runs
                .lock()
                .await
                .remove(&snapshot.id)
            {
                let engine = self.clone();
                tokio::spawn(async move {
                    engine.execute_assistant_run(job).await;
                });
            }
        }

        Ok((snapshot, result_rx))
    }

    pub async fn submit_gateway_run(
        self: &Arc<Self>,
        gateway_session_id: &str,
        conversation_id: &str,
        channel_id: &str,
        sender_id: &str,
        user_input: &str,
        stream_events: bool,
    ) -> Result<GatewayRunHandle> {
        let (snapshot, start_now) = self
            .runtime
            .submit_assistant_run_with_origin(AssistantRunParams {
                session_id: gateway_session_id,
                conversation_id,
                title: session_title_from_id(conversation_id)
                    .as_deref()
                    .unwrap_or_else(|| title_from(user_input)),
                input_text: user_input,
                provider: &self.provider_name,
                model: self.provider.model(),
                origin: RunOriginMetadata {
                    source: Some("gateway".to_owned()),
                    channel_id: Some(channel_id.to_owned()),
                    sender_id: Some(sender_id.to_owned()),
                    gateway_session_id: Some(gateway_session_id.to_owned()),
                },
            })
            .await?;

        let (result_tx, result_rx) = oneshot::channel();
        let (gateway_event_tx, stream_rx) = if stream_events {
            let (tx, rx) = mpsc::channel(128);
            (Some(tx), Some(rx))
        } else {
            (None, None)
        };
        self.pending_assistant_runs.lock().await.insert(
            snapshot.id.clone(),
            AssistantRunJob {
                run_id: snapshot.id.clone(),
                session_id: gateway_session_id.to_owned(),
                conversation_id: conversation_id.to_owned(),
                user_input: user_input.to_owned(),
                ws_event_tx: None,
                gateway_event_tx,
                completion_tx: Some(result_tx),
            },
        );

        if start_now {
            if let Some(job) = self
                .pending_assistant_runs
                .lock()
                .await
                .remove(&snapshot.id)
            {
                let engine = self.clone();
                tokio::spawn(async move {
                    engine.execute_assistant_run(job).await;
                });
            }
        }

        Ok(GatewayRunHandle {
            snapshot,
            result_rx,
            stream_rx,
        })
    }

    pub async fn submit_ws_run(
        self: &Arc<Self>,
        session_id: &str,
        conversation_id: Option<String>,
        user_input: &str,
        event_tx: mpsc::Sender<WsStreamEvent>,
    ) -> Result<RunSnapshot> {
        let conversation_id = conversation_id.unwrap_or_else(|| Uuid::new_v4().to_string());
        let (snapshot, start_now) = self
            .runtime
            .submit_assistant_run(
                session_id,
                &conversation_id,
                title_from(user_input),
                user_input,
                &self.provider_name,
                self.provider.model(),
            )
            .await?;

        self.pending_assistant_runs.lock().await.insert(
            snapshot.id.clone(),
            AssistantRunJob {
                run_id: snapshot.id.clone(),
                session_id: session_id.to_owned(),
                conversation_id,
                user_input: user_input.to_owned(),
                ws_event_tx: Some(event_tx),
                gateway_event_tx: None,
                completion_tx: None,
            },
        );

        if start_now {
            if let Some(job) = self
                .pending_assistant_runs
                .lock()
                .await
                .remove(&snapshot.id)
            {
                let engine = self.clone();
                tokio::spawn(async move {
                    engine.execute_assistant_run(job).await;
                });
            }
        }

        Ok(snapshot)
    }

    pub async fn list_runs(&self, filter: RunListFilter) -> Result<Vec<RunSnapshot>> {
        self.runtime.list_runs(filter).await
    }

    pub async fn get_run_detail(&self, run_id: &str, event_limit: i64) -> Result<RunDetail> {
        self.runtime.get_run_detail(run_id, event_limit).await
    }

    pub async fn get_run(&self, run_id: &str) -> Result<RunSnapshot> {
        self.runtime.get_run(run_id).await
    }

    pub async fn wait_for_run(
        &self,
        run_id: &str,
        timeout: Duration,
        require_terminal: bool,
    ) -> Result<RunSnapshot> {
        self.runtime
            .wait_for_run(run_id, timeout, require_terminal)
            .await
    }

    pub async fn abort_run(&self, run_id: &str) -> Result<RunSnapshot> {
        let outcome = self.runtime.abort_run(run_id).await?;
        if outcome.removed_from_queue {
            if let Some(job) = self.pending_assistant_runs.lock().await.remove(run_id) {
                if let Some(tx) = job.completion_tx {
                    let _ = tx.send(Err("run aborted before execution started".to_owned()));
                }
            }
        }
        Ok(outcome.snapshot)
    }

    pub async fn list_session_runs(
        &self,
        conversation_id: &str,
        limit: i64,
    ) -> Result<Vec<RunSnapshot>> {
        self.runtime.list_session_runs(conversation_id, limit).await
    }

    pub async fn run_counts(&self) -> Result<RunCounts> {
        self.runtime.counts().await
    }

    pub async fn record_approval_resolution(
        &self,
        run_id: &str,
        approved: bool,
        reason: Option<String>,
    ) -> Result<RunSnapshot> {
        self.runtime
            .record_approval_resolution(run_id, approved, reason)
            .await
    }

    pub async fn record_run_event(
        &self,
        run_id: &str,
        event_type: &str,
        message: impl Into<String>,
    ) -> Result<RunSnapshot> {
        self.runtime.record_event(run_id, event_type, message).await
    }

    async fn execute_assistant_run(self: Arc<Self>, mut job: AssistantRunJob) {
        loop {
            let run_id = job.run_id.clone();
            let session_id = job.session_id.clone();
            let conversation_id = job.conversation_id.clone();
            let user_input = job.user_input.clone();
            let ws_event_tx = job.ws_event_tx.clone();
            let gateway_event_tx = job.gateway_event_tx.clone();
            let result = self
                .execute_assistant_with_runtime(
                    &run_id,
                    &session_id,
                    &conversation_id,
                    &user_input,
                    ws_event_tx.clone(),
                    gateway_event_tx,
                )
                .await;
            let completion_tx = job.completion_tx.take();

            match result {
                Ok(response) => {
                    let snapshot = match self
                        .runtime
                        .mark_completed(&run_id, &response.content)
                        .await
                    {
                        Ok(snapshot) => snapshot,
                        Err(err) => {
                            tracing::error!(run_id = %run_id, error = %err, "failed to finalize completed run");
                            return;
                        }
                    };
                    if snapshot.state == crate::runtime::RunState::Completed {
                        if let Some(ws_event_tx) = ws_event_tx.as_ref() {
                            let _ = ws_event_tx
                                .send(WsStreamEvent::AssistantMessage {
                                    run_id: run_id.clone(),
                                    conversation_id: conversation_id.clone(),
                                    content: response.content.clone(),
                                    rich_content: response.rich_content.clone(),
                                })
                                .await;
                        }
                    }
                    if let Some(tx) = completion_tx {
                        let _ = tx.send(if snapshot.state == crate::runtime::RunState::Completed {
                            Ok(response)
                        } else {
                            Err(snapshot
                                .policy
                                .reason
                                .clone()
                                .unwrap_or_else(|| "run aborted".to_owned()))
                        });
                    }
                }
                Err(err) => {
                    let snapshot = match self.runtime.mark_failed(&run_id, &err.to_string()).await {
                        Ok(snapshot) => snapshot,
                        Err(persist_err) => {
                            tracing::error!(
                                run_id = %run_id,
                                error = %persist_err,
                                "failed to persist failed run state"
                            );
                            return;
                        }
                    };

                    if snapshot.state != crate::runtime::RunState::Aborted {
                        if let Some(ws_event_tx) = ws_event_tx.as_ref() {
                            let _ = ws_event_tx
                                .send(WsStreamEvent::Error {
                                    run_id: run_id.clone(),
                                    conversation_id: conversation_id.clone(),
                                    message: err.to_string(),
                                })
                                .await;
                        }
                    }

                    if let Some(tx) = completion_tx {
                        let message = if snapshot.state == crate::runtime::RunState::Aborted {
                            snapshot
                                .policy
                                .reason
                                .clone()
                                .unwrap_or_else(|| "run aborted".to_owned())
                        } else {
                            snapshot.error.clone().unwrap_or_else(|| err.to_string())
                        };
                        let _ = tx.send(Err(message));
                    }
                }
            }

            match self.runtime.finish_assistant_run(&run_id).await {
                Ok(Some(next_run_id)) => {
                    let Some(next_job) = self
                        .pending_assistant_runs
                        .lock()
                        .await
                        .remove(&next_run_id)
                    else {
                        return;
                    };
                    job = next_job;
                }
                Ok(None) => return,
                Err(err) => {
                    tracing::error!(run_id = %run_id, error = %err, "failed to advance session lane");
                    return;
                }
            }
        }
    }

    async fn execute_assistant_with_runtime(
        &self,
        run_id: &str,
        session_id: &str,
        conversation_id: &str,
        user_input: &str,
        ws_event_tx: Option<mpsc::Sender<WsStreamEvent>>,
        gateway_event_tx: Option<mpsc::Sender<StreamingEvent>>,
    ) -> Result<ChatResponse> {
        let (messages, persist_offset) = self
            .prepare_assistant_turn(conversation_id, user_input)
            .await?;

        let (internal_tx, internal_rx) = mpsc::channel(128);
        let runtime = self.runtime.clone();
        let run_id = run_id.to_owned();
        let conversation_id = conversation_id.to_owned();
        let run_id_for_events = run_id.clone();
        let conversation_id_for_events = conversation_id.clone();
        let ws_event_tx_clone = ws_event_tx.clone();
        let gateway_event_tx_clone = gateway_event_tx.clone();
        let forwarder = tokio::spawn(async move {
            forward_runtime_events(
                runtime,
                run_id_for_events,
                conversation_id_for_events,
                internal_rx,
                ws_event_tx_clone,
                gateway_event_tx_clone,
            )
            .await;
        });

        let tool_context = ToolExecutionContext {
            session_id: Some(session_id.to_owned()),
            conversation_id: Some(conversation_id.to_owned()),
            run_id: Some(run_id.clone()),
            delegation_depth: 0,
            workspace_override: None,
            parent_context: None,
            ws_event_tx: ws_event_tx.clone(),
        };

        let effective_config = AgentConfig {
            thinking_level: self.effective_thinking_level(),
            ..self.config.clone()
        };
        let result = if ws_event_tx.is_some() || gateway_event_tx.is_some() {
            with_tool_execution_context(
                tool_context,
                run_react_loop_streaming(
                    self.provider.clone(),
                    self.tool_registry.clone(),
                    self.session_ctx.clone(),
                    messages,
                    &effective_config,
                    internal_tx,
                    Some(run_id.as_str()),
                ),
            )
            .await
        } else {
            with_tool_execution_context(
                tool_context,
                run_react_loop(
                    self.provider.clone(),
                    self.tool_registry.clone(),
                    self.session_ctx.clone(),
                    messages,
                    &effective_config,
                    Some(internal_tx),
                    Some(run_id.as_str()),
                ),
            )
            .await
        };

        let (response, all_messages, _timing) = result?;
        let _ = forwarder.await;
        self.persist_assistant_turn(
            conversation_id.as_str(),
            persist_offset,
            &all_messages,
            &response,
        )
        .await?;
        Ok(response)
    }

    async fn prepare_assistant_turn(
        &self,
        conversation_id: &str,
        user_input: &str,
    ) -> Result<(Vec<Message>, usize)> {
        let title = session_title_from_id(conversation_id)
            .unwrap_or_else(|| title_from(user_input).to_owned());
        let mut messages = self.conversation.ensure_conversation(conversation_id, &title).await?;

        let skills = resolve_skills_for_prompt(
            self.skill_manager.as_ref(),
            user_input,
        )
        .await;
        messages.insert(
            0,
            system_message(
                &self.config,
                self.memory.as_ref(),
                skills,
                self.session_ctx.as_ref(),
                &self.agent_manager.list(),
            ),
        );

        let old_len = messages.len();
        let user_msg = user_message(user_input);
        self.conversation
            .save_message(conversation_id, &user_msg)
            .await?;
        self.maybe_ingest_message("conversation_message", &user_msg)
            .await;
        messages.push(user_msg);

        let mut injected_graph_context = false;
        if let Some(graph_message) = self
            .build_graph_context_message(user_input, Some(conversation_id))
            .await
        {
            messages.push(graph_message);
            injected_graph_context = true;
        }

        Ok((messages, old_len + 1 + usize::from(injected_graph_context)))
    }

    async fn persist_assistant_turn(
        &self,
        conversation_id: &str,
        persist_offset: usize,
        all_messages: &[Message],
        response: &ChatResponse,
    ) -> Result<()> {
        for message in all_messages.iter().skip(persist_offset) {
            self.conversation
                .save_message(conversation_id, message)
                .await?;
            self.maybe_ingest_message("conversation_message", message)
                .await;
        }
        self.persist_usage_metric(conversation_id, response).await;
        Ok(())
    }
}

async fn forward_runtime_events(
    runtime: Arc<AgentRuntime>,
    run_id: String,
    conversation_id: String,
    mut internal_rx: mpsc::Receiver<StreamingEvent>,
    ws_event_tx: Option<mpsc::Sender<WsStreamEvent>>,
    gateway_event_tx: Option<mpsc::Sender<StreamingEvent>>,
) {
    let mut streamed_output = String::new();
    while let Some(event) = internal_rx.recv().await {
        if let Some(gateway_event_tx) = gateway_event_tx.as_ref() {
            let _ = gateway_event_tx.send(event.clone()).await;
        }
        match event {
            StreamingEvent::ChatChunk(chunk) => {
                if !chunk.delta.is_empty() {
                    streamed_output.push_str(&chunk.delta);
                    let _ = runtime.record_output_text(&run_id, &streamed_output).await;
                }
                if let Some(ws_event_tx) = ws_event_tx.as_ref() {
                    let _ = ws_event_tx
                        .send(WsStreamEvent::ChatChunk {
                            run_id: run_id.clone(),
                            conversation_id: conversation_id.clone(),
                            chunk,
                        })
                        .await;
                }
            }
            StreamingEvent::AssistantReset => {
                if let Some(ws_event_tx) = ws_event_tx.as_ref() {
                    let _ = ws_event_tx
                        .send(WsStreamEvent::AssistantReset {
                            run_id: run_id.clone(),
                            conversation_id: conversation_id.clone(),
                        })
                        .await;
                }
            }
            StreamingEvent::ToolStart { tool_name, args } => {
                let _ = runtime
                    .mark_tool_started(
                        &run_id,
                        &tool_name,
                        Some(format!("Tool `{tool_name}` started execution.")),
                    )
                    .await;
                if let Some(ws_event_tx) = ws_event_tx.as_ref() {
                    let _ = ws_event_tx
                        .send(WsStreamEvent::ToolStart {
                            run_id: run_id.clone(),
                            conversation_id: conversation_id.clone(),
                            tool_name,
                            args,
                        })
                        .await;
                }
            }
            StreamingEvent::ToolEnd {
                tool_name,
                result,
                is_error,
            } => {
                let _ = runtime
                    .mark_tool_finished(
                        &run_id,
                        &tool_name,
                        is_error,
                        if is_error {
                            format!("Tool `{tool_name}` returned an error.")
                        } else {
                            format!("Tool `{tool_name}` completed.")
                        },
                    )
                    .await;
                if let Some(ws_event_tx) = ws_event_tx.as_ref() {
                    let _ = ws_event_tx
                        .send(WsStreamEvent::ToolEnd {
                            run_id: run_id.clone(),
                            conversation_id: conversation_id.clone(),
                            tool_name,
                            result,
                            is_error,
                        })
                        .await;
                }
            }
        }
    }
}
