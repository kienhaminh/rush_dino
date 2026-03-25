import type { AgentRecord, AgentRuntimeData, AgentSoulData, AgentMemoryEntry } from './agent-types';

export const AGENT_PANELS = [
  'overview',
  'tools',
  'skills',
  'channels',
  'cron',
] as const;

export const MOCK_AGENTS: AgentRecord[] = [
  {
    id: 'main',
    name: 'Main Agent',
    emoji: '🤖',
    isDefault: true,
    workspace: 'default',
    description: 'Default assistant used for normal routing.',
  },
  {
    id: 'research',
    name: 'Research Agent',
    emoji: '🧭',
    isDefault: false,
    workspace: 'workspace/research',
    description: 'Focused on retrieval and web research tasks.',
  },
  {
    id: 'planner',
    name: 'Planner',
    emoji: '📋',
    isDefault: false,
    workspace: 'workspace/planner',
    description: 'Ideation, planning, and delivery specialist.',
  },
  {
    id: 'code-simplifier',
    name: 'Code Simplifier',
    emoji: '🧹',
    isDefault: false,
    workspace: 'workspace/code-simplifier',
    description: 'Refactoring specialist for reducing complexity safely.',
  },
  {
    id: 'debugger',
    name: 'Debugger',
    emoji: '🪲',
    isDefault: false,
    workspace: 'workspace/debugger',
    description: 'Root-cause specialist for failures and runtime issues.',
  },
  {
    id: 'docs-manager',
    name: 'Docs Manager',
    emoji: '📚',
    isDefault: false,
    workspace: 'workspace/docs',
    description: 'Maintains technical docs, runbooks, and decision records.',
  },
  {
    id: 'fullstack-developer',
    name: 'Fullstack Developer',
    emoji: '🧩',
    isDefault: false,
    workspace: 'workspace/fullstack',
    description: 'Implements end-to-end features across frontend and backend.',
  },
  {
    id: 'tester',
    name: 'Tester',
    emoji: '✅',
    isDefault: false,
    workspace: 'workspace/test',
    description: 'Designs test strategy and regression coverage.',
  },
  {
    id: 'designer',
    name: 'Designer',
    emoji: '🎨',
    isDefault: false,
    workspace: 'workspace/design',
    description: 'Full-spectrum designer covering UX, visual, and creative direction.',
  },
  {
    id: 'writer',
    name: 'Writer',
    emoji: '✍️',
    isDefault: false,
    workspace: 'workspace/writer',
    description: 'All writing: docs, articles, marketing, SEO, and creative content.',
  },
];

// ------------------------------------------------------------------
// Shared soul templates
// ------------------------------------------------------------------

const SOUL_MAIN: AgentSoulData = {
  persona: 'A reliable, pragmatic generalist that routes and coordinates across all domains.',
  tone: 'Direct, clear, and action-oriented. Minimal fluff.',
  coreValues: [
    'Clarity over cleverness',
    'Ask before assuming',
    'Surface blockers early',
    'Prefer reversible actions',
  ],
  traits: [
    {
      id: 't1',
      label: 'Decisive',
      description: 'Makes a call when options are clear rather than stalling.',
    },
    {
      id: 't2',
      label: 'Transparent',
      description: 'Shows reasoning and flags uncertainty explicitly.',
    },
    {
      id: 't3',
      label: 'Concise',
      description: 'Keeps output tight — bullets over prose when possible.',
    },
    {
      id: 't4',
      label: 'Proactive',
      description: 'Anticipates the next logical step and mentions it.',
    },
  ],
  systemPrompt:
    'You are the main coordination agent. Your job is to triage requests, delegate to specialist agents, and provide clear, actionable responses. Always prefer the simplest correct path. When unsure, ask one clarifying question.',
};

const SOUL_RESEARCH: AgentSoulData = {
  persona: 'A meticulous researcher who prizes source quality and intellectual honesty.',
  tone: 'Measured, inquisitive, and citation-aware. Academic but accessible.',
  coreValues: [
    'Primary sources first',
    'Flag speculation clearly',
    'Cite everything non-obvious',
    'Acknowledge conflicting evidence',
  ],
  traits: [
    { id: 't1', label: 'Thorough', description: 'Explores multiple angles before concluding.' },
    {
      id: 't2',
      label: 'Skeptical',
      description: 'Challenges assumptions and tests claims against evidence.',
    },
    {
      id: 't3',
      label: 'Organized',
      description: 'Structures findings in scannable, hierarchical outputs.',
    },
    {
      id: 't4',
      label: 'Humble',
      description: 'Admits knowledge boundaries rather than fabricating.',
    },
  ],
  systemPrompt:
    'You are a research specialist. Your outputs must be grounded in evidence. Always attribute claims to sources. When synthesizing, distinguish between established fact, expert consensus, and minority view. Avoid filler.',
};

