# Sandbox Bidirectional Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enrich `/sandbox` with a tabbed control surface for MCP Tools, Network, and Bash — each with bidirectional (↑ outbound + ↓ inbound) policy rules and a real-time per-type audit feed.

**Architecture:** Three new tab components (`SandboxMcpTab`, `SandboxNetworkTab`, `SandboxBashTab`) share two reusable primitives: `SandboxAuditFeed` (filterable event list) and `SandboxInboundFilterEditor` (max-size / strip-patterns / block-on-match). The existing `SandboxMonitorPage` gains a tab bar and agent selector; the Overview tab preserves current behavior. Types and API client are extended first as a foundation for all tabs.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, shadcn/ui, Vitest (node environment, `*.node.test.ts`)

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `frontend/src/lib/types.ts` | Add `SandboxInboundFilter`, `SandboxMcpPolicy`, `McpServerStatus`; extend `SandboxNetworkPolicy`, `SandboxProcessPolicy`, `SandboxPolicy`, `AuditEntry` |
| Modify | `frontend/src/lib/api.ts` | Add `fetchMcpStatus`, `patchSessionMcpPolicy`, `patchSessionBashPolicy` |
| Create | `frontend/src/pages/sandbox/components/sandbox-inbound-filter-editor.tsx` | Shared UI: max size, strip patterns list, block-on-match toggle |
| Create | `frontend/src/pages/sandbox/components/sandbox-audit-feed.tsx` | Shared real-time audit feed with configurable extra columns |
| Create | `frontend/src/pages/sandbox/tabs/sandbox-mcp-tab.tsx` | MCP tab: server-level allow/deny + inbound filter + audit feed |
| Create | `frontend/src/pages/sandbox/tabs/sandbox-network-tab.tsx` | Network tab: wraps existing NetworkPolicyEditor + inbound filter + audit feed |
| Create | `frontend/src/pages/sandbox/tabs/sandbox-bash-tab.tsx` | Bash tab: deny commands / timeout / concurrent limits + inbound filter + audit feed |
| Modify | `frontend/src/pages/sandbox/SandboxMonitorPage.tsx` | Add tab bar, agent selector, route to tab components; keep Overview tab |
| Modify | `frontend/src/pages/sandbox/SandboxMonitorPage.node.test.ts` | Update existing tests for new props/shape |

---

## Task 1: Extend Types

**Files:**
- Modify: `frontend/src/lib/types.ts:799-864`
- Test: `frontend/src/lib/__tests__/sandbox-types.node.test.ts`

- [ ] **Step 1.1: Write the failing type-shape test**

Create `frontend/src/lib/__tests__/sandbox-types.node.test.ts`:

```typescript
import { describe, it, expectTypeOf } from 'vitest';
import type {
  SandboxInboundFilter,
  SandboxMcpPolicy,
  SandboxPolicy,
  AuditEntry,
  McpServerStatus,
} from '../types';

describe('Extended sandbox types', () => {
  it('SandboxInboundFilter has required fields', () => {
    expectTypeOf<SandboxInboundFilter>().toHaveProperty('max_size_kb');
    expectTypeOf<SandboxInboundFilter>().toHaveProperty('strip_patterns');
    expectTypeOf<SandboxInboundFilter>().toHaveProperty('block_on_match');
  });

  it('SandboxMcpPolicy has default, servers, inbound', () => {
    expectTypeOf<SandboxMcpPolicy>().toHaveProperty('default');
    expectTypeOf<SandboxMcpPolicy>().toHaveProperty('servers');
    expectTypeOf<SandboxMcpPolicy>().toHaveProperty('inbound');
  });

  it('SandboxPolicy.sandbox has optional mcp field', () => {
    expectTypeOf<SandboxPolicy['sandbox']>().toHaveProperty('mcp');
  });

  it('AuditEntry has direction, server, tool, filtered fields', () => {
    expectTypeOf<AuditEntry>().toHaveProperty('direction');
    expectTypeOf<AuditEntry>().toHaveProperty('server');
    expectTypeOf<AuditEntry>().toHaveProperty('tool');
    expectTypeOf<AuditEntry>().toHaveProperty('filtered');
  });

  it('McpServerStatus has name, connected, tool_count', () => {
    expectTypeOf<McpServerStatus>().toHaveProperty('name');
    expectTypeOf<McpServerStatus>().toHaveProperty('connected');
    expectTypeOf<McpServerStatus>().toHaveProperty('tool_count');
  });
});
```

- [ ] **Step 1.2: Run test to verify it fails**

```bash
cd frontend && npx vitest run src/lib/__tests__/sandbox-types.node.test.ts --config vitest.node.config.ts
```

Expected: FAIL — types not yet defined.

- [ ] **Step 1.3: Add new types and extend existing ones in `types.ts`**

After the `AuditEntry` interface (after line 864), add:

```typescript
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
```

Replace the `SandboxNetworkPolicy` interface (lines 823–827) with:

```typescript
export interface SandboxNetworkPolicy {
  default: 'allow' | 'deny';
  on_block: 'prompt' | 'deny' | 'hard-stop';
  allow: NetworkRule[];
  inbound?: {
    max_size_kb: number;
    strip_headers: string[];
    allowed_content_types: string[];
  };
}
```

Replace the `SandboxProcessPolicy` interface (lines 817–821) with:

```typescript
export interface SandboxProcessPolicy {
  allow_privileged: boolean;
  max_concurrent: number;
  deny_commands: string[];
  timeout_seconds?: number;
  inbound?: SandboxInboundFilter;
}
```

Replace the `SandboxPolicy` interface (lines 841–850) with:

```typescript
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
```

Replace the `AuditEntry` interface (lines 852–864) with:

```typescript
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
```

- [ ] **Step 1.4: Run test to verify it passes**

```bash
cd frontend && npx vitest run src/lib/__tests__/sandbox-types.node.test.ts --config vitest.node.config.ts
```

Expected: PASS

- [ ] **Step 1.5: Commit**

```bash
git add frontend/src/lib/types.ts frontend/src/lib/__tests__/sandbox-types.node.test.ts
git commit -m "feat(sandbox): extend types for bidirectional MCP/network/bash policy control"
```

---

## Task 2: Extend API Client

**Files:**
- Modify: `frontend/src/lib/api.ts` (after line 810)
- Test: `frontend/src/lib/__tests__/sandbox-api.node.test.ts`

- [ ] **Step 2.1: Write failing tests**

Create `frontend/src/lib/__tests__/sandbox-api.node.test.ts`:

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

