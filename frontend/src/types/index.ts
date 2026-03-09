export type Role = 'system' | 'user' | 'assistant' | 'tool';

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface Message {
  id: string;
  role: Role;
  content: string;
  tool_calls?: ToolCall[];
  rich_content?: {
    fallbackText: string;
    blocks: Array<Record<string, unknown>>;
  } | null;
  created_at?: string;
}

export interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface ChatChunk {
  conversation_id: string;
  delta: string;
  tool_calls: ToolCall[];
  done: boolean;
}
