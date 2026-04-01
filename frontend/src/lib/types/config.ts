// ---------------------------------------------------------------------------
// Config types — mirror the Rust AppConfig / CredentialsConfig structs
// ---------------------------------------------------------------------------

export type ProviderKind = 'ollama' | 'openai' | 'anthropic' | 'openai_codex' | 'plugin';

export type AuthMethod = 'apikey' | 'oauth' | 'none';

export interface ProviderProfile {
  id: string;
  name: string;
  provider_kind: ProviderKind;
  auth_method: AuthMethod;
  default_model: string;
  base_url?: string;
}

export interface OllamaConfig {
  base_url: string;
  model: string;
}

export interface ProviderModelConfig {
  model: string;
}

export interface ChannelConfig {
  enabled: boolean;
  show_typing?: boolean;
  access?: ChannelAccessConfig;
}

export interface TelegramChannelConfig extends ChannelConfig {
  native_streaming?: boolean;
}

export interface MobileGatewayConfig extends ChannelConfig {
  publish_host: string;
}

export type DmPolicy = 'open' | 'pairing' | 'allowlist' | 'disabled';

export interface ChannelAccessConfig {
  dm_policy: DmPolicy;
  allow_from: string[];
}

export interface GatewayConfig {
  telegram: TelegramChannelConfig;
  discord: ChannelConfig;
  slack: ChannelConfig;
  webchat: ChannelConfig;
  mobile: MobileGatewayConfig;
}

export interface SecurityConfig {
  hmac_auth_enabled: boolean;
  dashboard_auth_enabled: boolean;
  allowed_origins: string[];
}

export interface ShellExecSandboxConfig {
  enabled: boolean;
  workspace_root: string;
  allow_network: boolean;
  extra_write_roots: string[];
}

export interface ExecutionConfig {
  shell_exec_sandbox: ShellExecSandboxConfig;
}

export interface KnowledgeGraphConfig {
  enabled: boolean;
  uri?: string;
  auto_context: boolean;
  max_context_facts: number;
  max_extraction_chars: number;
  backfill_on_startup: boolean;
  extract_from_conversations: boolean;
  extract_from_memory: boolean;
  extract_from_documents: boolean;
}

export interface McpServerConfig {
  name: string;
  url: string;
  auth_header?: string | null;
}

export interface McpServerConnectionStatus {
  name: string;
  status: { kind: 'connecting' } | { kind: 'connected' } | { kind: 'error'; message: string };
  tool_count: number;
  last_seen_secs?: number | null;
}

export interface AppConfigView {
  host: string;
  port: number;
  /** Legacy single-provider field — kept for backward compat with older backends. */
  active_provider?: ProviderKind;
  /** Multi-provider field. When set, takes precedence over active_provider. */
  active_providers?: ProviderKind[];
  profiles: ProviderProfile[];
  default_profile_id?: string;
  fallback_profile_ids: string[];
  ollama: OllamaConfig;
  openai: ProviderModelConfig;
  anthropic: ProviderModelConfig;
  openai_codex: ProviderModelConfig;
  gateway: GatewayConfig;
  allowed_chat_ids: number[];
  security: SecurityConfig;
  execution: ExecutionConfig;
  knowledge_graph: KnowledgeGraphConfig;
  mcp_servers: McpServerConfig[];
  [key: string]: unknown;
}

export interface ProfileSecrets {
  api_key?: string;
  access_token?: string;
  refresh_token?: string;
  token_expires_at?: number;
}

export interface KgCredentials {
  username?: string;
  password?: string;
  api_key?: string;
}

/** All credential fields are optional strings. */
export interface CredentialsView {
  profiles: Record<string, ProfileSecrets>;
  openai_api_key?: string;
  anthropic_api_key?: string;
  brave_api_key?: string;
  gemini_api_key?: string;
  telegram_bot_token?: string;
  discord_bot_token?: string;
  slack_bot_token?: string;
  slack_app_token?: string;
  codex_access_token?: string;
  codex_refresh_token?: string;
  codex_token_expires_at?: number;
  knowledge_graph?: KgCredentials;
}
