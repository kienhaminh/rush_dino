//! Stateful translator from internal `WsStreamEvent` → AG-UI canonical events.
//!
//! AG-UI's `TEXT_MESSAGE_START/CONTENT/END` triplet must share a stable
//! `messageId`, and `TOOL_CALL_START/ARGS/END/RESULT` quartet must share a
//! stable `toolCallId`. `AguiMapper` tracks the currently-open message and
//! tool-call ids so consecutive `WsStreamEvent::ChatChunk` deltas can be
//! correlated.

use std::collections::HashSet;

use serde_json::{json, Value};
use uuid::Uuid;

use rushdino_agent::engine::WsStreamEvent;
use rushdino_providers::types::ChatChunk;

pub struct AguiMapper {
    thread_id: String,
    run_id: String,
    open_message_id: Option<String>,
    open_tool_ids: HashSet<String>,
}

impl AguiMapper {
    pub fn new(thread_id: impl Into<String>, run_id: impl Into<String>) -> Self {
        Self {
            thread_id: thread_id.into(),
            run_id: run_id.into(),
            open_message_id: None,
            open_tool_ids: HashSet::new(),
        }
    }

    pub fn run_started(&self) -> Value {
        json!({
            "type": "RUN_STARTED",
            "threadId": self.thread_id,
            "runId": self.run_id,
        })
    }

    pub fn run_finished(&self) -> Value {
        json!({
            "type": "RUN_FINISHED",
            "threadId": self.thread_id,
            "runId": self.run_id,
        })
    }

    fn run_error(&self, message: impl Into<String>) -> Value {
        json!({
            "type": "RUN_ERROR",
            "threadId": self.thread_id,
            "runId": self.run_id,
            "code": "AGENT_ERROR",
            "message": message.into(),
        })
    }

    /// Close any still-open assistant message — called right before `RUN_FINISHED`
    /// so AG-UI consumers don't see a dangling START without an END.
    pub fn flush(&mut self) -> Vec<Value> {
        let mut out = Vec::new();
        if let Some(id) = self.open_message_id.take() {
            out.push(json!({ "type": "TEXT_MESSAGE_END", "messageId": id }));
        }
        out
    }

    pub fn handle(&mut self, event: WsStreamEvent) -> Vec<Value> {
        match event {
            WsStreamEvent::ChatChunk { chunk, .. } => self.handle_chunk(chunk),
            WsStreamEvent::AssistantReset { .. } => self.close_open_message(),
            WsStreamEvent::ToolStart {
                tool_call_id,
                tool_name,
                args,
                ..
            } => self.handle_tool_start(tool_call_id, tool_name, args),
            WsStreamEvent::ToolEnd {
                tool_call_id,
                result,
                ..
            } => self.handle_tool_end(tool_call_id, result),
            // AssistantMessage marks legacy boundary completeness; AG-UI's
            // TEXT_MESSAGE_END (emitted on chunk.done) is the canonical signal.
            WsStreamEvent::AssistantMessage { .. } => Vec::new(),
            WsStreamEvent::Error { message, .. } => vec![self.run_error(message)],
            WsStreamEvent::DelegateEvent {
                delegate_conversation_id,
                agent_name,
                delegation_depth,
                inner,
            } => {
                let mut out = vec![json!({
                    "type": "CUSTOM",
                    "name": "delegate",
                    "value": {
                        "conversationId": delegate_conversation_id,
                        "agentName": agent_name,
                        "depth": delegation_depth,
                    }
                })];
                out.extend(self.handle(*inner));
                out
            }
        }
    }

    fn handle_chunk(&mut self, chunk: ChatChunk) -> Vec<Value> {
        let mut out = Vec::new();
        if let Some(t) = chunk.thinking_delta.as_ref().filter(|s| !s.is_empty()) {
            out.push(json!({
                "type": "CUSTOM",
                "name": "thinking",
                "value": { "delta": t },
            }));
        }
        if !chunk.delta.is_empty() {
            let mid = match self.open_message_id.clone() {
                Some(id) => id,
                None => {
                    let id = Uuid::new_v4().to_string();
                    out.push(json!({
                        "type": "TEXT_MESSAGE_START",
                        "messageId": id,
                        "role": "assistant",
                    }));
                    self.open_message_id = Some(id.clone());
                    id
                }
            };
            out.push(json!({
                "type": "TEXT_MESSAGE_CONTENT",
                "messageId": mid,
                "delta": chunk.delta,
            }));
        }
        if chunk.done {
            if let Some(id) = self.open_message_id.take() {
                out.push(json!({ "type": "TEXT_MESSAGE_END", "messageId": id }));
            }
        }
        out
    }

    fn close_open_message(&mut self) -> Vec<Value> {
        if let Some(id) = self.open_message_id.take() {
            vec![json!({ "type": "TEXT_MESSAGE_END", "messageId": id })]
        } else {
            Vec::new()
        }
    }

    fn handle_tool_start(
        &mut self,
        tool_call_id: String,
        tool_name: String,
        args: Value,
    ) -> Vec<Value> {
        let id = if tool_call_id.is_empty() {
            let synthesized = Uuid::new_v4().to_string();
            tracing::warn!(
                %tool_name,
                %synthesized,
                "ag-ui: tool_call_id missing from provider — synthesizing UUID"
            );
            synthesized
        } else {
            tool_call_id
        };
        self.open_tool_ids.insert(id.clone());
        vec![
            json!({
                "type": "TOOL_CALL_START",
                "toolCallId": id,
                "toolCallName": tool_name,
            }),
            json!({
                "type": "TOOL_CALL_ARGS",
                "toolCallId": id,
                "delta": serde_json::to_string(&args).unwrap_or_default(),
            }),
        ]
    }

    fn handle_tool_end(&mut self, tool_call_id: String, result: String) -> Vec<Value> {
        if tool_call_id.is_empty() {
            tracing::warn!("ag-ui: ToolEnd missing tool_call_id; skipping");
            return Vec::new();
        }
        let was_open = self.open_tool_ids.remove(&tool_call_id);
        if !was_open {
            tracing::warn!(
                tool_call_id = %tool_call_id,
                "ag-ui: ToolEnd for unknown tool_call_id — emitting anyway"
            );
        }
        vec![
            json!({ "type": "TOOL_CALL_END", "toolCallId": tool_call_id }),
            json!({
                "type": "TOOL_CALL_RESULT",
                "messageId": Uuid::new_v4().to_string(),
                "toolCallId": tool_call_id,
                "content": result,
                "role": "tool",
            }),
        ]
    }
}
