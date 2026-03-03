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

// ---------------------------------------------------------------------------
// Config types — mirror the Rust AppConfig / CredentialsConfig structs
// ---------------------------------------------------------------------------

export type ProviderKind = 'ollama' | 'openai' | 'anthropic' | 'codex' | 'plugin';

export interface OllamaConfig {
  base_url: string;
  model: string;
}

export interface ProviderModelConfig {
  model: string;
}

export interface ChannelConfig {
  enabled: boolean;
}

export interface GatewayConfig {
  telegram: ChannelConfig;
  discord: ChannelConfig;
  slack: ChannelConfig;
  webchat: ChannelConfig;
}

export interface SecurityConfig {
  hmac_auth_enabled: boolean;
  allowed_origins: string[];
}

export interface AppConfigView {
  host: string;
  port: number;
  active_provider: ProviderKind;
  ollama: OllamaConfig;
  openai: ProviderModelConfig;
  anthropic: ProviderModelConfig;
  codex: ProviderModelConfig;
  gateway: GatewayConfig;
  security: SecurityConfig;
  [key: string]: unknown;
}

/** All credential fields are optional strings. Non-empty values are returned as "***". */
export interface CredentialsView {
  openai_api_key?: string;
  anthropic_api_key?: string;
  brave_api_key?: string;
  telegram_bot_token?: string;
  discord_bot_token?: string;
  slack_bot_token?: string;
  slack_app_token?: string;
}
