import type { AgentRecord, AgentRuntimeData } from './agent-types';

export const AGENT_PANELS = ['overview', 'files', 'tools', 'skills', 'channels', 'cron'] as const;

export const MOCK_AGENTS: AgentRecord[] = [
  {
    id: 'main',
    name: 'Main Agent',
    emoji: '🤖',
    isDefault: true,
    workspace: 'default',
    model: 'gpt-4o',
    description: 'Default assistant used for normal routing.',
  },
  {
    id: 'research',
    name: 'Research Agent',
    emoji: '🧭',
    isDefault: false,
    workspace: 'workspace/research',
    model: 'claude-3.7-sonnet',
    description: 'Focused on retrieval and web research tasks.',
  },
];

export const MOCK_AGENT_RUNTIME: Record<string, AgentRuntimeData> = {
  main: {
    files: [
      {
        name: 'AGENTS.md',
        path: '/workspace/default/AGENTS.md',
        size: '4.2 KB',
        updatedAt: '5m ago',
        content: '# Main Agent\n\nPrimary behavior and coding guardrails.',
      },
      {
        name: 'identity.md',
        path: '/workspace/default/identity.md',
        size: '1.1 KB',
        updatedAt: '2h ago',
        content: 'name: Main Agent\nemoji: 🤖\nstyle: direct',
      },
      {
        name: 'skills.md',
        path: '/workspace/default/skills.md',
        size: '0 KB',
        updatedAt: 'never',
        missing: true,
        content: '',
      },
    ],
    toolsProfile: 'full',
    toolSections: [
      {
        id: 'core',
        label: 'Core Tools',
        tools: [
          { id: 'read', label: 'Read', description: 'Read files and directories.', enabled: true, source: 'core' },
          { id: 'edit', label: 'Edit', description: 'Modify workspace files.', enabled: true, source: 'core' },
          {
            id: 'exec',
            label: 'Exec',
            description: 'Run shell commands in workspace.',
            enabled: true,
            source: 'core',
          },
        ],
      },
      {
        id: 'network',
        label: 'Network',
        tools: [
          {
            id: 'web-search',
            label: 'Web Search',
            description: 'Search the web for external context.',
            enabled: true,
            source: 'core',
          },
          {
            id: 'web-fetch',
            label: 'Web Fetch',
            description: 'Fetch and summarize external pages.',
            enabled: false,
            source: 'core',
          },
        ],
      },
    ],
    skills: [
      {
        name: 'code-review',
        description: 'Prioritize bug and risk findings for reviews.',
        group: 'workspace',
        source: 'workspace',
        enabled: true,
        emoji: '🔍',
      },
      {
        name: 'frontend-design',
        description: 'Build polished UI with strong visual hierarchy.',
        group: 'bundled',
        source: 'bundled',
        enabled: true,
        emoji: '🎨',
      },
      {
        name: 'skill-installer',
        description: 'Install curated skills from local or remote sources.',
        group: 'built-in',
        source: 'builtin',
        enabled: false,
        emoji: '🧰',
      },
    ],
    channels: [
      {
        id: 'discord',
        label: 'Discord',
        accounts: [
          {
            accountId: 'main-bot',
            name: 'Main Bot',
            connected: true,
            configured: true,
            enabled: true,
          },
        ],
      },
      {
        id: 'telegram',
        label: 'Telegram',
        accounts: [
          {
            accountId: 'ops',
            name: 'Ops Bot',
            connected: false,
            configured: true,
            enabled: true,
            lastError: 'token rotated',
          },
        ],
      },
    ],
    cronStatus: {
      enabled: true,
      jobs: 3,
      nextWake: 'in 11m',
    },
    cronJobs: [
      {
        id: 'job-main-digest',
        name: 'Daily Digest',
        description: 'Summarize channel status every morning.',
        schedule: '0 9 * * *',
        enabled: true,
        nextRun: 'tomorrow 09:00',
        state: 'idle',
        payload: 'agentTurn model=gpt-4o',
      },
    ],
  },
  research: {
    files: [
      {
        name: 'AGENTS.md',
        path: '/workspace/research/AGENTS.md',
        size: '5.8 KB',
        updatedAt: '12m ago',
        content: '# Research Agent\n\nUse external references and structured synthesis.',
      },
      {
        name: 'sources.md',
        path: '/workspace/research/sources.md',
        size: '2.5 KB',
        updatedAt: '1h ago',
        content: '- docs.openclaw.ai\n- github.com/openclaw',
      },
    ],
    toolsProfile: 'balanced',
    toolSections: [
      {
        id: 'analysis',
        label: 'Analysis',
        tools: [
          { id: 'read', label: 'Read', description: 'Read files and dirs.', enabled: true, source: 'core' },
          { id: 'exec', label: 'Exec', description: 'Run analysis commands.', enabled: true, source: 'core' },
          {
            id: 'memory-search',
            label: 'Memory Search',
            description: 'Query indexed notes and context.',
            enabled: true,
            source: 'plugin',
          },
        ],
      },
      {
        id: 'web',
        label: 'Web',
        tools: [
          {
            id: 'web-search',
            label: 'Web Search',
            description: 'Search for primary sources.',
            enabled: true,
            source: 'core',
          },
          {
            id: 'web-fetch',
            label: 'Web Fetch',
            description: 'Fetch full pages for synthesis.',
            enabled: true,
            source: 'core',
          },
        ],
      },
    ],
    skills: [
      {
        name: 'deep-data-crawler-import',
        description: 'Crawl and package structured knowledge exports.',
        group: 'workspace',
        source: 'workspace',
        enabled: true,
        emoji: '🕸️',
      },
      {
        name: 'vercel-react-best-practices',
        description: 'Apply performance best practices when reviewing UI.',
        group: 'bundled',
        source: 'bundled',
        enabled: true,
        emoji: '⚡',
      },
      {
        name: 'web-design-guidelines',
        description: 'Audit usability and accessibility for interfaces.',
        group: 'built-in',
        source: 'builtin',
        enabled: true,
        emoji: '📐',
      },
    ],
    channels: [
      {
        id: 'slack',
        label: 'Slack',
        accounts: [
          {
            accountId: 'research',
            name: 'Research Relay',
            connected: true,
            configured: true,
            enabled: true,
          },
        ],
      },
      {
        id: 'notion',
        label: 'Notion',
        accounts: [
          {
            accountId: 'knowledge-base',
            name: 'KB Sync',
            connected: false,
            configured: false,
            enabled: false,
          },
        ],
      },
    ],
    cronStatus: {
      enabled: true,
      jobs: 1,
      nextWake: 'in 34m',
    },
    cronJobs: [
      {
        id: 'job-research-watch',
        name: 'Topic Watch',
        description: 'Track keyword updates and summarize changes.',
        schedule: '*/30 * * * *',
        enabled: true,
        nextRun: 'today 15:30',
        state: 'queued',
        payload: 'agentTurn model=claude-3.7-sonnet',
      },
    ],
  },
};
