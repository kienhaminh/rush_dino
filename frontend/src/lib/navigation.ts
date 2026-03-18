import {
  BarChart,
  FileText,
  Folder,
  GitBranch,
  LayoutGrid,
  Loader,
  MessageSquare,
  ScrollText,
  Settings,
  Shield,
  ShieldCheck,
  Waypoints,
  Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type SidebarItem = {
  id: string;
  label: string;
  icon: LucideIcon;
  href: string;
  matchPrefix: string | null; // null = exact match only
};

export type SidebarGroup = {
  label: string;
  items: SidebarItem[];
};

export const WORKSPACE_ITEM: SidebarItem = {
  id: 'workspace',
  label: 'Workspace',
  icon: MessageSquare,
  href: '/',
  matchPrefix: null,
};

export const SIDEBAR_GROUPS: SidebarGroup[] = [
  {
    label: 'operations',
    items: [
      { id: 'agents', label: 'Agents', icon: Folder, href: '/builder/agents', matchPrefix: '/builder/agents' },
      { id: 'board', label: 'Board', icon: LayoutGrid, href: '/builder/agent-board', matchPrefix: '/builder/agent-board' },
      { id: 'workflows', label: 'Workflows', icon: GitBranch, href: '/builder/workflows', matchPrefix: '/builder/workflows' },
      { id: 'skills', label: 'Skills', icon: Zap, href: '/builder/skills', matchPrefix: '/builder/skills' },
    ],
  },
  {
    label: 'system',
    items: [
      { id: 'sessions', label: 'Sessions', icon: FileText, href: '/sessions', matchPrefix: '/sessions' },
      { id: 'logs', label: 'Logs', icon: ScrollText, href: '/system/logs', matchPrefix: '/system/logs' },
      { id: 'metrics', label: 'Metrics', icon: BarChart, href: '/metrics', matchPrefix: '/metrics' },
      { id: 'cron', label: 'Cron', icon: Loader, href: '/system/cron', matchPrefix: '/system/cron' },
      { id: 'gateway', label: 'Gateway', icon: Waypoints, href: '/channels', matchPrefix: '/channels' },
      { id: 'approvals', label: 'Approvals', icon: ShieldCheck, href: '/operations/approvals', matchPrefix: '/operations/approvals' },
      { id: 'sandbox', label: 'Sandbox', icon: Shield, href: '/system/sandbox', matchPrefix: '/system/sandbox' },
      { id: 'config', label: 'Config', icon: Settings, href: '/config', matchPrefix: '/config' },
    ],
  },
];
