# Sandbox Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplify the sandbox page to two persistent sections — Main agent (always visible) and Team agents (with selector) — each showing a live request audit feed and per-agent policy controls.

**Architecture:** Extract the right-panel policy editors from the existing tab components into standalone panels, then compose them inside a new `SandboxAgentSection` component that provides a unified split layout (filtered audit feed left, policy sub-tabs right). The `SandboxMonitorPage` state is slimmed down to manage two independent audit feeds and the team agent selection.

**Tech Stack:** React, TypeScript, Tailwind CSS, existing `SandboxAuditFeed` / `SandboxInboundFilterEditor` components, existing API functions (`getSessionAuditLog`, `fetchAgentSessions`, `patchSession*Policy`, `putAgentSandbox`).

---

## File Map

| Action | File |
|--------|------|
| Create | `frontend/src/pages/sandbox/components/sandbox-mcp-policy-panel.tsx` |
| Create | `frontend/src/pages/sandbox/components/sandbox-network-policy-panel.tsx` |
| Create | `frontend/src/pages/sandbox/components/sandbox-bash-policy-panel.tsx` |
| Create | `frontend/src/pages/sandbox/components/sandbox-agent-section.tsx` |
| Rewrite | `frontend/src/pages/sandbox/SandboxMonitorPage.tsx` |
| Delete | `frontend/src/pages/sandbox/tabs/sandbox-mcp-tab.tsx` |
| Delete | `frontend/src/pages/sandbox/tabs/sandbox-network-tab.tsx` |
| Delete | `frontend/src/pages/sandbox/tabs/sandbox-bash-tab.tsx` |

---

## Task 1: Create `sandbox-mcp-policy-panel.tsx`

Extract the MCP policy right panel from `sandbox-mcp-tab.tsx` into a standalone component.

**Files:**
- Create: `frontend/src/pages/sandbox/components/sandbox-mcp-policy-panel.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { Button } from '@/components/ui/button';
import { SandboxInboundFilterEditor } from './sandbox-inbound-filter-editor';
import type { McpServerStatus, SandboxMcpPolicy } from '@/lib/types';

interface Props {
  servers: McpServerStatus[];
  policy: SandboxMcpPolicy;
  onPolicyChange: (policy: SandboxMcpPolicy) => void;
  onApply: (policy: SandboxMcpPolicy) => Promise<void>;
}

function ServerToggle({
  server,
  decision,
  onChange,
}: {
  server: McpServerStatus;
  decision: 'allow' | 'deny';
  onChange: (name: string, decision: 'allow' | 'deny') => void;
}) {
  const isAllow = decision === 'allow';
  return (
    <div
      className={`flex items-center justify-between rounded-md border p-3 ${
        isAllow ? 'border-border/60' : 'border-red-500/20'
      }`}
    >
      <div>
        <div className="text-[12px] font-medium text-foreground">{server.name}</div>
        <div
          className={`mt-0.5 text-[10px] ${server.connected ? 'text-green-400' : 'text-muted-foreground'}`}
        >
          {server.connected ? `● connected · ${server.tool_count} tools` : '○ disconnected'}
        </div>
      </div>
      <button
        onClick={() => onChange(server.name, isAllow ? 'deny' : 'allow')}
        className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold transition-colors ${
          isAllow
            ? 'border-blue-500/40 bg-blue-500/10 text-blue-400'
            : 'border-red-500/40 bg-red-500/10 text-red-400'
        }`}
      >
        {isAllow ? 'ALLOW' : 'DENY'}
      </button>
    </div>
  );
}

