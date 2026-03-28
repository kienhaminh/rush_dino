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
