import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  Blocks,
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
  | 'runs'
  | 'config'
  | 'builder'
  | 'system';

export type OperationsViewId = 'summary' | 'approvals' | 'diagnostics' | 'analytics';
export type ConfigSectionId = 'profiles' | 'credentials' | 'server' | 'identity';
export type AdvancedAreaId = 'builder' | 'system';
export type AdvancedViewId =
  | 'agents'
  | 'agent-board'
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
  area: AdvancedAreaId;
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
    label: 'Channels',
    description: 'Channel runtime, configuration, and infrastructure',
    href: '/channels',
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
    id: 'runs',
    label: 'Runs',
    description: 'Track active, blocked, and completed execution',
    href: '/runs',
    icon: Activity,
  },
  {
    id: 'config',
    label: 'Config',
    description: 'Profiles, credentials, identity, and server policy',
    href: '/config',
    icon: Settings,
  },
  {
    id: 'builder',
    label: 'Builder',
    description: 'Agents, workflows, skills, and coding tools',
    href: '/builder',
    icon: Blocks,
  },
  {
    id: 'system',
    label: 'System',
    description: 'Logs, cron, nodes, and debug surfaces',
    href: '/system',
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
    href: '/operations/approvals',
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
    href: '/config/profiles',
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
  {
    area: 'builder',
    id: 'agents',
    label: 'Agents',
    description: 'Manage reusable agent definitions',
    href: '/builder/agents',
  },
  {
    area: 'builder',
    id: 'agent-board',
    label: 'Agent Board',
    description: 'Overview board for agent activity',
    href: '/builder/agent-board',
  },
  {
    area: 'builder',
    id: 'workflows',
    label: 'Workflows',
    description: 'Build and run workflow graphs',
    href: '/builder/workflows',
  },
  {
    area: 'builder',
    id: 'skills',
    label: 'Skills',
    description: 'Manage workspace skills',
    href: '/builder/skills',
  },
  {
    area: 'builder',
    id: 'coding-agents',
    label: 'Coding Agents',
    description: 'Manage ACP coding agents',
    href: '/builder/coding-agents',
  },
  {
    area: 'builder',
    id: 'acp-sessions',
    label: 'ACP Sessions',
    description: 'Inspect ACP session activity',
    href: '/builder/acp-sessions',
  },
  {
    area: 'system',
    id: 'logs',
    label: 'Logs',
    description: 'Inspect runtime logs',
    href: '/system/logs',
  },
  {
    area: 'system',
    id: 'cron',
    label: 'Cron',
    description: 'Scheduled task management',
    href: '/system/cron',
  },
  {
    area: 'system',
    id: 'nodes',
    label: 'Nodes',
    description: 'Infrastructure and approval nodes',
    href: '/system/nodes',
  },
  {
    area: 'system',
    id: 'debug',
    label: 'Debug',
    description: 'Low-level debugging surfaces',
    href: '/system/debug',
  },
];

const LEGACY_REDIRECTS: Record<string, string> = {
  '/overview': '/operations/summary',
  '/approvals': '/operations/approvals',
  '/diagnostics': '/operations/diagnostics',
  '/metrics': '/operations/analytics',
  '/gateway': '/channels',
  '/instances': '/channels?panel=instances',
  '/soul-memory': '/config/identity',
  '/agents': '/builder/agents',
  '/agent-board': '/builder/agent-board',
  '/workflows': '/builder/workflows',
  '/skills': '/builder/skills',
  '/coding-agents': '/builder/coding-agents',
  '/acp-sessions': '/builder/acp-sessions',
  '/logs': '/system/logs',
  '/cron': '/system/cron',
  '/nodes': '/system/nodes',
  '/debug': '/system/debug',
};

function normalizePath(pathname: string) {
  if (!pathname) {
    return '/';
  }
  if (pathname !== '/' && pathname.endsWith('/')) {
    return pathname.slice(0, -1);
  }
  return pathname;
}


export function resolveLegacyPath(pathname: string): string | null {
  const normalized = normalizePath(pathname);
  if (normalized.startsWith('/gateway/') && normalized.endsWith('/settings')) {
    const channel = normalized.slice('/gateway/'.length, -'/settings'.length);
    return channel ? `/channels/${channel}?panel=settings` : '/channels';
  }
  return LEGACY_REDIRECTS[normalized] ?? null;
}

export function resolvePageHeader(pathname: string): PageHeader {
  const normalized = normalizePath(pathname);

  if (normalized === '/' || normalized === '/chat') {
    return {
      id: 'workspace',
      title: 'Workspace',
      subtitle: 'Conversations and live assistant interaction',
    };
  }

  if (normalized.startsWith('/operations')) {
    const activeView = OPERATIONS_VIEWS.find((view) => normalized === view.href);
    return {
      id: 'operations',
      title: 'Operations',
      subtitle: 'Daily operator posture and action surfaces',
      detail: activeView?.label,
    };
  }

  if (normalized.startsWith('/channels')) {
    return {
      id: 'channels',
      title: 'Channels',
      subtitle: 'Channel runtime, settings, and infrastructure',
    };
  }

  if (normalized.startsWith('/sessions')) {
    return {
      id: 'sessions',
      title: 'Sessions',
      subtitle: 'Inspect prompt, context, run, and tool state',
    };
  }

  if (normalized.startsWith('/runs')) {
    return {
      id: 'runs',
      title: 'Runs',
      subtitle: 'Execution queue, policy posture, and failures',
    };
  }

  if (normalized.startsWith('/config')) {
    const activeSection = CONFIG_SECTIONS.find((section) => normalized === section.href);
    return {
      id: 'config',
      title: 'Config',
      subtitle: 'Profiles, credentials, identity, and server policy',
      detail: activeSection?.label,
    };
  }

  if (normalized.startsWith('/builder')) {
    const activeView = ADVANCED_VIEWS.find((view) => normalized === view.href);
    return {
      id: 'builder',
      title: 'Builder',
      subtitle: 'Agents, workflows, skills, and coding tools',
      detail: activeView?.label,
    };
  }

  if (normalized.startsWith('/system')) {
    const activeView = ADVANCED_VIEWS.find((view) => normalized === view.href);
    return {
      id: 'system',
      title: 'System',
      subtitle: 'Logs, cron, nodes, and debug surfaces',
      detail: activeView?.label,
    };
  }

  return {
    id: 'workspace',
    title: 'Workspace',
    subtitle: 'Conversations and live assistant interaction',
  };
}