export function SandboxMcpPolicyPanel({ servers, policy, onPolicyChange, onApply }: Props) {
  function toggleServer(name: string, decision: 'allow' | 'deny') {
    onPolicyChange({ ...policy, servers: { ...policy.servers, [name]: decision } });
  }

  return (
    <div className="overflow-y-auto p-4">
      <div className="mb-4">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-orange-400">
            ↑ Outbound
          </span>
          <span className="text-[10px] text-muted-foreground">What agent can call</span>
        </div>
        <div className="space-y-2">
          {servers.length === 0 ? (
            <div className="text-[11px] text-muted-foreground">No MCP servers configured</div>
          ) : (
            servers.map((server) => (
              <ServerToggle
                key={server.name}
                server={server}
                decision={policy.servers[server.name] ?? policy.default}
                onChange={toggleServer}
              />
            ))
          )}
        </div>
      </div>

      <div className="mb-4">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-green-400">
            ↓ Inbound
          </span>
          <span className="text-[10px] text-muted-foreground">Response filtering</span>
        </div>
        <SandboxInboundFilterEditor
          value={policy.inbound}
          onChange={(inbound) => onPolicyChange({ ...policy, inbound })}
        />
      </div>

      <Button size="sm" className="w-full text-xs" onClick={() => void onApply(policy)}>
        Apply Policy
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Verify file compiles**

```bash
cd /Users/kien.ha/Code/RushDino/frontend
npx tsc --noEmit 2>&1 | grep sandbox-mcp-policy-panel
```

Expected: no errors for this file.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/sandbox/components/sandbox-mcp-policy-panel.tsx
git commit -m "feat(sandbox): extract MCP policy panel component"
```

---

## Task 2: Create `sandbox-network-policy-panel.tsx`

Extract the Network policy right panel from `sandbox-network-tab.tsx`.

**Files:**
- Create: `frontend/src/pages/sandbox/components/sandbox-network-policy-panel.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { useState, useEffect } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SandboxInboundFilterEditor } from './sandbox-inbound-filter-editor';
import type { NetworkRule, SandboxNetworkPolicy } from '@/lib/types';

const DEFAULT_INBOUND = {
  max_size_kb: 256,
  strip_headers: [] as string[],
  allowed_content_types: [] as string[],
};

interface Props {
  policy: SandboxNetworkPolicy;
  onPolicyChange: (policy: SandboxNetworkPolicy) => void;
  onApply: (policy: SandboxNetworkPolicy) => Promise<void>;
}

export function SandboxNetworkPolicyPanel({ policy, onPolicyChange, onApply }: Props) {
  const [newHost, setNewHost] = useState('');
  const [newHeader, setNewHeader] = useState('');
  const inbound = policy.inbound ?? DEFAULT_INBOUND;

  function addAllowRule() {
    const trimmed = newHost.trim();
    if (!trimmed) return;
    const rule: NetworkRule = { host: trimmed, port: 443, methods: ['GET', 'POST'], paths: ['/*'] };
    onPolicyChange({ ...policy, allow: [...policy.allow, rule] });
    setNewHost('');
  }

  function removeAllowRule(index: number) {
    onPolicyChange({ ...policy, allow: policy.allow.filter((_, i) => i !== index) });
  }

  function addStripHeader() {
    const trimmed = newHeader.trim();
    if (!trimmed) return;
    onPolicyChange({
      ...policy,
      inbound: { ...inbound, strip_headers: [...inbound.strip_headers, trimmed] },
    });
    setNewHeader('');
  }

  function removeStripHeader(index: number) {
    onPolicyChange({
      ...policy,
      inbound: { ...inbound, strip_headers: inbound.strip_headers.filter((_, i) => i !== index) },
    });
  }

  return (
    <div className="overflow-y-auto p-4">
      <div className="mb-4">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-orange-400">
            ↑ Outbound
          </span>
        </div>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-muted-foreground">Default:</span>
          <Select
            value={policy.default}
            onValueChange={(v) => onPolicyChange({ ...policy, default: v as 'allow' | 'deny' })}
          >
            <SelectTrigger className="h-6 w-20 text-[10px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="allow">allow</SelectItem>
              <SelectItem value="deny">deny</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-[11px] text-muted-foreground">On block:</span>
          <Select
            value={policy.on_block}
            onValueChange={(v) =>
              onPolicyChange({ ...policy, on_block: v as SandboxNetworkPolicy['on_block'] })
            }
          >
            <SelectTrigger className="h-6 w-24 text-[10px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="prompt">prompt</SelectItem>
              <SelectItem value="deny">deny</SelectItem>
              <SelectItem value="hard-stop">hard-stop</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          {policy.allow.map((rule, i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded border border-border/60 px-2 py-1"
            >
              <span className="text-[11px] text-foreground">{rule.host}:{rule.port}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 text-muted-foreground hover:text-destructive"
                onClick={() => removeAllowRule(i)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <Input
            value={newHost}
            onChange={(e) => setNewHost(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addAllowRule()}
            placeholder="api.example.com"
            className="h-7 text-xs"
          />
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={addAllowRule}>
            <Plus className="h-3 w-3" />
          </Button>
        </div>
      </div>

      <div className="mb-4">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-green-400">
            ↓ Inbound
          </span>
        </div>
        <div className="mb-2">
          <div className="mb-1 text-[10px] text-muted-foreground">Max response size (KB)</div>
          <Input
            type="number"
            value={inbound.max_size_kb}
            onChange={(e) =>
              onPolicyChange({
                ...policy,
                inbound: { ...inbound, max_size_kb: Math.max(1, Number(e.target.value)) },
              })
            }
            className="h-7 w-24 text-xs"
          />
        </div>
        <div>
          <div className="mb-1 text-[10px] text-muted-foreground">Strip response headers</div>
          <div className="space-y-1">
            {inbound.strip_headers.map((h, i) => (
              <div key={i} className="flex items-center gap-2">
                <code className="flex-1 rounded bg-muted px-2 py-0.5 text-[10px]">{h}</code>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 text-muted-foreground hover:text-destructive"
                  onClick={() => removeStripHeader(i)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
          <div className="mt-1 flex gap-2">
            <Input
              value={newHeader}
              onChange={(e) => setNewHeader(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addStripHeader()}
              placeholder="Authorization"
              className="h-7 text-xs"
            />
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={addStripHeader}>
              <Plus className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </div>

      <Button size="sm" className="w-full text-xs" onClick={() => void onApply(policy)}>
        Apply (Hot-reload)
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Verify file compiles**

```bash
cd /Users/kien.ha/Code/RushDino/frontend
npx tsc --noEmit 2>&1 | grep sandbox-network-policy-panel
```

Expected: no errors for this file.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/sandbox/components/sandbox-network-policy-panel.tsx
git commit -m "feat(sandbox): extract network policy panel component"
```

---

## Task 3: Create `sandbox-bash-policy-panel.tsx`

Extract the Bash policy right panel from `sandbox-bash-tab.tsx`.

**Files:**
- Create: `frontend/src/pages/sandbox/components/sandbox-bash-policy-panel.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { SandboxInboundFilterEditor } from './sandbox-inbound-filter-editor';
import type { SandboxInboundFilter, SandboxProcessPolicy } from '@/lib/types';

const DEFAULT_INBOUND: SandboxInboundFilter = {
  max_size_kb: 32,
  strip_patterns: ['AKIA[A-Z0-9]{16}', 'sk-[A-Za-z0-9]{32,}', 'ghp_[A-Za-z0-9]{36}'],
  block_on_match: false,
};

interface Props {
  policy: SandboxProcessPolicy;
  onPolicyChange: (policy: SandboxProcessPolicy) => void;
  onApply: (policy: SandboxProcessPolicy) => Promise<void>;
}

export function SandboxBashPolicyPanel({ policy, onPolicyChange, onApply }: Props) {
  const [newCommand, setNewCommand] = useState('');
  const inbound = policy.inbound ?? DEFAULT_INBOUND;

  function addDeniedCommand() {
    const trimmed = newCommand.trim();
    if (!trimmed) return;
    onPolicyChange({ ...policy, deny_commands: [...policy.deny_commands, trimmed] });
    setNewCommand('');
  }

  function removeDeniedCommand(index: number) {
    onPolicyChange({ ...policy, deny_commands: policy.deny_commands.filter((_, i) => i !== index) });
  }

  return (
    <div className="overflow-y-auto p-4">
      <div className="mb-4">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-orange-400">
            ↑ Outbound
          </span>
          <span className="text-[10px] text-muted-foreground">Command controls</span>
        </div>
        <div className="mb-3 space-y-2">
          <div>
            <div className="mb-1 text-[10px] text-muted-foreground">Denied commands</div>
            <div className="flex flex-wrap gap-1.5">
              {policy.deny_commands.map((cmd, i) => (
                <div
                  key={i}
                  className="flex items-center gap-1 rounded border border-red-500/20 bg-red-500/10 px-2 py-0.5"
                >
                  <code className="text-[10px] text-red-400">{cmd}</code>
                  <button
                    onClick={() => removeDeniedCommand(i)}
                    className="text-red-400/60 hover:text-red-400"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-1.5 flex gap-2">
              <Input
                value={newCommand}
                onChange={(e) => setNewCommand(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addDeniedCommand()}
                placeholder="e.g. rm -rf"
                className="h-7 font-mono text-xs"
              />
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={addDeniedCommand}>
                <Plus className="h-3 w-3" />
              </Button>
            </div>
          </div>
          <div className="flex items-center justify-between rounded border border-border/60 px-3 py-2">
            <span className="text-[11px] text-foreground">Allow privileged</span>
            <Switch
              checked={policy.allow_privileged}
              onCheckedChange={(checked) => onPolicyChange({ ...policy, allow_privileged: checked })}
              aria-label="Allow privileged"
            />
          </div>
          <div className="flex items-center justify-between rounded border border-border/60 px-3 py-2">
            <span className="text-[11px] text-foreground">Max concurrent</span>
            <Input
              type="number"
              min={1}
              value={policy.max_concurrent}
              onChange={(e) =>
                onPolicyChange({ ...policy, max_concurrent: Math.max(1, Number(e.target.value)) })
              }
              className="h-6 w-16 text-xs"
            />
          </div>
          <div className="flex items-center justify-between rounded border border-border/60 px-3 py-2">
            <span className="text-[11px] text-foreground">Timeout (seconds)</span>
            <Input
              type="number"
              min={1}
              value={policy.timeout_seconds ?? 30}
              onChange={(e) =>
                onPolicyChange({ ...policy, timeout_seconds: Math.max(1, Number(e.target.value)) })
              }
              className="h-6 w-16 text-xs"
            />
          </div>
        </div>
      </div>

      <div className="mb-4">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-green-400">
            ↓ Inbound
          </span>
          <span className="text-[10px] text-muted-foreground">stdout/stderr filtering</span>
        </div>
        <SandboxInboundFilterEditor
          value={inbound}
          onChange={(newInbound) => onPolicyChange({ ...policy, inbound: newInbound })}
        />
      </div>

      <Button size="sm" className="w-full text-xs" onClick={() => void onApply(policy)}>
        Apply Policy
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Verify file compiles**

```bash
cd /Users/kien.ha/Code/RushDino/frontend
npx tsc --noEmit 2>&1 | grep sandbox-bash-policy-panel
```

Expected: no errors for this file.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/sandbox/components/sandbox-bash-policy-panel.tsx
git commit -m "feat(sandbox): extract bash policy panel component"
```

---

## Task 4: Create `sandbox-agent-section.tsx`

The shared section component used by both the Main agent and Team agents sections. Renders a split layout: filtered audit feed on the left, policy sub-tabs on the right.

**Files:**
- Create: `frontend/src/pages/sandbox/components/sandbox-agent-section.tsx`

- [ ] **Step 1: Create the file**

```tsx
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
};

type PolicyTab = 'mcp' | 'network' | 'bash';

const CATEGORY_FILTERS = ['all', 'network', 'mcp', 'process'] as const;
type CategoryFilter = (typeof CATEGORY_FILTERS)[number];

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
      <div className="grid flex-1 grid-cols-[1fr_300px] gap-0" style={{ minHeight: '320px' }}>
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
                  {f === 'process' ? 'Bash' : f}
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
```

- [ ] **Step 2: Verify file compiles**

```bash
cd /Users/kien.ha/Code/RushDino/frontend
npx tsc --noEmit 2>&1 | grep sandbox-agent-section
```

Expected: no errors for this file.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/sandbox/components/sandbox-agent-section.tsx
git commit -m "feat(sandbox): add SandboxAgentSection split-layout component"
```

---

## Task 5: Rewrite `SandboxMonitorPage.tsx`

Replace the existing monolithic page with the two-section layout. This is the largest change — it replaces `SandboxOverviewContent` entirely and slims down `SandboxMonitorPage` state.

**Files:**
- Modify: `frontend/src/pages/sandbox/SandboxMonitorPage.tsx`

- [ ] **Step 1: Replace the entire file**

```tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  fetchAgents,
  fetchAgentSessions,
  fetchMcpStatus,
  getSessionAuditLog,
  patchSessionBashPolicy,
  patchSessionMcpPolicy,
  patchSessionNetworkPolicy,
  putAgentSandbox,
} from '@/lib/api';
import type {
  AgentRecord,
  AuditEntry,
  McpServerStatus,
  SandboxMcpPolicy,
  SandboxNetworkPolicy,
  SandboxProcessPolicy,
  SessionSummary,
} from '@/lib/types';
import type { AgentRecord as AgentRecordType } from '@/pages/agents/agent-types';
import { SandboxAgentSection } from './components/sandbox-agent-section';
import { Shield } from 'lucide-react';

const REFRESH_INTERVAL_MS = 5_000;

// Helper: merge audit entries from multiple sessions, deduplicated by id
function mergeAuditEntries(entriesBySession: AuditEntry[][]): AuditEntry[] {
  const seen = new Set<number>();
  const merged: AuditEntry[] = [];
  for (const entries of entriesBySession) {
    for (const entry of entries) {
      if (!seen.has(entry.id)) {
        seen.add(entry.id);
        merged.push(entry);
      }
    }
  }
  return merged.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
}

export function SandboxMonitorPage() {
  const [agents, setAgents] = useState<AgentRecordType[]>([]);
  const [mcpServers, setMcpServers] = useState<McpServerStatus[]>([]);
  const [teamAgentId, setTeamAgentId] = useState<string | null>(null);

  // Audit entries: main session and team agent sub-sessions
  const [mainAuditEntries, setMainAuditEntries] = useState<AuditEntry[]>([]);
  const [teamAuditEntries, setTeamAuditEntries] = useState<AuditEntry[]>([]);
  const [loadingMainAudit, setLoadingMainAudit] = useState(false);
  const [loadingTeamAudit, setLoadingTeamAudit] = useState(false);

  // Agent sub-sessions for team audit aggregation
  const [agentSessions, setAgentSessions] = useState<SessionSummary[]>([]);

  const mainIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const teamIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Initial load ─────────────────────────────────────────────────────────
  useEffect(() => {
    async function init() {
      const [nextAgents, nextMcpServers, nextAgentSessions] = await Promise.all([
        fetchAgents().catch(() => [] as AgentRecordType[]),
        fetchMcpStatus().catch(() => [] as McpServerStatus[]),
        fetchAgentSessions().catch(() => [] as SessionSummary[]),
      ]);
      setAgents(nextAgents);
      setMcpServers(nextMcpServers);
      setAgentSessions(nextAgentSessions);
      setTeamAgentId((current) => {
        if (current && nextAgents.some((a) => a.id === current)) return current;
        return nextAgents[0]?.id ?? null;
      });
    }
    void init();
  }, []);

  // ── Main session audit polling ────────────────────────────────────────────
  const fetchMainAudit = useCallback(async () => {
    try {
      const entries = await getSessionAuditLog('main');
      setMainAuditEntries(entries);
    } catch {
      // silent — main session may not exist yet
    }
  }, []);

  useEffect(() => {
    setLoadingMainAudit(true);
    void fetchMainAudit().finally(() => setLoadingMainAudit(false));
    mainIntervalRef.current = setInterval(() => void fetchMainAudit(), REFRESH_INTERVAL_MS);
    return () => {
      if (mainIntervalRef.current) clearInterval(mainIntervalRef.current);
    };
  }, [fetchMainAudit]);

  // ── Team agent audit polling (aggregate across agent sub-sessions) ────────
  const fetchTeamAudit = useCallback(
    async (agentId: string, sessions: SessionSummary[]) => {
      // Agent sub-session IDs start with the agent id in their title or id.
      // Filter sessions whose title matches the selected agent's name.
      const selectedAgent = agents.find((a) => a.id === agentId);
      const matchingSessions = selectedAgent
        ? sessions.filter((s) =>
            s.title.toLowerCase().includes(selectedAgent.name.toLowerCase()) ||
            s.id.toLowerCase().includes(agentId.toLowerCase()),
          )
        : [];

      if (matchingSessions.length === 0) {
        setTeamAuditEntries([]);
        return;
      }

      const results = await Promise.allSettled(
        matchingSessions.map((s) => getSessionAuditLog(s.id)),
      );
      const all = results
        .filter((r): r is PromiseFulfilledResult<AuditEntry[]> => r.status === 'fulfilled')
        .map((r) => r.value);
      setTeamAuditEntries(mergeAuditEntries(all));
    },
    [agents],
  );

  useEffect(() => {
    if (!teamAgentId) return;
    setLoadingTeamAudit(true);
    void fetchTeamAudit(teamAgentId, agentSessions).finally(() => setLoadingTeamAudit(false));

    if (teamIntervalRef.current) clearInterval(teamIntervalRef.current);
    teamIntervalRef.current = setInterval(
      () => void fetchTeamAudit(teamAgentId, agentSessions),
      REFRESH_INTERVAL_MS,
    );
    return () => {
      if (teamIntervalRef.current) clearInterval(teamIntervalRef.current);
    };
  }, [teamAgentId, agentSessions, fetchTeamAudit]);

  // ── Policy helpers ────────────────────────────────────────────────────────
  function updateAgentPolicy(agentId: string, patch: Partial<NonNullable<AgentRecordType['sandboxPolicy']>['sandbox']>) {
    setAgents((prev) =>
      prev.map((a) =>
        a.id === agentId && a.sandboxPolicy
          ? { ...a, sandboxPolicy: { ...a.sandboxPolicy, sandbox: { ...a.sandboxPolicy.sandbox, ...patch } } }
          : a,
      ),
    );
  }

  // Main section — session-level policy (no agent template)
  const handleMainMcpChange = useCallback((mcp: SandboxMcpPolicy) => {
    // No local agent state to update for main; apply directly
  }, []);

  const handleApplyMainMcp = useCallback(async (mcp: SandboxMcpPolicy) => {
    try {
      await patchSessionMcpPolicy('main', mcp);
      toast.success('MCP policy applied to main session.');
    } catch {
      toast.error('Failed to apply MCP policy.');
    }
  }, []);

  const handleMainNetworkChange = useCallback((_network: SandboxNetworkPolicy) => {}, []);

  const handleApplyMainNetwork = useCallback(async (network: SandboxNetworkPolicy) => {
    try {
      await patchSessionNetworkPolicy('main', network);
      toast.success('Network policy applied to main session.');
    } catch {
      toast.error('Failed to apply network policy.');
    }
  }, []);

  const handleMainBashChange = useCallback((_process: SandboxProcessPolicy) => {}, []);

  const handleApplyMainBash = useCallback(async (process: SandboxProcessPolicy) => {
    try {
      await patchSessionBashPolicy('main', process);
      toast.success('Bash policy applied to main session.');
    } catch {
      toast.error('Failed to apply bash policy.');
    }
  }, []);

  // Team section — agent template policy
  const handleTeamMcpChange = useCallback(
    (mcp: SandboxMcpPolicy) => {
      if (teamAgentId) updateAgentPolicy(teamAgentId, { mcp });
    },
    [teamAgentId],
  );

  const handleApplyTeamMcp = useCallback(
    async (mcp: SandboxMcpPolicy) => {
      if (!teamAgentId) return;
      try {
        const agent = agents.find((a) => a.id === teamAgentId);
        if (agent?.sandboxPolicy) {
          await putAgentSandbox(teamAgentId, {
            ...agent.sandboxPolicy,
            sandbox: { ...agent.sandboxPolicy.sandbox, mcp },
          });
        } else {
          await patchSessionMcpPolicy('main', mcp);
        }
        toast.success('MCP policy applied.');
      } catch {
        toast.error('Failed to apply MCP policy.');
      }
    },
    [teamAgentId, agents],
  );

  const handleTeamNetworkChange = useCallback(
    (network: SandboxNetworkPolicy) => {
      if (teamAgentId) updateAgentPolicy(teamAgentId, { network });
    },
    [teamAgentId],
  );

  const handleApplyTeamNetwork = useCallback(
    async (network: SandboxNetworkPolicy) => {
      if (!teamAgentId) return;
      try {
        const agent = agents.find((a) => a.id === teamAgentId);
        if (agent?.sandboxPolicy) {
          await putAgentSandbox(teamAgentId, {
            ...agent.sandboxPolicy,
            sandbox: { ...agent.sandboxPolicy.sandbox, network },
          });
        } else {
          await patchSessionNetworkPolicy('main', network);
        }
        toast.success('Network policy applied.');
      } catch {
        toast.error('Failed to apply network policy.');
      }
    },
    [teamAgentId, agents],
  );

  const handleTeamBashChange = useCallback(
    (process: SandboxProcessPolicy) => {
      if (teamAgentId) updateAgentPolicy(teamAgentId, { process });
    },
    [teamAgentId],
  );

  const handleApplyTeamBash = useCallback(
    async (process: SandboxProcessPolicy) => {
      if (!teamAgentId) return;
      try {
        const agent = agents.find((a) => a.id === teamAgentId);
        if (agent?.sandboxPolicy) {
          await putAgentSandbox(teamAgentId, {
            ...agent.sandboxPolicy,
            sandbox: { ...agent.sandboxPolicy.sandbox, process },
          });
        } else {
          await patchSessionBashPolicy('main', process);
        }
        toast.success('Bash policy applied.');
      } catch {
        toast.error('Failed to apply bash policy.');
      }
    },
    [teamAgentId, agents],
  );

  const teamAgent = agents.find((a) => a.id === teamAgentId) ?? null;

  return (
    <div className="flex-1 min-w-0 h-full overflow-y-auto bg-background px-6 py-6 md:px-8 md:py-8">
      <div className="flex w-full flex-col gap-6">
        {/* Page header */}
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-semibold tracking-tight">Sandbox</h1>
        </div>

        {/* Section 1: Main agent */}
        <SandboxAgentSection
          label="★ Main agent"
          badge={
            <span className="rounded-full border border-green-500/30 bg-green-500/10 px-2 py-0.5 text-[10px] text-green-400">
              main session
            </span>
          }
          auditEntries={mainAuditEntries}
          loadingAudit={loadingMainAudit}
          mcpServers={mcpServers}
          mcpPolicy={null}
          networkPolicy={null}
          bashPolicy={null}
          onMcpPolicyChange={handleMainMcpChange}
          onApplyMcp={handleApplyMainMcp}
          onNetworkPolicyChange={handleMainNetworkChange}
          onApplyNetwork={handleApplyMainNetwork}
          onBashPolicyChange={handleMainBashChange}
          onApplyBash={handleApplyMainBash}
        />

        {/* Section 2: Team agents */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-foreground">Team agents</span>
            <select
              value={teamAgentId ?? ''}
              onChange={(e) => setTeamAgentId(e.target.value)}
              className="rounded border border-border bg-card px-2 py-1 text-xs text-foreground"
            >
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.emoji} {a.name}
                </option>
              ))}
            </select>
          </div>
          {teamAgentId ? (
            <SandboxAgentSection
              label={`${teamAgent?.emoji ?? ''} ${teamAgent?.name ?? teamAgentId}`}
              auditEntries={teamAuditEntries}
              loadingAudit={loadingTeamAudit}
              mcpServers={mcpServers}
              mcpPolicy={teamAgent?.sandboxPolicy?.sandbox.mcp ?? null}
              networkPolicy={teamAgent?.sandboxPolicy?.sandbox.network ?? null}
              bashPolicy={teamAgent?.sandboxPolicy?.sandbox.process ?? null}
              onMcpPolicyChange={handleTeamMcpChange}
              onApplyMcp={handleApplyTeamMcp}
              onNetworkPolicyChange={handleTeamNetworkChange}
              onApplyNetwork={handleApplyTeamNetwork}
              onBashPolicyChange={handleTeamBashChange}
              onApplyBash={handleApplyTeamBash}
            />
          ) : (
            <div className="rounded-xl border border-dashed border-border/60 bg-background/40 px-4 py-10 text-center text-sm text-muted-foreground">
              No agents found.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Check TypeScript types**

```bash
cd /Users/kien.ha/Code/RushDino/frontend
npx tsc --noEmit 2>&1 | grep -i sandbox
```

Expected: no errors. Fix any type mismatches (e.g. `AgentRecord` import path — use `@/pages/agents/agent-types` for `AgentRecord`).

- [ ] **Step 3: Fix the AgentRecord import — it's already imported in the existing file as `AgentRecord` from `@/pages/agents/agent-types`. Adjust if tsc reports a conflict.**

The import at the top of the file should read:
```tsx
import type { AgentRecord } from '@/pages/agents/agent-types';
```

And `SessionSummary` comes from `@/lib/types`. Remove the duplicate import alias.

- [ ] **Step 4: Delete the old tab files (no longer imported)**

```bash
rm frontend/src/pages/sandbox/tabs/sandbox-mcp-tab.tsx
rm frontend/src/pages/sandbox/tabs/sandbox-network-tab.tsx
rm frontend/src/pages/sandbox/tabs/sandbox-bash-tab.tsx
```

- [ ] **Step 5: Final type check**

```bash
cd /Users/kien.ha/Code/RushDino/frontend
npx tsc --noEmit 2>&1
```

Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add -A frontend/src/pages/sandbox/
git commit -m "feat(sandbox): redesign page — two-section layout with main + team agents"
```

---

## Task 6: Manual smoke test

- [ ] **Step 1: Start the dev server**

```bash
cd /Users/kien.ha/Code/RushDino
cargo run -- server &
cd frontend && npm run dev
```

- [ ] **Step 2: Open the sandbox page and verify**

Check:
- [ ] No 4 stat cards visible
- [ ] "★ Main agent" section renders at top with audit feed (may be empty) and Network/MCP/Bash policy tabs on the right
- [ ] Category filter chips (All / Network / MCP / Bash) work — clicking filters the feed
- [ ] "Team agents" section renders below with agent dropdown
- [ ] Selecting a different agent in the dropdown updates the team section label
- [ ] Policy panels (Network, MCP, Bash) render correctly in both sections with Apply button
- [ ] No console errors

- [ ] **Step 3: Commit any fixups discovered during smoke test**

```bash
git add -A
git commit -m "fix(sandbox): smoke test fixups"
```