afterEach(() => {
  vi.clearAllMocks();
});

function makeResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe('fetchMcpStatus', () => {
  it('GET /api/mcp/status and returns server list', async () => {
    const { fetchMcpStatus } = await import('../api');
    mockFetch.mockResolvedValueOnce(
      makeResponse([{ name: 'fs-mcp', url: 'http://localhost:9001', connected: true, tool_count: 5 }]),
    );
    const result = await fetchMcpStatus();
    expect(mockFetch).toHaveBeenCalledWith('/api/mcp/status');
    expect(result[0].name).toBe('fs-mcp');
    expect(result[0].connected).toBe(true);
  });
});

describe('patchSessionMcpPolicy', () => {
  it('PATCH /api/sessions/{id}/sandbox/mcp with policy body', async () => {
    const { patchSessionMcpPolicy } = await import('../api');
    mockFetch.mockResolvedValueOnce(makeResponse({}));
    await patchSessionMcpPolicy('sess-1', {
      default: 'deny',
      servers: { 'fs-mcp': 'allow' },
      inbound: { max_size_kb: 64, strip_patterns: [], block_on_match: true },
    });
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/sessions/sess-1/sandbox/mcp',
      expect.objectContaining({ method: 'PATCH' }),
    );
  });
});

describe('patchSessionBashPolicy', () => {
  it('PATCH /api/sessions/{id}/sandbox/process with policy body', async () => {
    const { patchSessionBashPolicy } = await import('../api');
    mockFetch.mockResolvedValueOnce(makeResponse({}));
    await patchSessionBashPolicy('sess-1', {
      allow_privileged: false,
      max_concurrent: 3,
      deny_commands: ['sudo'],
      timeout_seconds: 30,
    });
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/sessions/sess-1/sandbox/process',
      expect.objectContaining({ method: 'PATCH' }),
    );
  });
});
```

- [ ] **Step 2.2: Run tests to verify they fail**

```bash
cd frontend && npx vitest run src/lib/__tests__/sandbox-api.node.test.ts --config vitest.node.config.ts
```

Expected: FAIL — functions not exported from api.ts

- [ ] **Step 2.3: Add three functions to `api.ts` after the `denySessionRequest` function (after line 810)**

```typescript
/** Fetch the list of configured MCP servers and their connection status. */
export async function fetchMcpStatus(): Promise<McpServerStatus[]> {
  const endpoint = '/api/mcp/status';
  const response = await fetch(endpoint);
  const data = await parseJsonOrThrow(response, endpoint);
  return Array.isArray(data) ? data : (data.items ?? []);
}

/** Hot-reload the MCP server policy for an active session without restarting. */
export async function patchSessionMcpPolicy(
  sessionId: string,
  mcpPolicy: SandboxMcpPolicy,
): Promise<void> {
  const endpoint = `/api/sessions/${encodeURIComponent(sessionId)}/sandbox/mcp`;
  const response = await fetch(endpoint, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(mcpPolicy),
  });
  await parseJsonOrThrow(response, endpoint);
}

/** Hot-reload the bash/process policy for an active session without restarting. */
export async function patchSessionBashPolicy(
  sessionId: string,
  processPolicy: SandboxProcessPolicy,
): Promise<void> {
  const endpoint = `/api/sessions/${encodeURIComponent(sessionId)}/sandbox/process`;
  const response = await fetch(endpoint, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(processPolicy),
  });
  await parseJsonOrThrow(response, endpoint);
}
```

Add the new types to the import at the top of `api.ts`:
```typescript
// Find the existing type import block and add: McpServerStatus, SandboxMcpPolicy, SandboxProcessPolicy
```

- [ ] **Step 2.4: Run tests to verify they pass**

```bash
cd frontend && npx vitest run src/lib/__tests__/sandbox-api.node.test.ts --config vitest.node.config.ts
```

Expected: PASS

- [ ] **Step 2.5: Commit**

```bash
git add frontend/src/lib/api.ts frontend/src/lib/__tests__/sandbox-api.node.test.ts
git commit -m "feat(sandbox): add fetchMcpStatus, patchSessionMcpPolicy, patchSessionBashPolicy to API client"
```

---

## Task 3: SandboxInboundFilterEditor Component

**Files:**
- Create: `frontend/src/pages/sandbox/components/sandbox-inbound-filter-editor.tsx`
- Test: `frontend/src/pages/sandbox/components/sandbox-inbound-filter-editor.node.test.ts`

- [ ] **Step 3.1: Write the failing test**

Create `frontend/src/pages/sandbox/components/sandbox-inbound-filter-editor.node.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { SandboxInboundFilterEditor } from './sandbox-inbound-filter-editor';
import type { SandboxInboundFilter } from '@/lib/types';

const baseFilter: SandboxInboundFilter = {
  max_size_kb: 64,
  strip_patterns: ['AKIA[A-Z0-9]{16}', 'sk-[A-Za-z0-9]{32,}'],
  block_on_match: true,
};

describe('SandboxInboundFilterEditor', () => {
  it('renders max_size_kb value', () => {
    const html = renderToStaticMarkup(
      createElement(SandboxInboundFilterEditor, { value: baseFilter, onChange: () => {} }),
    );
    expect(html).toContain('64');
  });

  it('renders strip patterns', () => {
    const html = renderToStaticMarkup(
      createElement(SandboxInboundFilterEditor, { value: baseFilter, onChange: () => {} }),
    );
    expect(html).toContain('AKIA[A-Z0-9]{16}');
    expect(html).toContain('sk-[A-Za-z0-9]{32,}');
  });

  it('renders block_on_match label', () => {
    const html = renderToStaticMarkup(
      createElement(SandboxInboundFilterEditor, { value: baseFilter, onChange: () => {} }),
    );
    expect(html).toContain('Block on match');
  });

  it('renders empty strip patterns without crashing', () => {
    const html = renderToStaticMarkup(
      createElement(SandboxInboundFilterEditor, {
        value: { ...baseFilter, strip_patterns: [] },
        onChange: () => {},
      }),
    );
    expect(html).toContain('No patterns');
  });
});
```

- [ ] **Step 3.2: Run test to verify it fails**

```bash
cd frontend && npx vitest run src/pages/sandbox/components/sandbox-inbound-filter-editor.node.test.ts --config vitest.node.config.ts
```

Expected: FAIL — file does not exist.

- [ ] **Step 3.3: Create the component**

Create `frontend/src/pages/sandbox/components/sandbox-inbound-filter-editor.tsx`:

```typescript
import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { SandboxInboundFilter } from '@/lib/types';

