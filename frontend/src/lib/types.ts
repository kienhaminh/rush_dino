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

// ---------------------------------------------------------------------------
// Knowledge graph types — mirror the Rust models
// ---------------------------------------------------------------------------

export interface GraphStats {
  sources: number;
  entities: number;
  relations: number;
  evidence: number;
}

export interface GraphFact {
  id: string;
  subject: string;
  predicate: string;
  object: string;
  confidence: number;
  support_count: number;
  last_seen_at: string;
  evidence: string[];
}

export interface GraphEntity {
  id: string;
  canonical_name: string;
  entity_type?: string | null;
  last_seen_at: string;
}

export interface GraphNode {
  entity: GraphEntity;
  outgoing: GraphFact[];
  incoming: GraphFact[];
}

export interface IngestStats {
  scanned: number;
  ingested: number;
  skipped: number;
  failed: number;
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

export interface DashboardAuthStatusResponse {
  enabled: boolean;
  authenticated: boolean;
  expiresAt?: string | null;
}

export interface RuntimeLogRecord {
  id: string;
  level: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' | string;
  target: string;
  message: string;
  fields?: Record<string, unknown> | null;
  createdAt: string;
}

export interface FetchLogsResponse {
  items: RuntimeLogRecord[];
  nextCursor?: string;
}

export interface ChannelStatusSummary {
  id: string;
  label: string;
  enabled: boolean;
  configured: boolean;
  status: 'healthy' | 'needs_attention' | 'disabled' | string;
  issue?: string | null;
}

export interface PendingApprovalSummary {
  requestId: string;
  sessionId: string;
  conversationId: string;
  runId?: string | null;
  tool: string;
  args?: Record<string, unknown>;
}

export interface ChannelPairingPendingRequest {
  id: string;
  channelId: string;
  senderId: string;
  senderDisplay?: string | null;
  replyTarget: string;
  code: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
}

export interface ChannelPairedUser {
  id: string;
  channelId: string;
  senderId: string;
  senderDisplay?: string | null;
  approvedAt: string;
  lastSeenAt: string;
}

export interface ChannelPairingState {
  channelId: string;
  pending: ChannelPairingPendingRequest[];
  paired: ChannelPairedUser[];
}

export interface ApprovalAuditRecord {
  id: string;
  status: string;
  tool?: string | null;
  requestId?: string | null;
  runId?: string | null;
  sessionId?: string | null;
  createdAt: string;
}

export interface ApprovalsResponse {
  pending: PendingApprovalSummary[];
  recent: ApprovalAuditRecord[];
}

export interface SystemIncidentRecord {
  id: string;
  level: string;
  target: string;
  message: string;
  createdAt: string;
}

export interface SystemSummaryResponse {
  generatedAt: string;
  status: 'healthy' | 'degraded' | string;
  uptimeSecs: number;
  activeProvider: string;
  effectiveProfileId?: string | null;
  defaultProfileId?: string | null;
  runtimeUnavailableError?: string | null;
  profilesCount: number;
  fallbackProfileIds: string[];
  channels: ChannelStatusSummary[];
  approvals: {
    pendingCount: number;
    pending: PendingApprovalSummary[];
  };
  runs: {
    totalCount: number;
    activeCount: number;
    queuedCount: number;
    blockedCount: number;
    failedCount: number;
    mostRecentId?: string | null;
  };
  conversations: {
    totalCount: number;
    updatedLastHour: number;
    mostRecentId?: string | null;
    mostRecentTitle?: string | null;
  };
  security: {
    hmacAuthEnabled: boolean;
    allowedOriginsCount: number;
    sandboxEnabled: boolean;
    sandboxAllowNetwork: boolean;
    sandboxWorkspaceRoot: string;
  };
  incidents: SystemIncidentRecord[];
  agentConfig?: {
    thinkingLevel: 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'adaptive' | string;
    maxIterations: number;
    maxContextTokens: number;
  } | null;
}

export interface DoctorFinding {
  code: string;
  severity: 'error' | 'warn' | 'info' | string;
  title: string;
  detail: string;
  action: string;
  fixable: boolean;
}

export interface DoctorReportResponse {
  generatedAt: string;
  status: 'healthy' | 'attention' | 'degraded' | string;
  summary: {
    errorCount: number;
    warnCount: number;
    infoCount: number;
  };
  findings: DoctorFinding[];
}

export interface SoulMemoryFile {
  name: string;
  path: string;
  exists: boolean;
  updatedAt?: string | null;
  sizeBytes: number;
  lineCount: number;
  content: string;
}

export interface RegisteredTool {
  name: string;
  description: string;
  /** True = active from session start. False = pool-only, activated on demand via tool_search. */
  isCore: boolean;
}

export interface InjectedContextFile {
  label: string;
  content: string;
  truncated: boolean;
  originalLen: number;
}

export interface SoulMemoryStateResponse {
  dataDir: string;
  bootstrap: SoulMemoryFile;
  soul: SoulMemoryFile;
  memory: SoulMemoryFile;
  identityFiles: SoulMemoryFile[];
  dailyFiles: SoulMemoryFile[];
  /** Files as actually injected into the system prompt (truncation applied). */
  injectedContext: InjectedContextFile[];
  truncationWarnings: string[];
}

export interface SessionSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  status: 'active' | 'idle' | 'awaiting_approval' | 'blocked' | string;
  messageCount: number;
  lastRole?: string | null;
  lastMessagePreview?: string | null;
  pendingApprovalCount: number;
  activeRunCount: number;
  queuedRunCount: number;
  lastRunId?: string | null;
  contextWindow?: {
    provider?: string | null;
    model?: string | null;
    limitTokens?: number | null;
    promptTokens?: number | null;
    completionTokens?: number | null;
    totalTokens?: number | null;
    usageRatio?: number | null;
    measuredAt?: string | null;
  };
}

