import type { LucideIcon } from 'lucide-react';
import {
  FolderKanban,
  LayoutDashboard,
  MessageSquare,
  Server,
  Settings,
  Waypoints,
} from 'lucide-react';

export type PrimaryNavId =
  | 'workspace'
  | 'operations'
  | 'channels'
  | 'sessions'
  | 'config'
  | 'system';

export type OperationsViewId = 'summary' | 'approvals' | 'diagnostics' | 'analytics';
export type ConfigSectionId = 'profiles' | 'credentials' | 'server' | 'identity';

export type AdvancedViewId =
  | 'agents'
  | 'kanban'
  | 'workflows'
  | 'skills'
  | 'coding-agents'
  | 'acp-sessions'
  | 'logs'
  | 'cron'
  | 'nodes'
  | 'debug';

export type PrimaryNavItem = {
  id: PrimaryNavId;
  label: string;
  description: string;
  href: string;
  icon: LucideIcon;
};

export type OperationsView = {
  id: OperationsViewId;
  label: string;
  description: string;
  href: string;
};

export type ConfigSection = {
  id: ConfigSectionId;
  label: string;
  description: string;
  href: string;
};

export type AdvancedView = {
  id: AdvancedViewId;
  label: string;
  description: string;
  href: string;
};

export type PageHeader = {
  id: PrimaryNavId;
  title: string;
  subtitle: string;
  detail?: string;
};

export const PRIMARY_NAV_ITEMS: PrimaryNavItem[] = [
  {
    id: 'workspace',
    label: 'Workspace',
    description: 'Conversations and live assistant interaction',
    href: '/',
    icon: MessageSquare,
  },
  {
    id: 'operations',
    label: 'Operations',
    description: 'Health, approvals, diagnostics, and analytics',
    href: '/operations',
    icon: LayoutDashboard,
  },
  {
    id: 'channels',
    label: 'Gateway',
    description: 'Read-only channel status and Workspace handoff',
    href: '/gateway',
    icon: Waypoints,
  },
  {
    id: 'sessions',
    label: 'Sessions',
    description: 'Inspect session context, prompts, and tools',
    href: '/sessions',
    icon: FolderKanban,
  },
  {
    id: 'config',
    label: 'Config',
    description: 'Profiles, credentials, identity, and server policy',
    href: '/config',
    icon: Settings,
  },
  {
    id: 'system',
    label: 'System',
    description: 'Logs, cron, nodes, and debug surfaces',
    href: '/logs',
    icon: Server,
  },
];

export const OPERATIONS_VIEWS: OperationsView[] = [
  {
    id: 'summary',
    label: 'Summary',
    description: 'Current system posture and activity',
    href: '/operations/summary',
  },
  {
    id: 'approvals',
    label: 'Approvals',
    description: 'Pending decisions and recent approvals',
    href: '/approvals',
  },
  {
    id: 'diagnostics',
    label: 'Diagnostics',
    description: 'Doctor findings and recovery posture',
    href: '/operations/diagnostics',
  },
  {
    id: 'analytics',
    label: 'Analytics',
    description: 'Usage, cost, and activity analysis',
    href: '/operations/analytics',
  },
];

export const CONFIG_SECTIONS: ConfigSection[] = [
  {
    id: 'profiles',
    label: 'Profiles',
    description: 'Provider profiles and default model selection',
    href: '/config',
  },
  {
    id: 'credentials',
    label: 'Credentials',
    description: 'External service credentials and bot tokens',
    href: '/config/credentials',
  },
  {
    id: 'server',
    label: 'Server',
    description: 'Host, auth, and sandbox policy',
    href: '/config/server',
  },
  {
    id: 'identity',
    label: 'Identity',
    description: 'Shared soul and memory context',
    href: '/config/identity',
  },
];

