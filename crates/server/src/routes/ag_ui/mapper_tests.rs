//! Unit tests for `AguiMapper` — covers the WsStreamEvent → AG-UI event mapping.

use serde_json::{json, Value};

use rushdino_agent::engine::WsStreamEvent;
use rushdino_providers::types::ChatChunk;

use super::mapper::AguiMapper;

fn chunk(delta: &str, done: bool) -> ChatChunk {
    ChatChunk {
        delta: delta.to_owned(),
        tool_calls: Vec::new(),
        done,
        usage: None,
        thinking_delta: None,
        total_ms: None,
        ttft_ms: None,
    }
}

fn chunk_with_thinking(delta: &str, thinking: &str, done: bool) -> ChatChunk {
    ChatChunk {
        delta: delta.to_owned(),
        tool_calls: Vec::new(),
        done,
        usage: None,
        thinking_delta: Some(thinking.to_owned()),
        total_ms: None,
        ttft_ms: None,
    }
}

fn chat_chunk_event(c: ChatChunk) -> WsStreamEvent {
    WsStreamEvent::ChatChunk {
        run_id: "r1".to_owned(),
        conversation_id: "t1".to_owned(),
        chunk: c,
    }
}

fn types(events: &[Value]) -> Vec<&str> {
    events
        .iter()
        .filter_map(|e| e.get("type").and_then(|t| t.as_str()))
        .collect()
}

#[test]
fn run_lifecycle_emits_started_and_finished() {
    let mapper = AguiMapper::new("t1", "r1");
    let started = mapper.run_started();
    assert_eq!(started["type"], "RUN_STARTED");
    assert_eq!(started["threadId"], "t1");
    assert_eq!(started["runId"], "r1");

    let finished = mapper.run_finished();
    assert_eq!(finished["type"], "RUN_FINISHED");
}

#[test]
fn single_chunk_emits_start_content_end() {
    let mut mapper = AguiMapper::new("t1", "r1");
    let out = mapper.handle(chat_chunk_event(chunk("hi", true)));
    assert_eq!(
        types(&out),
        vec![
            "TEXT_MESSAGE_START",
            "TEXT_MESSAGE_CONTENT",
            "TEXT_MESSAGE_END"
        ]
    );
}

#[test]
fn multi_chunk_share_message_id() {
    let mut mapper = AguiMapper::new("t1", "r1");
    let mut events = mapper.handle(chat_chunk_event(chunk("he", false)));
    events.extend(mapper.handle(chat_chunk_event(chunk("llo", false))));
    events.extend(mapper.handle(chat_chunk_event(chunk("", true))));

    let ids: Vec<&str> = events
        .iter()
        .filter_map(|e| e.get("messageId").and_then(|v| v.as_str()))
        .collect();
    assert!(ids.len() >= 3, "expected at least 3 events with messageId");
    let first = ids[0];
    assert!(ids.iter().all(|id| *id == first), "ids must match: {ids:?}");
}

#[test]
fn done_chunk_closes_message() {
    let mut mapper = AguiMapper::new("t1", "r1");
    mapper.handle(chat_chunk_event(chunk("hi", false)));
    let out = mapper.handle(chat_chunk_event(chunk("", true)));
    assert_eq!(types(&out), vec!["TEXT_MESSAGE_END"]);
}

#[test]
fn assistant_reset_starts_new_message_id() {
    let mut mapper = AguiMapper::new("t1", "r1");
    let first = mapper.handle(chat_chunk_event(chunk("hi", false)));
    let id1 = first[0]["messageId"].as_str().unwrap().to_owned();

    let reset = mapper.handle(WsStreamEvent::AssistantReset {
        run_id: "r1".to_owned(),
        conversation_id: "t1".to_owned(),
    });
    assert_eq!(types(&reset), vec!["TEXT_MESSAGE_END"]);

    let second = mapper.handle(chat_chunk_event(chunk("yo", false)));
    let id2 = second[0]["messageId"].as_str().unwrap();
    assert_ne!(id1, id2);
}

#[test]
fn thinking_delta_emits_custom_event_not_text() {
    let mut mapper = AguiMapper::new("t1", "r1");
    let out = mapper.handle(chat_chunk_event(chunk_with_thinking(
        "",
        "pondering",
        false,
    )));
    assert_eq!(types(&out), vec!["CUSTOM"]);
    assert_eq!(out[0]["name"], "thinking");
    assert_eq!(out[0]["value"]["delta"], "pondering");
}

#[test]
fn tool_start_emits_start_and_args() {
    let mut mapper = AguiMapper::new("t1", "r1");
    let out = mapper.handle(WsStreamEvent::ToolStart {
        run_id: "r1".to_owned(),
        conversation_id: "t1".to_owned(),
        tool_call_id: "tc1".to_owned(),
        tool_name: "search".to_owned(),
        args: json!({"q": "rust"}),
    });
    assert_eq!(types(&out), vec!["TOOL_CALL_START", "TOOL_CALL_ARGS"]);
    assert_eq!(out[0]["toolCallId"], "tc1");
    assert_eq!(out[0]["toolCallName"], "search");
    assert_eq!(out[1]["toolCallId"], "tc1");
    assert!(out[1]["delta"].as_str().unwrap().contains("rust"));
}