const SOUL_PLANNER: AgentSoulData = {
  persona: 'A strategic thinker who brainstorms options, builds actionable plans, and drives delivery.',
  tone: 'Structured, decisive, and action-oriented. Clarity > verbosity.',
  coreValues: [
    'Explore before committing',
    'Plans must be actionable',
    'Surface risks early',
    'Deliver incrementally',
  ],
  traits: [
    {
      id: 't1',
      label: 'Generative',
      description: 'Produces diverse ideas and options before narrowing.',
    },
    {
      id: 't2',
      label: 'Structured',
      description: 'Organizes work into phases, milestones, and dependencies.',
    },
    {
      id: 't3',
      label: 'Decisive',
      description: 'Recommends a path forward with clear reasoning.',
    },
    {
      id: 't4',
      label: 'Risk-aware',
      description: 'Anticipates blockers and proposes mitigations.',
    },
  ],
  systemPrompt:
    'You are a planning specialist. Cover the full lifecycle: brainstorm options, build actionable plans, and track delivery. Use structured formats. Recommend a path forward with tradeoffs.',
};

const SOUL_DEFAULT: AgentSoulData = {
  persona: 'A focused specialist operating within its defined domain.',
  tone: 'Professional, precise, and task-oriented.',
  coreValues: [
    'Domain expertise first',
    'No scope creep',
    'Fail loudly on ambiguity',
    'Document decisions',
  ],
  traits: [
    { id: 't1', label: 'Focused', description: 'Stays within its area of responsibility.' },
    { id: 't2', label: 'Precise', description: 'Uses exact terminology and avoids approximation.' },
    {
      id: 't3',
      label: 'Reliable',
      description: 'Produces consistent outputs across similar inputs.',
    },
  ],
  systemPrompt:
    'You are a specialized agent. Focus exclusively on your domain. Delegate out-of-scope requests to the appropriate agent. Produce high-quality, expert-level output.',
};

// ------------------------------------------------------------------
// Memory helpers
// ------------------------------------------------------------------

function makeMemory(
  id: string,
  content: string,
  type: AgentMemoryEntry['type'],
  importance: AgentMemoryEntry['importance'],
  tag: string,
  createdAt: string,
  active = true,
): AgentMemoryEntry {
  return { id, content, type, importance, tag, createdAt, active };
}

// ------------------------------------------------------------------
// Runtime data per agent
// ------------------------------------------------------------------

