import { useState } from 'react';
import { SandboxAuditFeed } from './sandbox-audit-feed';
import { SandboxMcpPolicyPanel } from './sandbox-mcp-policy-panel';
import { SandboxNetworkPolicyPanel } from './sandbox-network-policy-panel';
import { SandboxBashPolicyPanel } from './sandbox-bash-policy-panel';
import type {
  AuditEntry,
  McpServerStatus,
  SandboxMcpPolicy,
  SandboxNetworkPolicy,
  SandboxProcessPolicy,
} from '@/lib/types';

const DEFAULT_MCP_POLICY: SandboxMcpPolicy = {
  default: 'deny',
  servers: {},
  inbound: { max_size_kb: 64, strip_patterns: [], block_on_match: false },
};

const DEFAULT_NETWORK_POLICY: SandboxNetworkPolicy = {
  default: 'deny',
  on_block: 'prompt',
  allow: [],
};

const DEFAULT_BASH_POLICY: SandboxProcessPolicy = {
  allow_privileged: false,
  max_concurrent: 3,
  deny_commands: [],
  timeout_seconds: 30,
  inbound: {
    max_size_kb: 32,
    strip_patterns: ['AKIA[A-Z0-9]{16}', 'sk-[A-Za-z0-9]{32,}', 'ghp_[A-Za-z0-9]{36}'],
    block_on_match: false,
  },
};

type PolicyTab = 'mcp' | 'network' | 'bash';

const CATEGORY_FILTERS = ['all', 'network', 'mcp', 'process', 'filesystem', 'inference'] as const;
type CategoryFilter = (typeof CATEGORY_FILTERS)[number];

const CATEGORY_LABELS: Record<CategoryFilter, string> = {
  all: 'All',
  network: 'Network',
  mcp: 'MCP',
  process: 'Bash',
  filesystem: 'FS',
  inference: 'Inference',
};

interface Props {
  /** Display label shown in the section header */
  label: string;
  /** Optional badge element rendered next to the label (e.g. status badge) */
  badge?: React.ReactNode;
  /** Audit entries to display in the feed */
  auditEntries: AuditEntry[];
  loadingAudit: boolean;
  mcpServers: McpServerStatus[];
  /** Initial MCP policy — uses default deny if null */
  mcpPolicy: SandboxMcpPolicy | null;
  /** Initial Network policy — uses default deny if null */
  networkPolicy: SandboxNetworkPolicy | null;
  /** Initial Bash policy — uses default if null */
  bashPolicy: SandboxProcessPolicy | null;
  onMcpPolicyChange: (policy: SandboxMcpPolicy) => void;
  onApplyMcp: (policy: SandboxMcpPolicy) => Promise<void>;
  onNetworkPolicyChange: (policy: SandboxNetworkPolicy) => void;
  onApplyNetwork: (policy: SandboxNetworkPolicy) => Promise<void>;
  onBashPolicyChange: (policy: SandboxProcessPolicy) => void;
  onApplyBash: (policy: SandboxProcessPolicy) => Promise<void>;
}

export function SandboxAgentSection({
  label,
  badge,
  auditEntries,
  loadingAudit,
  mcpServers,
  mcpPolicy,
  networkPolicy,
  bashPolicy,
  onMcpPolicyChange,
  onApplyMcp,
  onNetworkPolicyChange,
  onApplyNetwork,
  onBashPolicyChange,
  onApplyBash,
}: Props) {
  const [activeTab, setActiveTab] = useState<PolicyTab>('network');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');

  const filteredEntries =
    categoryFilter === 'all'
      ? auditEntries
      : auditEntries.filter((e) => e.category === categoryFilter);

  return (
    <div className="flex flex-col rounded-xl border border-border/60 bg-card/80 overflow-hidden">
      {/* Section header */}
      <div className="flex items-center gap-3 border-b border-border/60 px-4 py-3">
        <span className="text-sm font-semibold text-foreground">{label}</span>
        {badge}
        <div className="ml-auto flex">
          {(['mcp', 'network', 'bash'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`border-b-2 px-3 py-1 text-[12px] capitalize transition-colors ${
                activeTab === tab
                  ? 'border-primary font-semibold text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab === 'mcp' ? 'MCP' : tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Split layout */}
      <div className="grid flex-1 grid-cols-[1fr_300px]" style={{ minHeight: '320px' }}>
        {/* Left: unified audit feed with category filter */}
        <div className="overflow-y-auto border-r border-border/60 p-4">
          <div className="mb-3 flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Live Requests
            </span>
            <div className="ml-auto flex gap-1">
              {CATEGORY_FILTERS.map((f) => (
                <button
                  key={f}
                  onClick={() => setCategoryFilter(f)}
                  className={`rounded px-2 py-0.5 text-[10px] capitalize transition-colors ${
                    categoryFilter === f
                      ? 'bg-primary/20 text-primary'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {CATEGORY_LABELS[f]}
                </button>
              ))}
            </div>
          </div>
          <SandboxAuditFeed entries={filteredEntries} loading={loadingAudit} />
        </div>

        {/* Right: policy panel for active tab */}
        {activeTab === 'mcp' && (
          <SandboxMcpPolicyPanel
            servers={mcpServers}
            policy={mcpPolicy ?? DEFAULT_MCP_POLICY}
            onPolicyChange={onMcpPolicyChange}
            onApply={onApplyMcp}
          />
        )}
        {activeTab === 'network' && (
          <SandboxNetworkPolicyPanel
            policy={networkPolicy ?? DEFAULT_NETWORK_POLICY}
            onPolicyChange={onNetworkPolicyChange}
            onApply={onApplyNetwork}
          />
        )}
        {activeTab === 'bash' && (
          <SandboxBashPolicyPanel
            policy={bashPolicy ?? DEFAULT_BASH_POLICY}
            onPolicyChange={onBashPolicyChange}
            onApply={onApplyBash}
          />
        )}
      </div>
    </div>
  );
}
