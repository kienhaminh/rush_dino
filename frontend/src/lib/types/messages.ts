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
  rich_content?: RichContent | null;
  thinking?: string | null;
  created_at?: string;
}

export interface RichContent {
  fallbackText: string;
  blocks: RichContentBlock[];
}

export type TextFormat = 'plain_text' | 'markdown';

export interface LinkTarget {
  label: string;
  url: string;
}

export type RichContentBlock =
  | {
      type: 'formatted_text';
      text: string;
      format: TextFormat;
    }
  | {
      type: 'code_block';
      code: string;
      language?: string | null;
    }
  | {
      type: 'link_list';
      items: LinkTarget[];
    }
  | {
      type: 'image';
      url: string;
      alt?: string | null;
    }
  | {
      type: 'link_buttons';
      items: LinkTarget[];
    };

export interface ChatChunk {
  conversation_id: string;
  delta: string;
  tool_calls: ToolCall[];
  done: boolean;
}
