import {
  MessageSquare,
  BarChart,
  Radio,
  FileText,
  Zap,
  Monitor,
  Settings,
  Bug,
  ScrollText,
  Folder,
  Loader,
  LayoutGrid,
  GitBranch,
  ShieldCheck,
  Stethoscope,
  Activity,
  Waypoints,
} from 'lucide-react';

export const TAB_GROUPS = [
  { label: 'assistant', tabs: ['chat', 'runs', 'agents', 'agent-board', 'workflows', 'skills'] },
  {
    label: 'operations',
    tabs: ['overview', 'soul-memory', 'gateway', 'approvals', 'sessions', 'logs', 'metrics', 'cron'],
  },
  { label: 'connectivity', tabs: ['instances'] },
  { label: 'system', tabs: ['config', 'diagnostics', 'nodes', 'debug'] },
] as const;

export type Tab =
  | 'agent-board'
  | 'agents'
  | 'runs'
  | 'workflows'
  | 'overview'
  | 'soul-memory'
  | 'gateway'
  | 'approvals'
  | 'instances'
  | 'sessions'
  | 'metrics'
  | 'cron'
  | 'skills'
  | 'nodes'
  | 'chat'
  | 'config'
  | 'diagnostics'
  | 'debug'
  | 'logs';

export const TAB_ICONS: Record<Tab, any> = {
  'agent-board': LayoutGrid,
  agents: Folder,
  runs: Activity,
  workflows: GitBranch,
  chat: MessageSquare,
  overview: BarChart,
  'soul-memory': Settings,
  gateway: Waypoints,
  approvals: ShieldCheck,
  instances: Radio,
  sessions: FileText,
  metrics: BarChart,
  cron: Loader,
  skills: Zap,
  nodes: Monitor,
  config: Settings,
  diagnostics: Stethoscope,
  debug: Bug,
  logs: ScrollText,
};

export const TAB_LABELS: Record<Tab, string> = {
  'agent-board': 'Board',
  agents: 'Agents',
  runs: 'Runs',
  workflows: 'Workflows',
  chat: 'Workspace',
  overview: 'Operations',
  'soul-memory': 'Soul & Memory',
  gateway: 'Gateway',
  approvals: 'Approvals',
  instances: 'Instances',
  sessions: 'Sessions',
  metrics: 'Metrics',
  cron: 'Cron',
  skills: 'Skills',
  nodes: 'Nodes',
  config: 'Config',
  diagnostics: 'Diagnostics',
  debug: 'Debug',
  logs: 'Logs',
};

export const TAB_DESCRIPTIONS: Record<Tab, string> = {
  'agent-board': 'Overview status board for all agents',
  agents: 'Manage AI agents',
  runs: 'Track active, queued, blocked, and completed runs',
  workflows: 'Manage end-to-end workflows and step assignments',
  chat: 'Interact with the assistant and channel conversations',
  overview: 'Health, approvals, channels, and recent incidents',
  'soul-memory': 'Configure and monitor the shared soul and memory used by all agents',
  gateway: 'Unified channel operations, setup, and detailed settings',
  approvals: 'Review pending approvals and recent decisions',
  instances: 'Inspect infrastructure and instance-level surfaces',
  sessions: 'View conversation sessions and pending intervention',
  metrics: 'Usage, cost, and activity analytics',
  cron: 'Manage scheduled tasks',
  skills: 'Manage workspace skills and local capabilities',
  nodes: 'System nodes and infrastructure',
  config: 'Provider profiles, credentials, models, and server policy',
  diagnostics: 'Doctor findings, recovery signals, and repair guidance',
  debug: 'System debugging tools',
  logs: 'System operation logs and audit trail',
};
