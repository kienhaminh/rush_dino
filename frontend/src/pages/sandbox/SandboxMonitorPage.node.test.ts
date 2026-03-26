import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';

import { SandboxOverviewContent, type SandboxOverviewContentProps } from './SandboxMonitorPage';

function buildProps(overrides: Partial<SandboxOverviewContentProps> = {}): SandboxOverviewContentProps {
  return {
    summary: {
      generatedAt: '2026-03-18T00:00:00Z',
      status: 'healthy',
      uptimeSecs: 3600,
      activeProvider: 'openai',
      effectiveProfileId: null,
      defaultProfileId: null,
      runtimeUnavailableError: null,
      profilesCount: 1,
      fallbackProfileIds: [],
      channels: [],
      approvals: { pendingCount: 1, pending: [] },
      runs: {
        totalCount: 1,
        activeCount: 1,
        queuedCount: 0,
        blockedCount: 0,
        failedCount: 0,
        mostRecentId: 'run-1',
      },
      conversations: {
        totalCount: 1,
        updatedLastHour: 1,
        mostRecentId: 'sess-1',
        mostRecentTitle: 'Sandbox session',
      },
      security: {
        hmacAuthEnabled: true,
        allowedOriginsCount: 1,
        sandboxEnabled: true,
        sandboxAllowNetwork: false,
        sandboxWorkspaceRoot: '/workspace',
      },
      incidents: [],
      agentConfig: null,
    },
    config: {
      host: '127.0.0.1',
      port: 3000,
      profiles: [],
      fallback_profile_ids: [],
      ollama: { base_url: '' },
      openai: { base_url: '', default_model: '', reasoning_model: '', embeddings_model: '' },
      anthropic: { base_url: '', default_model: '', reasoning_model: '', embeddings_model: '' },
      openai_codex: { base_url: '', default_model: '', reasoning_model: '', embeddings_model: '' },
      gateway: {
        telegram: { enabled: false },
        discord: { enabled: false },
        slack: { enabled: false },
        whatsapp: { enabled: false },
        openclaw: { enabled: false },
        line: { enabled: false },
        webchat: { enabled: false },
      },
      allowed_chat_ids: [],
      security: {
        api_secret: '',
        hmac_auth_enabled: true,
        dashboard_auth_enabled: false,
        allowed_origins: [],
      },
      execution: {
        shell_exec_sandbox: {
          enabled: true,
          workspace_root: '/workspace',
          allow_network: false,
          extra_write_roots: ['/tmp', '/var/tmp'],
        },
      },
    },
    agents: [
      {
        id: 'ops-agent',
        name: 'Ops Agent',
        emoji: '🤖',
        isDefault: false,
        workspace: '/tmp/ops-agent',
        description: 'Ops',
        sandboxPolicy: {
          version: '1',
          sandbox: {
            filesystem: {
              default: 'deny',
              allow: [{ path: '/workspace', mode: 'read-write' }],
              deny: ['/etc'],
            },
            process: {
              allow_privileged: false,
              max_concurrent: 2,
              deny_commands: ['curl'],
            },
            network: {
              default: 'deny',
              on_block: 'prompt',
              allow: [{ host: 'api.example.com', port: 443, methods: ['GET'], paths: ['/*'] }],
            },
            inference: {
              enabled: true,
              route_via: 'http://gateway.internal',
              strip_agent_credentials: true,
              inject_provider: 'openai',
            },
          },
          providers: [{ name: 'openai', inject: { OPENAI_API_KEY: 'secret' } }],
        },
      },
      {
        id: 'plain-agent',
        name: 'Plain Agent',
        emoji: '🤖',
        isDefault: false,
        workspace: '/tmp/plain-agent',
        description: 'Plain',
        sandboxPolicy: null,
      },
    ],
    sessions: [
      {
        id: 'sess-1',
        title: 'Sandbox session',
        createdAt: '2026-03-18T00:00:00Z',
        updatedAt: '2026-03-18T00:10:00Z',
        status: 'active',
        messageCount: 4,
        pendingApprovalCount: 1,
        activeRunCount: 1,
        queuedRunCount: 0,
        lastRunId: 'run-1',
        contextWindow: {},
      },
    ],
    selectedSessionId: 'sess-1',
    selectedAgentId: 'ops-agent',
    auditEntries: [
      {
        id: 1,
        session_id: 'sess-1',
        agent_id: 'ops-agent',
        ts: '2026-03-18T00:12:00Z',
        category: 'network',
        decision: 'pending',
        binary: null,
        destination: 'api.example.com:443',
        method: 'GET',
        path: '/v1/data',
        reason: 'Needs approval',
      },
    ],
    loadingOverview: false,
    loadingEntries: false,
    fetchError: null,
    actionInProgress: null,
    onSelectSession: () => undefined,
    onRefreshOverview: () => undefined,
    onRefreshEntries: () => undefined,
    onApprove: () => undefined,
    onDeny: () => undefined,
    onApplyNetworkPolicy: async () => undefined,
    ...overrides,
  };
}

describe('SandboxOverviewContent', () => {
  it('renders shell sandbox posture and agent policy summaries', () => {
    const html = renderToStaticMarkup(createElement(SandboxOverviewContent, buildProps()));

    expect(html).toContain('Shell sandbox posture');
    expect(html).toContain('/workspace');
    expect(html).toContain('/tmp');
    expect(html).toContain('Agent policies');
    expect(html).toContain('Ops Agent');
    expect(html).toContain('Selected agent policy');
    expect(html).toContain('No policy');
    expect(html).toContain('Live sessions');
    expect(html).toContain('Audit log');
  });

  it('renders one expanded agent policy inspector with full rules and provider env', () => {
    const html = renderToStaticMarkup(createElement(SandboxOverviewContent, buildProps()));

    expect(html).toContain('Selected agent policy');
    expect(html).toContain('Allowed paths');
    expect(html).toContain('/workspace');
    expect(html).toContain('Denied paths');
    expect(html).toContain('/etc');
    expect(html).toContain('api.example.com');
    expect(html).toContain('OPENAI_API_KEY');
    expect(html).toContain('http://gateway.internal');
  });
});
