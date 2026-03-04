import {
  MessageSquare,
  BarChart,
  Link,
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
} from 'lucide-react';

export const TAB_GROUPS = [
  { label: 'chat', tabs: ['chat'] },
  {
    label: 'control',
    tabs: ['overview', 'channels', 'instances', 'sessions', 'usage', 'cron'],
  },
  { label: 'agent', tabs: ['agent-board', 'agents', 'workflows', 'skills', 'nodes'] },
  { label: 'settings', tabs: ['config', 'debug', 'logs'] },
] as const;

export type Tab =
  | 'agent-board'
  | 'agents'
  | 'workflows'
  | 'overview'
  | 'channels'
  | 'instances'
  | 'sessions'
  | 'usage'
  | 'cron'
  | 'skills'
  | 'nodes'
  | 'chat'
  | 'config'
  | 'debug'
  | 'logs';

export const TAB_ICONS: Record<Tab, any> = {
  'agent-board': LayoutGrid,
  agents: Folder,
  workflows: GitBranch,
  chat: MessageSquare,
  overview: BarChart,
  channels: Link,
  instances: Radio,
  sessions: FileText,
  usage: BarChart,
  cron: Loader,
  skills: Zap,
  nodes: Monitor,
  config: Settings,
  debug: Bug,
  logs: ScrollText,
};

export const TAB_LABELS: Record<Tab, string> = {
  'agent-board': 'Board',
  agents: 'Agents',
  workflows: 'Workflows',
  chat: 'Workspace',
  overview: 'Overview',
  channels: 'Channels',
  instances: 'Instances',
  sessions: 'Sessions',
  usage: 'Metrics',
  cron: 'Cron',
  skills: 'Skills',
  nodes: 'Nodes',
  config: 'Config',
  debug: 'Debug',
  logs: 'Logs',
};

export const TAB_DESCRIPTIONS: Record<Tab, string> = {
  'agent-board': 'Overview status board for all agents',
  agents: 'Manage AI agents',
  workflows: 'Manage end-to-end workflows and step assignments',
  chat: 'Interact with AI assistant',
  overview: 'System status, connection settings, and general statistics.',
  channels: 'Channel status snapshots from the gateway',
  instances: 'Manage system instances',
  sessions: 'View and manage active sessions',
  usage: 'Token usage, cost analytics, and AI provider configuration',
  cron: 'Manage scheduled tasks',
  skills: 'Manage AI skills and capabilities',
  nodes: 'System nodes and infrastructure',
  config: 'System configuration settings',
  debug: 'System debugging tools',
  logs: 'System operation logs',
};