export type GatewayAdapterStatus =
  | 'disabled'
  | 'starting'
  | 'connected'
  | 'degraded'
  | 'disconnected';

export type GatewayRichDeliveryMode = 'native' | 'degraded' | 'unsupported';

export interface GatewayAdapterCapabilities {
  plainText: boolean;
  markdown: boolean;
  codeBlocks: boolean;
  images: GatewayRichDeliveryMode;
  linkButtons: GatewayRichDeliveryMode;
}

export interface GatewayAdapterState {
  channelId: string;
  status: GatewayAdapterStatus;
  lastEventAt?: string | null;
  lastError?: string | null;
  reconnectCount: number;
  capabilities: GatewayAdapterCapabilities;
}

export interface GatewaySessionSummary {
  id: string;
  channelId: string;
  senderId: string;
  conversationId: string;
  lastActive: string;
  lastRunId?: string | null;
  lastDeliveryAt?: string | null;
  lastError?: string | null;
  status: string;
  pendingApprovalCount: number;
  activeRunCount: number;
  queuedRunCount: number;
  lastRunState?: RunState | null;
}

export interface GatewayChannelActivity {
  channelId: string;
  sessionCount: number;
  recentRunCount: number;
  activeRunCount: number;
  blockedRunCount: number;
}

export interface GatewayFailureRecord {
  kind: string;
  channelId?: string | null;
  sessionId?: string | null;
  runId?: string | null;
  message: string;
  createdAt: string;
}

export interface GatewaySummaryResponse {
  generatedAt: string;
  adapters: GatewayAdapterState[];
  sessions: {
    totalCount: number;
    activeLastHour: number;
    mostRecentId?: string | null;
    mostRecentAt?: string | null;
  };
  runs: {
    totalCount: number;
    activeCount: number;
    blockedCount: number;
    failedCount: number;
    mostRecentId?: string | null;
  };
  channelActivity: GatewayChannelActivity[];
  recentFailures: GatewayFailureRecord[];
}

export interface SkillRecord {
  name: string;
  description: string;
  instructions: string;
  path: string;
  tools: string[];
  /** Bundled / system skills — not editable or deletable via the dashboard. */
  isBuiltIn: boolean;
}

export type RunKind = 'assistant' | 'workflow';
export type RunState =
  | 'queued'
  | 'running'
  | 'awaiting_approval'
  | 'blocked'
  | 'completed'
  | 'failed'
  | 'aborted';

export interface RunPolicySnapshot {
  decision: string;
  approvalState: string;
  sandboxState: string;
  effectiveScope: string;
  reason?: string | null;
}

export interface RunSnapshot {
  id: string;
  kind: RunKind;
  state: RunState;
  source?: string | null;
  channelId?: string | null;
  senderId?: string | null;
  gatewaySessionId?: string | null;
  sessionId?: string | null;
  conversationId?: string | null;
  workflowId?: string | null;
  title: string;
  inputText?: string | null;
  outputText?: string | null;
  provider: string;
  model: string;
  fallbackProfileId?: string | null;
  queuePosition?: number | null;
  activeTool?: string | null;
  abortRequested: boolean;
  policy: RunPolicySnapshot;
  error?: string | null;
  createdAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
  updatedAt: string;
}

