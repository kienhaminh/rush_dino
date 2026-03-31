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