export const ADVANCED_VIEWS: AdvancedView[] = [
  { id: 'agents',        label: 'Agents',        description: 'Manage reusable agent definitions',          href: '/agents' },
  { id: 'kanban',        label: 'Task Board',     description: 'Kanban board for inter-agent collaboration', href: '/kanban' },
  { id: 'workflows',     label: 'Workflows',      description: 'Build and run workflow graphs',              href: '/workflows' },
  { id: 'skills',        label: 'Skills',         description: 'Manage workspace skills',                    href: '/skills' },
  { id: 'coding-agents', label: 'Coding Agents',  description: 'Manage ACP coding agents',                   href: '/coding-agents' },
  { id: 'acp-sessions',  label: 'ACP Sessions',   description: 'Inspect ACP session activity',               href: '/acp-sessions' },
  { id: 'logs',          label: 'Logs',           description: 'Inspect runtime logs',                       href: '/logs' },
  { id: 'cron',          label: 'Cron',           description: 'Scheduled task management',                  href: '/cron' },
  { id: 'nodes',         label: 'Nodes',          description: 'Infrastructure and approval nodes',          href: '/system/nodes' },
  { id: 'debug',         label: 'Debug',          description: 'Low-level debugging surfaces',               href: '/system/debug' },
];

function normalizePath(pathname: string) {
  if (!pathname) return '/';
  if (pathname !== '/' && pathname.endsWith('/')) return pathname.slice(0, -1);
  return pathname;
}

export function resolvePageHeader(pathname: string): PageHeader {
  const normalized = normalizePath(pathname);

  if (normalized === '/') {
    return { id: 'workspace', title: 'Workspace', subtitle: 'Conversations and live assistant interaction' };
  }

  if (normalized === '/metrics') {
    return { id: 'operations', title: 'Metrics', subtitle: 'Usage, cost, and activity analytics' };
  }

  if (normalized === '/approvals') {
    const view = OPERATIONS_VIEWS.find((v) => v.id === 'approvals');
    return {
      id: 'operations',
      title: view?.label ?? 'Approvals',
      subtitle: view?.description ?? 'Pending decisions and recent approvals',
    };
  }

  if (normalized.startsWith('/operations')) {
    const view = OPERATIONS_VIEWS.find((v) => normalized === v.href);
    if (view) return { id: 'operations', title: view.label, subtitle: view.description };
    return { id: 'operations', title: 'Operations', subtitle: 'Daily operator posture and action surfaces' };
  }

  if (normalized.startsWith('/gateway')) {
    return { id: 'channels', title: 'Gateway', subtitle: 'Read-only channel status and Workspace handoff' };
  }

  if (normalized.startsWith('/sessions')) {
    return { id: 'sessions', title: 'Sessions', subtitle: 'Inspect prompt, context, run, and tool state' };
  }

  if (normalized === '/config') {
    return { id: 'config', title: 'Config', subtitle: 'Profiles, credentials, identity, and server policy' };
  }

  if (normalized.startsWith('/config')) {
    const section = CONFIG_SECTIONS.find((s) => normalized === s.href);
    return { id: 'config', title: 'Config', subtitle: 'Profiles, credentials, identity, and server policy', detail: section?.label };
  }

  if (normalized === '/logs' || normalized === '/cron' || normalized.startsWith('/system')) {
    const view = ADVANCED_VIEWS.find((v) => normalized.startsWith(v.href));
    if (view) return { id: 'system', title: view.label, subtitle: view.description };
    return { id: 'system', title: 'System', subtitle: 'Logs, cron, nodes, and debug surfaces' };
  }

  if (normalized === '/kanban') {
    return { id: 'system', title: 'Task Board', subtitle: 'Kanban board for inter-agent collaboration' };
  }

  if (normalized === '/agent-board') {
    return { id: 'system', title: 'Team Status', subtitle: 'Agent health, routing tags, tools, and activity' };
  }

  // Flat operation routes (agents, board, workflows, skills, etc.)
  const view = ADVANCED_VIEWS.find((v) => normalized.startsWith(v.href));
  if (view) return { id: 'system', title: view.label, subtitle: view.description };

  return { id: 'workspace', title: 'Workspace', subtitle: 'Conversations and live assistant interaction' };
}
