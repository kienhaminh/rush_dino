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
} from 'lucide-react';

export const TAB_GROUPS = [
  { label: 'chat', tabs: ['chat'] },
  {
    label: 'control',
    tabs: ['overview', 'channels', 'instances', 'sessions', 'usage', 'cron'],
  },
  { label: 'agent', tabs: ['agents', 'skills', 'nodes'] },
  { label: 'settings', tabs: ['config', 'debug', 'logs'] },
] as const;

export type Tab =
  | 'agents'
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
  agents: Folder,
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
  agents: 'Agents',
  chat: 'Workspace',
  overview: 'Overview',
  channels: 'Channels',
  instances: 'Instances',
  sessions: 'Sessions',
  usage: 'Usage',
  cron: 'Cron',
  skills: 'Skills',
  nodes: 'Nodes',
  config: 'Config',
  debug: 'Debug',
  logs: 'Logs',
};