export const MOCK_AGENT_RUNTIME: Record<string, AgentRuntimeData> = {
  main: {
    soul: SOUL_MAIN,
    memory: [
      makeMemory(
        'm1',
        'User prefers bullet-point summaries over prose paragraphs.',
        'preference',
        'high',
        'output-style',
        '2026-02-10',
      ),
      makeMemory(
        'm2',
        'The project stack is: Vite + React + TypeScript + TailwindCSS + Shadcn UI.',
        'fact',
        'critical',
        'project',
        '2026-02-01',
      ),
      makeMemory(
        'm3',
        'Always check tasks/todo.md before starting a new implementation task.',
        'instruction',
        'critical',
        'workflow',
        '2026-02-05',
      ),
      makeMemory(
        'm4',
        'Kien prefers dark-themed UIs and values premium aesthetic over minimal.',
        'preference',
        'medium',
        'design',
        '2026-02-12',
      ),
      makeMemory(
        'm5',
        'Backend uses Rust. Avoid suggesting Node.js for server-side concerns.',
        'fact',
        'high',
        'project',
        '2026-02-08',
      ),
      makeMemory(
        'm6',
        'The main development branch is "main". Feature branches use kebab-case.',
        'fact',
        'medium',
        'git',
        '2026-02-03',
      ),
      makeMemory(
        'm7',
        'Never commit secrets or API keys. Always use .env files.',
        'instruction',
        'critical',
        'security',
        '2026-02-01',
      ),
    ],
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
          {
            id: 'read',
            label: 'Read',
            description: 'Read files and directories.',
            enabled: true,
            source: 'core',
          },
          {
            id: 'edit',
            label: 'Edit',
            description: 'Modify workspace files.',
            enabled: true,
            source: 'core',
          },
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
    cronStatus: { enabled: true, jobs: 3, nextWake: 'in 11m' },
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
    soul: SOUL_RESEARCH,
    memory: [
      makeMemory(
        'm1',
        'Always prefer official documentation over third-party blog posts.',
        'instruction',
        'critical',
        'sourcing',
        '2026-02-01',
      ),
      makeMemory(
        'm2',
        'The user is researching AI agent architectures and multi-agent coordination.',
        'context',
        'high',
        'topic',
        '2026-02-14',
      ),
      makeMemory(
        'm3',
        "Anthropic's Constitutional AI paper (2022) is a primary reference for alignment.",
        'fact',
        'high',
        'references',
        '2026-02-10',
      ),
      makeMemory(
        'm4',
        'User prefers research summaries in ≤5 key takeaways with source links.',
        'preference',
        'medium',
        'output-style',
        '2026-02-08',
      ),
      makeMemory(
        'm5',
        'Cross-reference claims against at least two independent sources.',
        'instruction',
        'high',
        'quality',
        '2026-02-01',
      ),
      makeMemory(
        'm6',
        'LangChain and AutoGen are the primary frameworks to compare against.',
        'fact',
        'medium',
        'topic',
        '2026-02-12',
      ),
    ],
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
          {
            id: 'read',
            label: 'Read',
            description: 'Read files and dirs.',
            enabled: true,
            source: 'core',
          },
          {
            id: 'exec',
            label: 'Exec',
            description: 'Run analysis commands.',
            enabled: true,
            source: 'core',
          },
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
    cronStatus: { enabled: true, jobs: 1, nextWake: 'in 34m' },
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

  planner: {
    soul: SOUL_PLANNER,
    memory: [
      makeMemory(
        'm1',
        'User tends to respond best to 5–10 idea options rather than 2–3.',
        'preference',
        'high',
        'output-style',
        '2026-02-15',
      ),
      makeMemory(
        'm2',
        'The product is an AI agent management platform called RushDino.',
        'context',
        'critical',
        'project',
        '2026-02-01',
      ),
      makeMemory(
        'm3',
        'Analogies from gaming, architecture, and nature resonate with the user.',
        'preference',
        'medium',
        'communication',
        '2026-02-11',
      ),
      makeMemory(
        'm4',
        'Avoid suggesting ideas that require major architectural changes unless asked.',
        'instruction',
        'high',
        'scope',
        '2026-02-08',
      ),
      makeMemory(
        'm5',
        'User values novel UI interactions — micro-animations, glassmorphism, etc.',
        'preference',
        'medium',
        'design',
        '2026-02-14',
      ),
    ],
    files: [
      {
        name: 'AGENTS.md',
        path: '/workspace/planner/AGENTS.md',
        size: '3.1 KB',
        updatedAt: '30m ago',
        content: '# Planner\n\nBrainstorm options, build plans, and drive delivery.',
      },
    ],
    toolsProfile: 'minimal',
    toolSections: [
      {
        id: 'core',
        label: 'Core Tools',
        tools: [
          {
            id: 'read',
            label: 'Read',
            description: 'Read context files.',
            enabled: true,
            source: 'core',
          },
          {
            id: 'web-search',
            label: 'Web Search',
            description: 'Search for inspiration.',
            enabled: true,
            source: 'core',
          },
        ],
      },
    ],
    skills: [
      {
        name: 'frontend-design',
        description: 'Visual design concepts and UI patterns.',
        group: 'bundled',
        source: 'bundled',
        enabled: true,
        emoji: '🎨',
      },
    ],
    channels: [],
    cronStatus: { enabled: false, jobs: 0, nextWake: 'n/a' },
    cronJobs: [],
  },
};

// Fallback soul for agents without specific soul data
const FALLBACK_SOUL: AgentSoulData = SOUL_DEFAULT;
const FALLBACK_MEMORY: AgentMemoryEntry[] = [];

/**
 * Returns a complete AgentRuntimeData stub for any agent ID,
 * merging fallback soul/memory if not explicitly mocked.
 */
export function getAgentRuntime(agentId: string): AgentRuntimeData {
  const existing = MOCK_AGENT_RUNTIME[agentId];
  if (existing) return existing;

  return {
    soul: FALLBACK_SOUL,
    memory: FALLBACK_MEMORY,
    files: [],
    toolsProfile: 'runtime',
    toolSections: [],
    skills: [],
    channels: [],
    cronStatus: { enabled: false, jobs: 0, nextWake: 'n/a' },
    cronJobs: [],
  };
}
