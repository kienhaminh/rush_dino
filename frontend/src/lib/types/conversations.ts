import type { Message, RichContent } from './messages';
import type { PendingInputRequest, InputRequestPayload, InputRequestStatus } from './input-requests';
import type { RunSnapshot } from './runs';
import type { ConversationMetrics } from './usage';

export interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface ConversationDetail {
  id: string;
  messages: Message[];
  pendingInputRequests: PendingInputRequest[];
  latestMetrics?: ConversationMetrics | null;
  activeRun?: RunSnapshot | null;
}

export type ConversationItem =
  | { kind: 'user'; id: string; content: string }
  | {
      kind: 'assistant';
      id: string;
      content: string;
      richContent?: RichContent | null;
      runId?: string | null;
    }
  | { kind: 'thinking'; id: string; content?: string; done?: boolean }
  | {
      kind: 'tool_use';
      id: string;
      tool_name: string;
      args: Record<string, unknown>;
      result?: string;
      is_error?: boolean;
      status: 'running' | 'done' | 'error';
    }
  | {
      kind: 'approval';
      id: string;
      request_id: string;
      tool: string;
      args: Record<string, unknown>;
    }
  | {
      kind: 'input_request';
      id: string;
      requestId: string;
      runId?: string | null;
      conversationId: string;
      payload: InputRequestPayload;
      createdAt: string;
      status: 'pending' | InputRequestStatus;
      values?: Record<string, unknown> | null;
    }
  | { kind: 'error'; id: string; message: string };
