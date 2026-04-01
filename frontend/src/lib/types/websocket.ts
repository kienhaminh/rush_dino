import type { ToolCall, RichContent } from './messages';
import type { InputRequestPayload } from './input-requests';

export type WsEventType =
  | 'chat_chunk'
  | 'assistant_reset'
  | 'assistant_message'
  | 'tool_start'
  | 'tool_end'
  | 'approval_request'
  | 'approval_result'
  | 'input_request'
  | 'user_message'
  | 'runtime_log_error'
  | 'task_review_ready'
  | 'pairing_request_created'
  | 'session_reset'
  | 'error';

export interface WsChatChunkEvent {
  type: 'chat_chunk';
  run_id?: string;
  conversation_id: string;
  delta: string;
  tool_calls: ToolCall[];
  done: boolean;
  thinking_delta?: string;
}

export interface WsAssistantResetEvent {
  type: 'assistant_reset';
  run_id?: string;
  conversation_id: string;
}

export interface WsAssistantMessageEvent {
  type: 'assistant_message';
  run_id?: string | null;
  conversation_id: string;
  content: string;
  rich_content?: RichContent | null;
}

export interface WsToolStartEvent {
  type: 'tool_start';
  run_id?: string;
  conversation_id?: string;
  tool_name: string;
  args: Record<string, unknown>;
}

export interface WsToolEndEvent {
  type: 'tool_end';
  run_id?: string;
  conversation_id?: string;
  tool_name: string;
  result: string;
  is_error: boolean;
}

export interface WsApprovalRequestEvent {
  type: 'approval_request';
  request_id: string;
  run_id?: string | null;
  conversation_id: string;
  tool: string;
  args: Record<string, unknown>;
}

export interface WsApprovalResultEvent {
  type: 'approval_result';
  request_id: string;
  run_id?: string | null;
  approved: boolean;
  error?: string;
}

export interface WsInputRequestEvent {
  type: 'input_request';
  request_id: string;
  run_id?: string | null;
  conversation_id: string;
  payload: InputRequestPayload;
  created_at: string;
}

export interface WsErrorEvent {
  type: 'error';
  run_id?: string;
  conversation_id?: string;
  message: string;
}

export interface WsRuntimeLogErrorEvent {
  type: 'runtime_log_error';
  id: string;
  level: 'error' | 'fatal' | string;
  target: string;
  message: string;
  fields?: Record<string, unknown> | null;
  created_at: string;
}

/** Emitted by the gateway router when a channel (Telegram, Discord, etc.)
 *  receives a user message — lets the workspace UI show it in real-time. */
export interface WsUserMessageEvent {
  type: 'user_message';
  conversation_id: string;
  content: string;
  channel: string;
}

/** Emitted when a kanban task completes and is ready for review. */
export interface WsTaskReviewReadyEvent {
  type: 'task_review_ready';
  task_id: string;
  conversation_id: string;
  agent_name: string;
  title: string;
  result: string;
  notification: string;
}

/** Emitted when the active profile changes and all sessions are cleared. */
export interface WsSessionResetEvent {
  type: 'session_reset';
}

/** Emitted when a new Telegram/Discord pairing request is created. */
export interface WsPairingRequestCreatedEvent {
  type: 'pairing_request_created';
  id: string;
  channel_id: string;
  sender_id: string;
  sender_display: string | null;
  code: string;
  created_at: string;
}

/** Wraps an inner event from a delegated agent with metadata so the frontend
 *  can route it to the correct nested timeline. */
export interface WsDelegateEvent {
  type: 'delegate_event';
  delegate_conversation_id: string;
  agent_name: string;
  delegation_depth: number;
  inner: WsEvent;
}

export type WsEvent =
  | WsChatChunkEvent
  | WsAssistantResetEvent
  | WsAssistantMessageEvent
  | WsToolStartEvent
  | WsToolEndEvent
  | WsApprovalRequestEvent
  | WsApprovalResultEvent
  | WsInputRequestEvent
  | WsErrorEvent
  | WsRuntimeLogErrorEvent
  | WsUserMessageEvent
  | WsTaskReviewReadyEvent
  | WsPairingRequestCreatedEvent
  | WsSessionResetEvent
  | WsDelegateEvent;