#[test]
fn tool_end_emits_end_and_result() {
    let mut mapper = AguiMapper::new("t1", "r1");
    mapper.handle(WsStreamEvent::ToolStart {
        run_id: "r1".to_owned(),
        conversation_id: "t1".to_owned(),
        tool_call_id: "tc1".to_owned(),
        tool_name: "search".to_owned(),
        args: json!({}),
    });
    let out = mapper.handle(WsStreamEvent::ToolEnd {
        run_id: "r1".to_owned(),
        conversation_id: "t1".to_owned(),
        tool_call_id: "tc1".to_owned(),
        tool_name: "search".to_owned(),
        result: "ok".to_owned(),
        is_error: false,
    });
    assert_eq!(types(&out), vec!["TOOL_CALL_END", "TOOL_CALL_RESULT"]);
    assert_eq!(out[1]["content"], "ok");
    assert_eq!(out[1]["role"], "tool");
}

#[test]
fn tool_error_propagates_through_result_content() {
    let mut mapper = AguiMapper::new("t1", "r1");
    mapper.handle(WsStreamEvent::ToolStart {
        run_id: "r1".to_owned(),
        conversation_id: "t1".to_owned(),
        tool_call_id: "tc1".to_owned(),
        tool_name: "fail".to_owned(),
        args: json!({}),
    });
    let out = mapper.handle(WsStreamEvent::ToolEnd {
        run_id: "r1".to_owned(),
        conversation_id: "t1".to_owned(),
        tool_call_id: "tc1".to_owned(),
        tool_name: "fail".to_owned(),
        result: "boom".to_owned(),
        is_error: true,
    });
    // Error flag isn't a separate AG-UI field; surface via result content.
    assert_eq!(out[1]["content"], "boom");
}

#[test]
fn error_event_emits_run_error() {
    let mut mapper = AguiMapper::new("t1", "r1");
    let out = mapper.handle(WsStreamEvent::Error {
        run_id: "r1".to_owned(),
        conversation_id: "t1".to_owned(),
        message: "oops".to_owned(),
    });
    assert_eq!(types(&out), vec!["RUN_ERROR"]);
    assert_eq!(out[0]["code"], "AGENT_ERROR");
    assert_eq!(out[0]["message"], "oops");
}

#[test]
fn delegate_event_wraps_inner_with_custom_prefix() {
    let mut mapper = AguiMapper::new("t1", "r1");
    let inner = Box::new(chat_chunk_event(chunk("hi", true)));
    let out = mapper.handle(WsStreamEvent::DelegateEvent {
        delegate_conversation_id: "child".to_owned(),
        agent_name: "worker".to_owned(),
        delegation_depth: 1,
        inner,
    });
    let kinds = types(&out);
    assert_eq!(kinds[0], "CUSTOM");
    assert_eq!(out[0]["name"], "delegate");
    assert_eq!(out[0]["value"]["depth"], 1);
    assert!(kinds.contains(&"TEXT_MESSAGE_START"));
    assert!(kinds.contains(&"TEXT_MESSAGE_END"));
}

#[test]
fn nested_delegate_depth_preserved() {
    let mut mapper = AguiMapper::new("t1", "r1");
    let inner_inner = Box::new(chat_chunk_event(chunk("x", true)));
    let inner = Box::new(WsStreamEvent::DelegateEvent {
        delegate_conversation_id: "grandchild".to_owned(),
        agent_name: "nested".to_owned(),
        delegation_depth: 2,
        inner: inner_inner,
    });
    let out = mapper.handle(WsStreamEvent::DelegateEvent {
        delegate_conversation_id: "child".to_owned(),
        agent_name: "worker".to_owned(),
        delegation_depth: 1,
        inner,
    });
    let depths: Vec<u64> = out
        .iter()
        .filter(|e| e["type"] == "CUSTOM" && e["name"] == "delegate")
        .filter_map(|e| e["value"]["depth"].as_u64())
        .collect();
    assert_eq!(depths, vec![1, 2]);
}

#[test]
fn unclosed_message_auto_closes_on_flush() {
    let mut mapper = AguiMapper::new("t1", "r1");
    mapper.handle(chat_chunk_event(chunk("partial", false)));
    let out = mapper.flush();
    assert_eq!(types(&out), vec!["TEXT_MESSAGE_END"]);
    // Subsequent flush is a no-op.
    assert!(mapper.flush().is_empty());
}

#[test]
fn tool_start_without_id_synthesizes_uuid() {
    let mut mapper = AguiMapper::new("t1", "r1");
    let out = mapper.handle(WsStreamEvent::ToolStart {
        run_id: "r1".to_owned(),
        conversation_id: "t1".to_owned(),
        tool_call_id: String::new(),
        tool_name: "noid".to_owned(),
        args: json!({}),
    });
    let id = out[0]["toolCallId"].as_str().unwrap();
    assert_eq!(id.len(), 36, "expected uuid; got {id}");
}

#[test]
fn assistant_message_is_silent() {
    let mut mapper = AguiMapper::new("t1", "r1");
    let out = mapper.handle(WsStreamEvent::AssistantMessage {
        run_id: "r1".to_owned(),
        conversation_id: "t1".to_owned(),
        content: "done".to_owned(),
        rich_content: None,
    });
    assert!(out.is_empty());
}