export interface RunEventRecord {
  id: string;
  runId: string;
  eventType: string;
  state?: RunState | null;
  toolName?: string | null;
  message?: string | null;
  policy: RunPolicySnapshot;
  createdAt: string;
}

export interface RunDetail {
  snapshot: RunSnapshot;
  events: RunEventRecord[];
}

export interface UsageMetricRow {
  id: string;
  conversationId: string;
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  inputCost: number;
  outputCost: number;
  totalCost: number;
  createdAt: string;
}

export interface UsageTotals {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  inputCost: number;
  outputCost: number;
  totalCost: number;
  rowCount: number;
}

export interface UsageAggregateKey {
  key: string;
  totals: UsageTotals;
}

export interface DailyUsageEntry {
  date: string;
  totals: UsageTotals;
}

export interface UsageMetricsResponse {
  items: UsageMetricRow[];
  aggregates: {
    totals: UsageTotals;
    byProvider: UsageAggregateKey[];
    byModel: UsageAggregateKey[];
  };
  daily: DailyUsageEntry[];
}

// ---------------------------------------------------------------------------
// Workspace conversation types — richer than flat Message[]
// ---------------------------------------------------------------------------

export type WsEventType =
  | 'chat_chunk'
  | 'assistant_reset'
  | 'assistant_message'
  | 'tool_start'
  | 'tool_end'
  | 'approval_request'
  | 'approval_result'
  | 'user_message'
  | 'runtime_log_error'
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

export type WsEvent =
  | WsChatChunkEvent
  | WsAssistantResetEvent
  | WsAssistantMessageEvent
  | WsToolStartEvent
  | WsToolEndEvent
  | WsApprovalRequestEvent
  | WsApprovalResultEvent
  | WsErrorEvent
  | WsRuntimeLogErrorEvent
  | WsUserMessageEvent
  | WsTaskReviewReadyEvent;

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
  | { kind: 'error'; id: string; message: string };

// ---------------------------------------------------------------------------
// Sandbox policy types — mirror the Rust SandboxPolicy YAML structs
// ---------------------------------------------------------------------------

export interface PathRule {
  path: string;
  mode: 'read-only' | 'read-write';
}

export interface NetworkRule {
  host: string;
  port: number;
  methods: string[];
  paths: string[];
}

export interface SandboxFilesystemPolicy {
  default: 'allow' | 'deny';
  allow: PathRule[];
  deny: string[];
}

export interface SandboxInboundFilter {
  max_size_kb: number;
  strip_patterns: string[];
  block_on_match: boolean;
}

export interface McpServerStatus {
  name: string;
  url: string;
  connected: boolean;
  tool_count: number;
}

export interface SandboxMcpPolicy {
  default: 'allow' | 'deny';
  servers: Record<string, 'allow' | 'deny'>;
  inbound: SandboxInboundFilter;
}

export interface SandboxProcessPolicy {
  allow_privileged: boolean;
  max_concurrent: number;
  deny_commands: string[];
  timeout_seconds?: number;
  inbound?: SandboxInboundFilter;
}

export interface SandboxNetworkInboundFilter {
  max_size_kb: number;
  strip_headers: string[];
  allowed_content_types: string[];
}

export interface SandboxNetworkPolicy {
  default: 'allow' | 'deny';
  on_block: 'prompt' | 'deny' | 'hard-stop';
  allow: NetworkRule[];
  inbound?: SandboxNetworkInboundFilter;
}

export interface SandboxInferencePolicy {
  enabled: boolean;
  route_via: string;
  strip_agent_credentials: boolean;
  inject_provider: string;
}

export interface CredentialProvider {
  name: string;
  inject: Record<string, string>;
}

export interface SandboxPolicy {
  version: string;
  sandbox: {
    filesystem: SandboxFilesystemPolicy;
    process: SandboxProcessPolicy;
    network: SandboxNetworkPolicy;
    inference: SandboxInferencePolicy;
    mcp?: SandboxMcpPolicy;
  };
  providers: CredentialProvider[];
}

export interface AuditEntry {
  id: number;
  session_id: string;
  agent_id: string | null;
  ts: string;
  category: 'filesystem' | 'network' | 'process' | 'inference' | 'mcp';
  decision: 'allow' | 'deny' | 'route' | 'pending';
  binary: string | null;
  destination: string | null;
  method: string | null;
  path: string | null;
  reason: string | null;
  direction?: 'outbound' | 'inbound';
  server?: string;
  tool?: string;
  filtered?: boolean;
}
