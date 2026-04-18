use std::collections::HashSet;

use tokio::sync::mpsc;

use rushdino_common::Result;
use rushdino_providers::types::{ChatChunk, ChatResponse};

use crate::{
    engine::{AgentConfig, WsStreamEvent},
    engine_bootstrap::{resolve_skills_for_prompt, session_title_from_id, system_message, title_from, user_message},
    react_loop::{run_react_loop, run_react_loop_streaming, StreamingEvent},
    tools::bash::{with_tool_execution_context, ToolExecutionContext},
};

impl crate::engine::AgentEngine {
    pub async fn chat_or_create(
        &self,
        conversation_id: Option<String>,
        user_input: &str,
    ) -> Result<(String, ChatResponse)> {
        let conversation_id = if let Some(id) = conversation_id {
            id
        } else {
            self.conversation
                .create_conversation(title_from(user_input))
                .await?
                .id
        };
        let response = self.chat(&conversation_id, user_input).await?;
        Ok((conversation_id, response))
    }

    pub async fn chat(&self, conversation_id: &str, user_input: &str) -> Result<ChatResponse> {
        let title = session_title_from_id(conversation_id)
            .unwrap_or_else(|| title_from(user_input).to_owned());
        let mut messages = self.conversation.ensure_conversation(conversation_id, &title).await?;

        // Always prepend the system message at position 0. It is never stored in
        // the DB (dynamic memory/soul files can change between turns), so it must
        // be reconstructed and injected fresh on every request.
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

        // Track which message IDs are already persisted in the DB so we can detect
        // compaction (messages that disappear) and new messages (messages to save).
        // The system prompt is ephemeral (rebuilt each turn) and never stored.
        let sys_prompt_id = messages[0].id.clone();
        let persisted_ids: HashSet<String> =
            messages[1..].iter().map(|m| m.id.clone()).collect();

        let user_msg = user_message(user_input);
        self.conversation
            .save_message(conversation_id, &user_msg)
            .await?;
        self.maybe_ingest_message("conversation_message", &user_msg)
            .await;
        let user_msg_id = user_msg.id.clone();
        messages.push(user_msg);

        // Collect all IDs the DB knows about before the react loop.
        let mut all_pre_loop_db_ids = persisted_ids;
        all_pre_loop_db_ids.insert(user_msg_id);

        let mut graph_ctx_id: Option<String> = None;
        if let Some(graph_message) = self
            .build_graph_context_message(user_input, Some(conversation_id))
            .await
        {
            // Graph context is ephemeral — injected for LLM context only, never stored.
            graph_ctx_id = Some(graph_message.id.clone());
            messages.push(graph_message);
        }

        let context = ToolExecutionContext {
            session_id: None,
            conversation_id: Some(conversation_id.to_owned()),
            run_id: None,
            delegation_depth: 0,
            workspace_override: None,
            parent_context: None,
            ws_event_tx: None,
        };

        let effective_config = AgentConfig {
            thinking_level: self.effective_thinking_level(),
            ..self.config.clone()
        };
        let (response, all_messages, timing_records) = with_tool_execution_context(
            context,
            run_react_loop(
                self.provider.clone(),
                self.tool_registry.clone(),
                self.session_ctx.clone(),
                messages,
                &effective_config,
                None,
            ),
        )
        .await?;

        // Delete BOOTSTRAP.md once onboarding is complete, indicated by the presence
        // of IDENTITY.md (written by the agent during the onboarding ritual).
        // This keeps BOOTSTRAP.md injected across the full multi-turn onboarding
        // conversation rather than removing it after just the first response.
        if self.memory.read_named("IDENTITY.md").is_ok() {
            self.memory.delete_named("BOOTSTRAP.md");
        }

        // Persist compaction: if any previously-saved message ID is absent from
        // all_messages, the react loop compacted it away. Delete those rows so the DB
        // matches what the agent actually used as context.
        let current_ids: HashSet<&str> =
            all_messages.iter().map(|m| m.id.as_str()).collect();
        let dropped: Vec<String> = all_pre_loop_db_ids
            .iter()
            .filter(|id| !current_ids.contains(id.as_str()))
            .cloned()
            .collect();
        if !dropped.is_empty() {
            self.conversation
                .delete_messages_by_ids(conversation_id, &dropped)
                .await?;
        }

        // Save every message that is not already in the DB and not an ephemeral
        // message (system prompt or graph context).
        let is_ephemeral = |id: &str| -> bool {
            id == sys_prompt_id || graph_ctx_id.as_deref() == Some(id)
        };
        for message in &all_messages {
            if !all_pre_loop_db_ids.contains(&message.id) && !is_ephemeral(&message.id) {
                self.conversation
                    .save_message(conversation_id, message)
                    .await?;
                self.maybe_ingest_message("conversation_message", message)
                    .await;
            }
        }

        // Persist tool timing records after messages are saved (message_id FK must exist first).
        for record in timing_records {
            if let Err(e) = self.conversation
                .save_tool_log(
                    &record.tool_call_id,
                    &rushdino_common::models::ToolCall {
                        id: record.tool_call_id.clone(),
                        name: record.tool_name.clone(),
                        arguments: record.arguments,
                    },
                    &record.result,
                    record.is_error,
                    record.duration_ms,
                    !record.is_error,
                )
                .await
            {
                tracing::warn!("failed to persist tool timing: {e}");
            }
        }

        self.persist_usage_metric(conversation_id, &response).await;

        Ok(response)
    }

