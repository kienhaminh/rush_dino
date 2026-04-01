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
