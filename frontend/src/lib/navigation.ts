import {
  BarChart,
  Database,
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
      { id: 'agents', label: 'Agents', icon: Folder, href: '/agents', matchPrefix: '/agents' },
      { id: 'kanban', label: 'Task Board', icon: LayoutGrid, href: '/kanban', matchPrefix: '/kanban' },
      { id: 'workflows', label: 'Workflows', icon: GitBranch, href: '/workflows', matchPrefix: '/workflows' },
      { id: 'skills', label: 'Skills', icon: Zap, href: '/skills', matchPrefix: '/skills' },
      { id: 'knowledge-graph', label: 'Knowledge Graph', icon: Database, href: '/knowledge-graph', matchPrefix: '/knowledge-graph' },
    ],
  },
  {
    label: 'system',
    items: [
      { id: 'sessions', label: 'Sessions', icon: FileText, href: '/sessions', matchPrefix: '/sessions' },
      { id: 'logs', label: 'Logs', icon: ScrollText, href: '/logs', matchPrefix: '/logs' },
      { id: 'metrics', label: 'Metrics', icon: BarChart, href: '/metrics', matchPrefix: '/metrics' },
      { id: 'cron', label: 'Cron', icon: Loader, href: '/cron', matchPrefix: '/cron' },
      { id: 'gateway', label: 'Gateway', icon: Waypoints, href: '/gateway', matchPrefix: '/gateway' },
      { id: 'approvals', label: 'Approvals', icon: ShieldCheck, href: '/approvals', matchPrefix: '/approvals' },
      { id: 'sandbox', label: 'Sandbox', icon: Shield, href: '/sandbox', matchPrefix: '/sandbox' },
      { id: 'config', label: 'Config', icon: Settings, href: '/config', matchPrefix: '/config' },
    ],
  },
];