    pub async fn stream_chat(
        &self,
        conversation_id: Option<String>,
        user_input: &str,
    ) -> Result<(String, mpsc::Receiver<ChatChunk>)> {
        let (conv_id, response) = self.chat_or_create(conversation_id, user_input).await?;
        let (tx, rx) = mpsc::channel(8);
        tokio::spawn(async move {
            let _ = tx
                .send(ChatChunk {
                    delta: response.content,
                    tool_calls: response.tool_calls,
                    done: false,
                    usage: response.usage,
                    thinking_delta: None,
                    total_ms: None,
                    ttft_ms: None,
                })
                .await;
            let _ = tx
                .send(ChatChunk {
                    delta: String::new(),
                    tool_calls: Vec::new(),
                    done: true,
                    usage: None,
                    thinking_delta: None,
                    total_ms: None,
                    ttft_ms: None,
                })
                .await;
        });
        Ok((conv_id, rx))
    }

    pub async fn stream_chat_via_ws(
        &self,
        session_id: &str,
        conversation_id: Option<String>,
        user_input: &str,
        event_tx: mpsc::Sender<WsStreamEvent>,
    ) -> Result<String> {
        let conversation_id = if let Some(id) = conversation_id {
            id
        } else {
            self.conversation
                .create_conversation(title_from(user_input))
                .await?
                .id
        };

        let title = session_title_from_id(&conversation_id)
            .unwrap_or_else(|| title_from(user_input).to_owned());
        let mut messages = self.conversation.ensure_conversation(&conversation_id, &title).await?;

        // Always prepend the system message at position 0. It is never stored in
        // the DB (dynamic memory/soul files can change between turns), so it must
        // be reconstructed and injected fresh on every request.
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
            .save_message(&conversation_id, &user_msg)
            .await?;
        self.maybe_ingest_message("conversation_message", &user_msg)
            .await;
        messages.push(user_msg);
        let mut injected_graph_context = false;
        if let Some(graph_message) = self
            .build_graph_context_message(user_input, Some(&conversation_id))
            .await
        {
            messages.push(graph_message);
            injected_graph_context = true;
        }

        let (internal_tx, mut internal_rx) = mpsc::channel(128);
        let event_forward_tx = event_tx.clone();
        let conversation_id_for_events = conversation_id.clone();
        tokio::spawn(async move {
            while let Some(event) = internal_rx.recv().await {
                let ws_event = match event {
                    StreamingEvent::ChatChunk(chunk) => WsStreamEvent::ChatChunk {
                        run_id: "legacy-ws".to_owned(),
                        conversation_id: conversation_id_for_events.clone(),
                        chunk,
                    },
                    StreamingEvent::AssistantReset => WsStreamEvent::AssistantReset {
                        run_id: "legacy-ws".to_owned(),
                        conversation_id: conversation_id_for_events.clone(),
                    },
                    StreamingEvent::ToolStart { tool_name, args } => WsStreamEvent::ToolStart {
                        run_id: "legacy-ws".to_owned(),
                        conversation_id: conversation_id_for_events.clone(),
                        tool_name,
                        args,
                    },
                    StreamingEvent::ToolEnd {
                        tool_name,
                        result,
                        is_error,
                    } => WsStreamEvent::ToolEnd {
                        run_id: "legacy-ws".to_owned(),
                        conversation_id: conversation_id_for_events.clone(),
                        tool_name,
                        result,
                        is_error,
                    },
                };
                if event_forward_tx.send(ws_event).await.is_err() {
                    break;
                }
            }
        });

        let context = ToolExecutionContext {
            session_id: Some(session_id.to_owned()),
            conversation_id: Some(conversation_id.clone()),
            run_id: None,
            delegation_depth: 0,
            workspace_override: None,
            parent_context: None,
            ws_event_tx: None,
        };

        let effective_config = AgentConfig {
            thinking_level: self.effective_thinking_level(),
            ..self.config.clone()
        };
        let (response, all_messages, timing_records) = with_tool_execution_context(
            context,
            run_react_loop_streaming(
                self.provider.clone(),
                self.tool_registry.clone(),
                self.session_ctx.clone(),
                messages,
                &effective_config,
                internal_tx,
            ),
        )
        .await?;

        // Delete BOOTSTRAP.md once onboarding is complete, indicated by the presence
        // of IDENTITY.md (written by the agent during the onboarding ritual).
        // This keeps BOOTSTRAP.md injected across the full multi-turn onboarding
        // conversation rather than removing it after just the first response.
        if self.memory.read_named("IDENTITY.md").is_ok() {
            self.memory.delete_named("BOOTSTRAP.md");
        }

        let persist_offset = old_len + 1 + usize::from(injected_graph_context);
        for message in all_messages.iter().skip(persist_offset) {
            self.conversation
                .save_message(&conversation_id, message)
                .await?;
            self.maybe_ingest_message("conversation_message", message)
                .await;
        }

        // Persist tool timing records after messages are saved (message_id FK must exist first).
        for record in timing_records {
            if let Err(e) = self.conversation
                .save_tool_log(
                    &record.tool_call_id,
                    &rushdino_common::models::ToolCall {
                        id: record.tool_call_id.clone(),
                        name: record.tool_name.clone(),
                        arguments: record.arguments,
                    },
                    &record.result,
                    record.is_error,
                    record.duration_ms,
                    !record.is_error,
                )
                .await
            {
                tracing::warn!("failed to persist tool timing: {e}");
            }
        }

        self.persist_usage_metric(&conversation_id, &response).await;

        Ok(conversation_id)
    }
}
