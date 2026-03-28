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

  it('renders allow rule host', () => {
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
    expect(html).toContain('api.example.com:443');
  });
});