interface SandboxInboundFilterEditorProps {
  value: SandboxInboundFilter;
  onChange: (value: SandboxInboundFilter) => void;
}

export function SandboxInboundFilterEditor({ value, onChange }: SandboxInboundFilterEditorProps) {
  const [newPattern, setNewPattern] = useState('');

  function addPattern() {
    const trimmed = newPattern.trim();
    if (!trimmed) return;
    onChange({ ...value, strip_patterns: [...value.strip_patterns, trimmed] });
    setNewPattern('');
  }

  function removePattern(index: number) {
    onChange({
      ...value,
      strip_patterns: value.strip_patterns.filter((_, i) => i !== index),
    });
  }

  return (
    <div className="space-y-4">
      {/* Max size */}
      <div>
        <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
          Max response size (KB)
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={1}
            value={value.max_size_kb}
            onChange={(e) => onChange({ ...value, max_size_kb: Number(e.target.value) })}
            className="h-7 w-24 text-xs"
          />
          <span className="text-[11px] text-muted-foreground">· truncate on exceed</span>
        </div>
      </div>

      {/* Strip patterns */}
      <div>
        <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
          Strip patterns (regex)
        </div>
        <div className="space-y-1.5">
          {value.strip_patterns.length === 0 ? (
            <div className="text-[11px] text-muted-foreground">No patterns</div>
          ) : (
            value.strip_patterns.map((pattern, i) => (
              <div key={i} className="flex items-center gap-2">
                <code className="flex-1 rounded bg-muted px-2 py-0.5 text-[10px] text-yellow-400">
                  {pattern}
                </code>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 text-muted-foreground hover:text-destructive"
                  onClick={() => removePattern(i)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))
          )}
        </div>
        <div className="mt-2 flex gap-2">
          <Input
            value={newPattern}
            onChange={(e) => setNewPattern(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addPattern()}
            placeholder="e.g. AKIA[A-Z0-9]{16}"
            className="h-7 text-xs font-mono"
          />
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={addPattern}>
            <Plus className="mr-1 h-3 w-3" />
            Add
          </Button>
        </div>
      </div>

      {/* Block on match */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[11px] text-foreground">Block on match</div>
          <div className="text-[10px] text-muted-foreground">Hard-stop session if pattern matched</div>
        </div>
        <button
          role="switch"
          aria-checked={value.block_on_match}
          onClick={() => onChange({ ...value, block_on_match: !value.block_on_match })}
          className={`relative h-5 w-9 rounded-full transition-colors ${
            value.block_on_match ? 'bg-green-500' : 'bg-muted'
          }`}
        >
          <span
            className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
              value.block_on_match ? 'translate-x-4' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3.4: Run test to verify it passes**

```bash
cd frontend && npx vitest run src/pages/sandbox/components/sandbox-inbound-filter-editor.node.test.ts --config vitest.node.config.ts
```

Expected: PASS

- [ ] **Step 3.5: Commit**

```bash
git add frontend/src/pages/sandbox/components/sandbox-inbound-filter-editor.tsx \
        frontend/src/pages/sandbox/components/sandbox-inbound-filter-editor.node.test.ts
git commit -m "feat(sandbox): add SandboxInboundFilterEditor shared component"
```

---

## Task 4: SandboxAuditFeed Component

**Files:**
- Create: `frontend/src/pages/sandbox/components/sandbox-audit-feed.tsx`
- Test: `frontend/src/pages/sandbox/components/sandbox-audit-feed.node.test.ts`

- [ ] **Step 4.1: Write the failing test**

Create `frontend/src/pages/sandbox/components/sandbox-audit-feed.node.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { SandboxAuditFeed } from './sandbox-audit-feed';
import type { AuditEntry } from '@/lib/types';

const entries: AuditEntry[] = [
  {
    id: 1,
    session_id: 'sess-1',
    agent_id: 'agent-1',
    ts: '2026-03-28T14:32:01Z',
    category: 'mcp',
    decision: 'allow',
    binary: null,
    destination: 'filesystem-mcp',
    method: null,
    path: null,
    reason: null,
    server: 'filesystem-mcp',
    tool: 'read_file',
    direction: 'outbound',
    filtered: false,
  },
  {
    id: 2,
    session_id: 'sess-1',
    agent_id: 'agent-1',
    ts: '2026-03-28T14:31:58Z',
    category: 'mcp',
    decision: 'deny',
    binary: null,
    destination: 'browser-mcp',
    method: null,
    path: null,
    reason: 'server denied',
    server: 'browser-mcp',
    tool: 'navigate',
    direction: 'outbound',
    filtered: false,
  },
];

describe('SandboxAuditFeed', () => {
  it('renders allow and deny decisions', () => {
    const html = renderToStaticMarkup(
      createElement(SandboxAuditFeed, { entries, loading: false }),
    );
    expect(html).toContain('allow');
    expect(html).toContain('deny');
  });

  it('renders destination values', () => {
    const html = renderToStaticMarkup(
      createElement(SandboxAuditFeed, { entries, loading: false }),
    );
    expect(html).toContain('filesystem-mcp');
    expect(html).toContain('browser-mcp');
  });

  it('shows empty state when no entries', () => {
    const html = renderToStaticMarkup(
      createElement(SandboxAuditFeed, { entries: [], loading: false }),
    );
    expect(html).toContain('No events');
  });

  it('shows loading state', () => {
    const html = renderToStaticMarkup(
      createElement(SandboxAuditFeed, { entries: [], loading: true }),
    );
    expect(html).toContain('Loading');
  });

  it('renders extra columns when provided', () => {
    const html = renderToStaticMarkup(
      createElement(SandboxAuditFeed, {
        entries,
        loading: false,
        extraColumns: [
          {
            key: 'tool',
            label: 'Tool',
            render: (e: AuditEntry) => e.tool ?? '—',
          },
        ],
      }),
    );
    expect(html).toContain('Tool');
    expect(html).toContain('read_file');
  });
});
```

- [ ] **Step 4.2: Run test to verify it fails**

```bash
cd frontend && npx vitest run src/pages/sandbox/components/sandbox-audit-feed.node.test.ts --config vitest.node.config.ts
```

Expected: FAIL — file does not exist.

- [ ] **Step 4.3: Create the component**

Create `frontend/src/pages/sandbox/components/sandbox-audit-feed.tsx`:

```typescript
import { Loader2 } from 'lucide-react';
import type { AuditEntry } from '@/lib/types';

export interface AuditFeedColumn {
  key: string;
  label: string;
  render: (entry: AuditEntry) => React.ReactNode;
}

interface SandboxAuditFeedProps {
  entries: AuditEntry[];
  loading: boolean;
  extraColumns?: AuditFeedColumn[];
}

function DecisionChip({ decision }: { decision: AuditEntry['decision'] }) {
  const styles: Record<AuditEntry['decision'], string> = {
    allow: 'bg-green-500/15 text-green-400 border-green-500/20',
    deny: 'bg-red-500/15 text-red-400 border-red-500/20',
    pending: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/20',
    route: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-1.5 py-0 text-[10px] font-semibold uppercase ${styles[decision] ?? ''}`}
    >
      {decision}
    </span>
  );
}

export function SandboxAuditFeed({ entries, loading, extraColumns = [] }: SandboxAuditFeedProps) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading…
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">No events</div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {entries.map((entry) => (
        <div
          key={entry.id}
          className="flex items-center gap-2.5 rounded-md border border-border/60 bg-card/50 px-3 py-2"
        >
          <span className="min-w-[58px] text-[10px] text-muted-foreground">
            {new Date(entry.ts).toLocaleTimeString()}
          </span>
          <DecisionChip decision={entry.decision} />
          <span className="flex-1 truncate text-[12px] text-muted-foreground">
            {entry.destination ?? entry.binary ?? '—'}
          </span>
          {extraColumns.map((col) => (
            <span key={col.key} className="text-[11px] text-muted-foreground">
              {col.render(entry)}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4.4: Run test to verify it passes**

```bash
cd frontend && npx vitest run src/pages/sandbox/components/sandbox-audit-feed.node.test.ts --config vitest.node.config.ts
```

Expected: PASS

- [ ] **Step 4.5: Commit**

```bash
git add frontend/src/pages/sandbox/components/sandbox-audit-feed.tsx \
        frontend/src/pages/sandbox/components/sandbox-audit-feed.node.test.ts
git commit -m "feat(sandbox): add SandboxAuditFeed shared component"
```

---

## Task 5: MCP Tools Tab

**Files:**
- Create: `frontend/src/pages/sandbox/tabs/sandbox-mcp-tab.tsx`
- Test: `frontend/src/pages/sandbox/tabs/sandbox-mcp-tab.node.test.ts`

- [ ] **Step 5.1: Write the failing test**

Create `frontend/src/pages/sandbox/tabs/sandbox-mcp-tab.node.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { SandboxMcpTab } from './sandbox-mcp-tab';
import type { AuditEntry, McpServerStatus, SandboxMcpPolicy } from '@/lib/types';

const servers: McpServerStatus[] = [
  { name: 'filesystem-mcp', url: 'http://localhost:9001', connected: true, tool_count: 5 },
  { name: 'browser-mcp', url: 'http://localhost:9002', connected: true, tool_count: 3 },
];

const policy: SandboxMcpPolicy = {
  default: 'deny',
  servers: { 'filesystem-mcp': 'allow', 'browser-mcp': 'deny' },
  inbound: { max_size_kb: 64, strip_patterns: ['AKIA[A-Z0-9]{16}'], block_on_match: true },
};

const auditEntries: AuditEntry[] = [
  {
    id: 1,
    session_id: 'sess-1',
    agent_id: 'a1',
    ts: '2026-03-28T14:32:01Z',
    category: 'mcp',
    decision: 'allow',
    binary: null,
    destination: 'filesystem-mcp',
    method: null,
    path: null,
    reason: null,
    server: 'filesystem-mcp',
    tool: 'read_file',
    direction: 'outbound',
    filtered: false,
  },
];

describe('SandboxMcpTab', () => {
  it('renders server names', () => {
    const html = renderToStaticMarkup(
      createElement(SandboxMcpTab, {
        servers,
        policy,
        auditEntries,
        loadingAudit: false,
        onPolicyChange: () => {},
        onApply: async () => {},
      }),
    );
    expect(html).toContain('filesystem-mcp');
    expect(html).toContain('browser-mcp');
  });

  it('renders ALLOW for filesystem-mcp and DENY for browser-mcp', () => {
    const html = renderToStaticMarkup(
      createElement(SandboxMcpTab, {
        servers,
        policy,
        auditEntries,
        loadingAudit: false,
        onPolicyChange: () => {},
        onApply: async () => {},
      }),
    );
    expect(html.toLowerCase()).toContain('allow');
    expect(html.toLowerCase()).toContain('deny');
  });

  it('renders audit entry destination', () => {
    const html = renderToStaticMarkup(
      createElement(SandboxMcpTab, {
        servers,
        policy,
        auditEntries,
        loadingAudit: false,
        onPolicyChange: () => {},
        onApply: async () => {},
      }),
    );
    expect(html).toContain('filesystem-mcp');
  });
});
```

- [ ] **Step 5.2: Run test to verify it fails**

```bash
cd frontend && npx vitest run src/pages/sandbox/tabs/sandbox-mcp-tab.node.test.ts --config vitest.node.config.ts
```

Expected: FAIL — file does not exist.

- [ ] **Step 5.3: Create the MCP tab component**

Create `frontend/src/pages/sandbox/tabs/sandbox-mcp-tab.tsx`:

```typescript
import { Button } from '@/components/ui/button';
import { SandboxAuditFeed } from '../components/sandbox-audit-feed';
import { SandboxInboundFilterEditor } from '../components/sandbox-inbound-filter-editor';
import type { AuditEntry, McpServerStatus, SandboxMcpPolicy } from '@/lib/types';

interface SandboxMcpTabProps {
  servers: McpServerStatus[];
  policy: SandboxMcpPolicy;
  auditEntries: AuditEntry[];
  loadingAudit: boolean;
  onPolicyChange: (policy: SandboxMcpPolicy) => void;
  onApply: () => Promise<void>;
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

export function SandboxMcpTab({
  servers,
  policy,
  auditEntries,
  loadingAudit,
  onPolicyChange,
  onApply,
}: SandboxMcpTabProps) {
  function toggleServer(name: string, decision: 'allow' | 'deny') {
    onPolicyChange({ ...policy, servers: { ...policy.servers, [name]: decision } });
  }

  const mcpEntries = auditEntries.filter((e) => e.category === 'mcp');

  return (
    <div className="grid flex-1 grid-cols-[1fr_300px] gap-0">
      {/* Left: Audit Feed */}
      <div className="overflow-y-auto border-r border-border/60 p-4">
        <div className="mb-3 text-[10px] uppercase tracking-wider text-muted-foreground">
          MCP Call Audit
        </div>
        <SandboxAuditFeed
          entries={mcpEntries}
          loading={loadingAudit}
          extraColumns={[
            { key: 'tool', label: 'Tool', render: (e) => e.tool ?? '—' },
          ]}
        />
      </div>

      {/* Right: Policy Panel */}
      <div className="overflow-y-auto p-4">
        {/* Outbound */}
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

        {/* Inbound */}
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

        <Button size="sm" className="w-full text-xs" onClick={() => void onApply()}>
          Apply Policy
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5.4: Run test to verify it passes**

```bash
cd frontend && npx vitest run src/pages/sandbox/tabs/sandbox-mcp-tab.node.test.ts --config vitest.node.config.ts
```

Expected: PASS

- [ ] **Step 5.5: Commit**

```bash
git add frontend/src/pages/sandbox/tabs/sandbox-mcp-tab.tsx \
        frontend/src/pages/sandbox/tabs/sandbox-mcp-tab.node.test.ts
git commit -m "feat(sandbox): add SandboxMcpTab with bidirectional server-level policy"
```

---

## Task 6: Network Tab

**Files:**
- Create: `frontend/src/pages/sandbox/tabs/sandbox-network-tab.tsx`
- Test: `frontend/src/pages/sandbox/tabs/sandbox-network-tab.node.test.ts`

- [ ] **Step 6.1: Write the failing test**

Create `frontend/src/pages/sandbox/tabs/sandbox-network-tab.node.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { SandboxNetworkTab } from './sandbox-network-tab';
import type { AuditEntry, SandboxNetworkPolicy } from '@/lib/types';

const policy: SandboxNetworkPolicy = {
  default: 'deny',
  on_block: 'prompt',
  allow: [{ host: 'api.example.com', port: 443, methods: ['GET'], paths: ['/*'] }],
  inbound: {
    max_size_kb: 256,
    strip_headers: ['Authorization'],
    allowed_content_types: ['application/json'],
  },
};

const auditEntries: AuditEntry[] = [
  {
    id: 3,
    session_id: 'sess-1',
    agent_id: 'a1',
    ts: '2026-03-28T14:30:00Z',
    category: 'network',
    decision: 'allow',
    binary: null,
    destination: 'api.example.com',
    method: 'GET',
    path: '/v1/data',
    reason: null,
    direction: 'outbound',
    filtered: false,
  },
];

describe('SandboxNetworkTab', () => {
  it('renders network audit entries', () => {
    const html = renderToStaticMarkup(
      createElement(SandboxNetworkTab, {
        policy,
        auditEntries,
        loadingAudit: false,
        sessionId: 'sess-1',
        onPolicyChange: () => {},
        onApply: async () => {},
      }),
    );
    expect(html).toContain('api.example.com');
  });

  it('renders outbound and inbound section labels', () => {
    const html = renderToStaticMarkup(
      createElement(SandboxNetworkTab, {
        policy,
        auditEntries,
        loadingAudit: false,
        sessionId: 'sess-1',
        onPolicyChange: () => {},
        onApply: async () => {},
      }),
    );
    expect(html).toContain('Outbound');
    expect(html).toContain('Inbound');
  });

  it('renders strip_headers values', () => {
    const html = renderToStaticMarkup(
      createElement(SandboxNetworkTab, {
        policy,
        auditEntries,
        loadingAudit: false,
        sessionId: 'sess-1',
        onPolicyChange: () => {},
        onApply: async () => {},
      }),
    );
    expect(html).toContain('Authorization');
  });
});
```

- [ ] **Step 6.2: Run test to verify it fails**

```bash
cd frontend && npx vitest run src/pages/sandbox/tabs/sandbox-network-tab.node.test.ts --config vitest.node.config.ts
```

Expected: FAIL — file does not exist.

- [ ] **Step 6.3: Create the Network tab component**

Create `frontend/src/pages/sandbox/tabs/sandbox-network-tab.tsx`:

```typescript
import { useState } from 'react';
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
import { SandboxAuditFeed } from '../components/sandbox-audit-feed';
import type { AuditEntry, NetworkRule, SandboxNetworkPolicy } from '@/lib/types';

interface SandboxNetworkTabProps {
  policy: SandboxNetworkPolicy;
  auditEntries: AuditEntry[];
  loadingAudit: boolean;
  sessionId: string | null;
  onPolicyChange: (policy: SandboxNetworkPolicy) => void;
  onApply: () => Promise<void>;
}

const DEFAULT_INBOUND = {
  max_size_kb: 256,
  strip_headers: [] as string[],
  allowed_content_types: [] as string[],
};

export function SandboxNetworkTab({
  policy,
  auditEntries,
  loadingAudit,
  onPolicyChange,
  onApply,
}: SandboxNetworkTabProps) {
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
      inbound: {
        ...inbound,
        strip_headers: inbound.strip_headers.filter((_, i) => i !== index),
      },
    });
  }

  const networkEntries = auditEntries.filter((e) => e.category === 'network');

  return (
    <div className="grid flex-1 grid-cols-[1fr_300px] gap-0">
      {/* Left: Audit Feed */}
      <div className="overflow-y-auto border-r border-border/60 p-4">
        <div className="mb-3 text-[10px] uppercase tracking-wider text-muted-foreground">
          Network Audit
        </div>
        <SandboxAuditFeed
          entries={networkEntries}
          loading={loadingAudit}
          extraColumns={[
            { key: 'method', label: 'Method', render: (e) => e.method ?? '—' },
            { key: 'path', label: 'Path', render: (e) => e.path ?? '—' },
          ]}
        />
      </div>

      {/* Right: Policy Panel */}
      <div className="overflow-y-auto p-4">
        {/* Outbound */}
        <div className="mb-4">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-orange-400">
              ↑ Outbound
            </span>
          </div>
          <div className="mb-2 flex gap-2">
            <div className="text-[11px] text-muted-foreground">Default:</div>
            <Select
              value={policy.default}
              onValueChange={(v) =>
                onPolicyChange({ ...policy, default: v as 'allow' | 'deny' })
              }
            >
              <SelectTrigger className="h-6 w-20 text-[10px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="allow">allow</SelectItem>
                <SelectItem value="deny">deny</SelectItem>
              </SelectContent>
            </Select>
            <div className="text-[11px] text-muted-foreground">On block:</div>
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

        {/* Inbound */}
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
                  inbound: { ...inbound, max_size_kb: Number(e.target.value) },
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
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={addStripHeader}
              >
                <Plus className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </div>

        <Button size="sm" className="w-full text-xs" onClick={() => void onApply()}>
          Apply (Hot-reload)
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 6.4: Run test to verify it passes**

```bash
cd frontend && npx vitest run src/pages/sandbox/tabs/sandbox-network-tab.node.test.ts --config vitest.node.config.ts
```

Expected: PASS

- [ ] **Step 6.5: Commit**

```bash
git add frontend/src/pages/sandbox/tabs/sandbox-network-tab.tsx \
        frontend/src/pages/sandbox/tabs/sandbox-network-tab.node.test.ts
git commit -m "feat(sandbox): add SandboxNetworkTab with outbound rules + inbound header/size filtering"
```

---

## Task 7: Bash Tab

**Files:**
- Create: `frontend/src/pages/sandbox/tabs/sandbox-bash-tab.tsx`
- Test: `frontend/src/pages/sandbox/tabs/sandbox-bash-tab.node.test.ts`

- [ ] **Step 7.1: Write the failing test**

Create `frontend/src/pages/sandbox/tabs/sandbox-bash-tab.node.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { SandboxBashTab } from './sandbox-bash-tab';
import type { AuditEntry, SandboxInboundFilter, SandboxProcessPolicy } from '@/lib/types';

const policy: SandboxProcessPolicy = {
  allow_privileged: false,
  max_concurrent: 3,
  deny_commands: ['rm -rf', 'sudo'],
  timeout_seconds: 30,
  inbound: { max_size_kb: 32, strip_patterns: ['sk-[A-Za-z0-9]{32,}'], block_on_match: false },
};

const auditEntries: AuditEntry[] = [
  {
    id: 4,
    session_id: 'sess-1',
    agent_id: 'a1',
    ts: '2026-03-28T14:29:00Z',
    category: 'process',
    decision: 'allow',
    binary: 'ls',
    destination: null,
    method: null,
    path: '/workspace',
    reason: null,
    direction: 'outbound',
    filtered: false,
  },
];

describe('SandboxBashTab', () => {
  it('renders denied commands', () => {
    const html = renderToStaticMarkup(
      createElement(SandboxBashTab, {
        policy,
        auditEntries,
        loadingAudit: false,
        onPolicyChange: () => {},
        onApply: async () => {},
      }),
    );
    expect(html).toContain('rm -rf');
    expect(html).toContain('sudo');
  });

  it('renders audit entry binary', () => {
    const html = renderToStaticMarkup(
      createElement(SandboxBashTab, {
        policy,
        auditEntries,
        loadingAudit: false,
        onPolicyChange: () => {},
        onApply: async () => {},
      }),
    );
    expect(html).toContain('ls');
  });

  it('renders outbound and inbound labels', () => {
    const html = renderToStaticMarkup(
      createElement(SandboxBashTab, {
        policy,
        auditEntries,
        loadingAudit: false,
        onPolicyChange: () => {},
        onApply: async () => {},
      }),
    );
    expect(html).toContain('Outbound');
    expect(html).toContain('Inbound');
  });

  it('renders timeout_seconds value', () => {
    const html = renderToStaticMarkup(
      createElement(SandboxBashTab, {
        policy,
        auditEntries,
        loadingAudit: false,
        onPolicyChange: () => {},
        onApply: async () => {},
      }),
    );
    expect(html).toContain('30');
  });
});
```

- [ ] **Step 7.2: Run test to verify it fails**

```bash
cd frontend && npx vitest run src/pages/sandbox/tabs/sandbox-bash-tab.node.test.ts --config vitest.node.config.ts
```

Expected: FAIL — file does not exist.

- [ ] **Step 7.3: Create the Bash tab component**

Create `frontend/src/pages/sandbox/tabs/sandbox-bash-tab.tsx`:

```typescript
import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SandboxAuditFeed } from '../components/sandbox-audit-feed';
import { SandboxInboundFilterEditor } from '../components/sandbox-inbound-filter-editor';
import type { AuditEntry, SandboxInboundFilter, SandboxProcessPolicy } from '@/lib/types';

const DEFAULT_INBOUND: SandboxInboundFilter = {
  max_size_kb: 32,
  strip_patterns: ['AKIA[A-Z0-9]{16}', 'sk-[A-Za-z0-9]{32,}', 'ghp_[A-Za-z0-9]{36}'],
  block_on_match: false,
};

interface SandboxBashTabProps {
  policy: SandboxProcessPolicy;
  auditEntries: AuditEntry[];
  loadingAudit: boolean;
  onPolicyChange: (policy: SandboxProcessPolicy) => void;
  onApply: () => Promise<void>;
}

export function SandboxBashTab({
  policy,
  auditEntries,
  loadingAudit,
  onPolicyChange,
  onApply,
}: SandboxBashTabProps) {
  const [newCommand, setNewCommand] = useState('');
  const inbound = policy.inbound ?? DEFAULT_INBOUND;

  function addDeniedCommand() {
    const trimmed = newCommand.trim();
    if (!trimmed) return;
    onPolicyChange({ ...policy, deny_commands: [...policy.deny_commands, trimmed] });
    setNewCommand('');
  }

  function removeDeniedCommand(index: number) {
    onPolicyChange({
      ...policy,
      deny_commands: policy.deny_commands.filter((_, i) => i !== index),
    });
  }

  const bashEntries = auditEntries.filter((e) => e.category === 'process');

  return (
    <div className="grid flex-1 grid-cols-[1fr_300px] gap-0">
      {/* Left: Audit Feed */}
      <div className="overflow-y-auto border-r border-border/60 p-4">
        <div className="mb-3 text-[10px] uppercase tracking-wider text-muted-foreground">
          Bash Audit
        </div>
        <SandboxAuditFeed entries={bashEntries} loading={loadingAudit} />
      </div>

      {/* Right: Policy Panel */}
      <div className="overflow-y-auto p-4">
        {/* Outbound */}
        <div className="mb-4">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-orange-400">
              ↑ Outbound
            </span>
            <span className="text-[10px] text-muted-foreground">Command controls</span>
          </div>

          <div className="mb-3 space-y-2">
            {/* Deny commands */}
            <div>
              <div className="mb-1 text-[10px] text-muted-foreground">Denied commands</div>
              <div className="flex flex-wrap gap-1.5">
                {policy.deny_commands.map((cmd, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-1 rounded bg-red-500/10 px-2 py-0.5 border border-red-500/20"
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
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={addDeniedCommand}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            </div>

            {/* Allow privileged */}
            <div className="flex items-center justify-between rounded border border-border/60 px-3 py-2">
              <span className="text-[11px] text-foreground">Allow privileged</span>
              <button
                role="switch"
                aria-checked={policy.allow_privileged}
                onClick={() =>
                  onPolicyChange({ ...policy, allow_privileged: !policy.allow_privileged })
                }
                className={`relative h-5 w-9 rounded-full transition-colors ${
                  policy.allow_privileged ? 'bg-green-500' : 'bg-muted'
                }`}
              >
                <span
                  className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                    policy.allow_privileged ? 'translate-x-4' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>

            {/* Max concurrent */}
            <div className="flex items-center justify-between rounded border border-border/60 px-3 py-2">
              <span className="text-[11px] text-foreground">Max concurrent</span>
              <Input
                type="number"
                min={1}
                value={policy.max_concurrent}
                onChange={(e) =>
                  onPolicyChange({ ...policy, max_concurrent: Number(e.target.value) })
                }
                className="h-6 w-16 text-xs"
              />
            </div>

            {/* Timeout */}
            <div className="flex items-center justify-between rounded border border-border/60 px-3 py-2">
              <span className="text-[11px] text-foreground">Timeout (seconds)</span>
              <Input
                type="number"
                min={1}
                value={policy.timeout_seconds ?? 30}
                onChange={(e) =>
                  onPolicyChange({ ...policy, timeout_seconds: Number(e.target.value) })
                }
                className="h-6 w-16 text-xs"
              />
            </div>
          </div>
        </div>

        {/* Inbound */}
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

        <Button size="sm" className="w-full text-xs" onClick={() => void onApply()}>
          Apply Policy
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 7.4: Run test to verify it passes**

```bash
cd frontend && npx vitest run src/pages/sandbox/tabs/sandbox-bash-tab.node.test.ts --config vitest.node.config.ts
```

Expected: PASS

- [ ] **Step 7.5: Commit**

```bash
git add frontend/src/pages/sandbox/tabs/sandbox-bash-tab.tsx \
        frontend/src/pages/sandbox/tabs/sandbox-bash-tab.node.test.ts
git commit -m "feat(sandbox): add SandboxBashTab with deny-commands + timeout + stdout filtering"
```

---

## Task 8: Refactor SandboxMonitorPage

**Files:**
- Modify: `frontend/src/pages/sandbox/SandboxMonitorPage.tsx`
- Modify: `frontend/src/pages/sandbox/SandboxMonitorPage.node.test.ts`

- [ ] **Step 8.1: Update the existing test to expect the new tab structure**

Open `frontend/src/pages/sandbox/SandboxMonitorPage.node.test.ts` and add a test after the existing ones:

```typescript
// Add at end of existing test file, before the closing of the last describe block
it('renders tab bar with MCP Tools, Network, Bash tabs', () => {
  const html = renderToStaticMarkup(
    createElement(SandboxOverviewContent, buildProps()),
  );
  expect(html).toContain('MCP Tools');
  expect(html).toContain('Network');
  expect(html).toContain('Bash');
});

it('renders Overview tab by default', () => {
  const html = renderToStaticMarkup(
    createElement(SandboxOverviewContent, buildProps()),
  );
  expect(html).toContain('Overview');
});
```

- [ ] **Step 8.2: Run to verify new tests fail**

```bash
cd frontend && npx vitest run src/pages/sandbox/SandboxMonitorPage.node.test.ts --config vitest.node.config.ts
```

Expected: new tests FAIL, existing tests PASS.

- [ ] **Step 8.3: Add state and imports to `SandboxMonitorPage.tsx`**

At the top of the file, add the new imports (after existing imports):

```typescript
import { fetchMcpStatus, patchSessionMcpPolicy, patchSessionBashPolicy } from '@/lib/api';
import type { McpServerStatus, SandboxMcpPolicy, SandboxProcessPolicy } from '@/lib/types';
import { SandboxMcpTab } from './tabs/sandbox-mcp-tab';
import { SandboxNetworkTab } from './tabs/sandbox-network-tab';
import { SandboxBashTab } from './tabs/sandbox-bash-tab';
```

In `SandboxOverviewContent`, add `activeTab` to its props interface and render the tab bar. In `SandboxMonitorPage`, add the new state:

```typescript
// Add to SandboxMonitorPage state:
const [activeTab, setActiveTab] = useState<'overview' | 'mcp' | 'network' | 'bash'>('overview');
const [mcpServers, setMcpServers] = useState<McpServerStatus[]>([]);
```

- [ ] **Step 8.4: Add MCP server loading to `loadOverview`**

Inside the `loadOverview` callback, add `fetchMcpStatus()` to the `Promise.all` call:

```typescript
const [nextSummary, nextConfig, nextAgents, nextSessions, nextMcpServers] = await Promise.all([
  fetchSystemSummary(),
  fetchConfig(),
  fetchAgents(),
  fetchSessions(),
  fetchMcpStatus().catch(() => [] as McpServerStatus[]),  // graceful fallback
]);
// ...existing state sets...
setMcpServers(nextMcpServers);
```

- [ ] **Step 8.5: Add tab bar and agent selector to `SandboxOverviewContent`**

Add a tab bar and agent selector to `SandboxOverviewContent`. Replace the section below the summary cards (before the existing sessions/agents cards) with:

```typescript
{/* Agent Selector + Tab Bar */}
<div className="flex items-center gap-4 border-b border-border/60 px-6">
  <div className="flex items-center gap-2 py-2">
    <span className="text-[11px] text-muted-foreground">Agent:</span>
    <select
      value={selectedAgentId ?? ''}
      onChange={(e) => onSelectAgent(e.target.value)}
      className="rounded border border-border bg-card px-2 py-1 text-xs text-foreground"
    >
      {agents.map((a) => (
        <option key={a.id} value={a.id}>
          {a.emoji} {a.name}
        </option>
      ))}
    </select>
  </div>
  <nav className="flex">
    {(['overview', 'mcp', 'network', 'bash'] as const).map((tab) => (
      <button
        key={tab}
        onClick={() => onTabChange(tab)}
        className={`px-4 py-2.5 text-[13px] capitalize transition-colors border-b-2 ${
          activeTab === tab
            ? 'border-primary text-primary font-semibold'
            : 'border-transparent text-muted-foreground hover:text-foreground'
        }`}
      >
        {tab === 'mcp' ? 'MCP Tools' : tab.charAt(0).toUpperCase() + tab.slice(1)}
      </button>
    ))}
  </nav>
</div>

{/* Tab Content */}
{activeTab === 'overview' && (
  <div>{/* existing sessions + agent policies + audit log cards go here */}</div>
)}
{activeTab === 'mcp' && selectedAgentId && (
  <SandboxMcpTab
    servers={mcpServers}
    policy={
      agents.find((a) => a.id === selectedAgentId)?.sandboxPolicy?.sandbox.mcp ?? {
        default: 'deny',
        servers: {},
        inbound: { max_size_kb: 64, strip_patterns: DEFAULT_STRIP_PATTERNS, block_on_match: true },
      }
    }
    auditEntries={auditEntries}
    loadingAudit={loadingEntries}
    onPolicyChange={(mcp) => void handleMcpPolicyChange(selectedAgentId, mcp)}
    onApply={() => handleApplyMcpPolicy(selectedAgentId)}
  />
)}
{activeTab === 'network' && selectedAgentId && (
  <SandboxNetworkTab
    policy={
      agents.find((a) => a.id === selectedAgentId)?.sandboxPolicy?.sandbox.network ?? {
        default: 'deny',
        on_block: 'prompt',
        allow: [],
      }
    }
    auditEntries={auditEntries}
    loadingAudit={loadingEntries}
    sessionId={selectedSessionId}
    onPolicyChange={(network) => void handleNetworkPolicyChange(selectedAgentId, network)}
    onApply={() =>
      selectedSessionId
        ? handleApplyNetworkPolicy(selectedSessionId, agents.find((a) => a.id === selectedAgentId)?.sandboxPolicy?.sandbox.network ?? { default: 'deny', on_block: 'prompt', allow: [] })
        : Promise.resolve()
    }
  />
)}
{activeTab === 'bash' && selectedAgentId && (
  <SandboxBashTab
    policy={
      agents.find((a) => a.id === selectedAgentId)?.sandboxPolicy?.sandbox.process ?? {
        allow_privileged: false,
        max_concurrent: 3,
        deny_commands: [],
        timeout_seconds: 30,
      }
    }
    auditEntries={auditEntries}
    loadingAudit={loadingEntries}
    onPolicyChange={(process) => void handleBashPolicyChange(selectedAgentId, process)}
    onApply={() => handleApplyBashPolicy(selectedAgentId)}
  />
)}
```

- [ ] **Step 8.6: Add handler functions to `SandboxMonitorPage`**

Add these handlers inside `SandboxMonitorPage` (alongside existing `handleApplyNetworkPolicy`):

```typescript
const DEFAULT_STRIP_PATTERNS = [
  'AKIA[A-Z0-9]{16}',
  'sk-[A-Za-z0-9]{32,}',
  'ghp_[A-Za-z0-9]{36}',
  'password\\s*[:=]\\s*\\S+',
];

const handleMcpPolicyChange = useCallback(
  async (agentId: string, mcp: SandboxMcpPolicy) => {
    const agent = agents.find((a) => a.id === agentId);
    if (!agent?.sandboxPolicy) return;
    const updated: SandboxPolicy = {
      ...agent.sandboxPolicy,
      sandbox: { ...agent.sandboxPolicy.sandbox, mcp },
    };
    await putAgentSandbox(agentId, updated);
  },
  [agents],
);

const handleApplyMcpPolicy = useCallback(
  async (agentId: string) => {
    if (!selectedSessionId) return;
    const agent = agents.find((a) => a.id === agentId);
    const mcp = agent?.sandboxPolicy?.sandbox.mcp;
    if (!mcp) return;
    await patchSessionMcpPolicy(selectedSessionId, mcp);
    toast.success('MCP policy applied.');
  },
  [agents, selectedSessionId],
);

const handleNetworkPolicyChange = useCallback(
  async (agentId: string, network: SandboxNetworkPolicy) => {
    const agent = agents.find((a) => a.id === agentId);
    if (!agent?.sandboxPolicy) return;
    const updated: SandboxPolicy = {
      ...agent.sandboxPolicy,
      sandbox: { ...agent.sandboxPolicy.sandbox, network },
    };
    await putAgentSandbox(agentId, updated);
  },
  [agents],
);

const handleBashPolicyChange = useCallback(
  async (agentId: string, process: SandboxProcessPolicy) => {
    const agent = agents.find((a) => a.id === agentId);
    if (!agent?.sandboxPolicy) return;
    const updated: SandboxPolicy = {
      ...agent.sandboxPolicy,
      sandbox: { ...agent.sandboxPolicy.sandbox, process },
    };
    await putAgentSandbox(agentId, updated);
  },
  [agents],
);

const handleApplyBashPolicy = useCallback(
  async (agentId: string) => {
    if (!selectedSessionId) return;
    const agent = agents.find((a) => a.id === agentId);
    const process = agent?.sandboxPolicy?.sandbox.process;
    if (!process) return;
    await patchSessionBashPolicy(selectedSessionId, process);
    toast.success('Bash policy applied.');
  },
  [agents, selectedSessionId],
);
```

Pass `activeTab`, `onTabChange`, `mcpServers`, `DEFAULT_STRIP_PATTERNS` through `SandboxOverviewContent` props.

- [ ] **Step 8.7: Run all sandbox tests**

```bash
cd frontend && npx vitest run src/pages/sandbox/ --config vitest.node.config.ts
```

Expected: all PASS

- [ ] **Step 8.8: Start dev server and verify visually**

```bash
cd frontend && npm run dev
```

Open `http://localhost:5173/sandbox`. Verify:
- Tab bar shows: Overview | MCP Tools | Network | Bash
- Agent selector is present and changes active agent
- MCP Tools tab shows server list with ALLOW/DENY toggles and inbound filter panel
- Network tab shows audit feed + outbound rules + inbound header stripping
- Bash tab shows denied commands + timeout controls + stdout filter
- Apply buttons trigger toast notifications

- [ ] **Step 8.9: Commit**

```bash
git add frontend/src/pages/sandbox/SandboxMonitorPage.tsx \
        frontend/src/pages/sandbox/SandboxMonitorPage.node.test.ts
git commit -m "feat(sandbox): refactor SandboxMonitorPage with tab bar and bidirectional MCP/network/bash policy"
```
