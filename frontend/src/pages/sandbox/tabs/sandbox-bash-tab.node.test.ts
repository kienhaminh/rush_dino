import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { SandboxBashTab } from './sandbox-bash-tab';
import type { AuditEntry, SandboxProcessPolicy } from '@/lib/types';

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

  it('renders audit entry binary via audit feed', () => {
    const html = renderToStaticMarkup(
      createElement(SandboxBashTab, {
        policy,
        auditEntries,
        loadingAudit: false,
        onPolicyChange: () => {},
        onApply: async () => {},
      }),
    );
    // 'ls' appears via SandboxAuditFeed destination fallback to binary
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
