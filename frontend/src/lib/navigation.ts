import {
  BarChart,
  Database,
  FileText,
  Folder,
  GitBranch,
  LayoutGrid,
  Loader,
  Mail,
  MessageSquare,
  MonitorDot,
  ScrollText,
  Settings,
  Shield,
  ShieldAlert,
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
  advancedOnly?: boolean;
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
      { id: 'kanban', label: 'Task Board', icon: LayoutGrid, href: '/kanban', matchPrefix: '/kanban', advancedOnly: true },
      { id: 'agent-board', label: 'Team Status', icon: MonitorDot, href: '/agent-board', matchPrefix: '/agent-board', advancedOnly: true },
      { id: 'workflows', label: 'Workflows', icon: GitBranch, href: '/workflows', matchPrefix: '/workflows', advancedOnly: true },
      { id: 'skills', label: 'Skills', icon: Zap, href: '/skills', matchPrefix: '/skills', advancedOnly: true },
      { id: 'knowledge-graph', label: 'Knowledge Graph', icon: Database, href: '/knowledge-graph', matchPrefix: '/knowledge-graph', advancedOnly: true },
      { id: 'messages', label: 'Messages', icon: Mail, href: '/messages', matchPrefix: '/messages', advancedOnly: true },
    ],
  },
  {
    label: 'system',
    items: [
      { id: 'sessions', label: 'Sessions', icon: FileText, href: '/sessions', matchPrefix: '/sessions', advancedOnly: true },
      { id: 'logs', label: 'Logs', icon: ScrollText, href: '/logs', matchPrefix: '/logs', advancedOnly: true },
      { id: 'metrics', label: 'Metrics', icon: BarChart, href: '/metrics', matchPrefix: '/metrics', advancedOnly: true },
      { id: 'cron', label: 'Cron', icon: Loader, href: '/cron', matchPrefix: '/cron', advancedOnly: true },
      { id: 'gateway', label: 'Gateway', icon: Waypoints, href: '/gateway', matchPrefix: '/gateway', advancedOnly: true },
      { id: 'approvals', label: 'Approvals', icon: ShieldCheck, href: '/approvals', matchPrefix: '/approvals', advancedOnly: true },
      { id: 'guardrail', label: 'Guardrail', icon: ShieldAlert, href: '/guardrail', matchPrefix: '/guardrail', advancedOnly: true },
      { id: 'sandbox', label: 'Sandbox', icon: Shield, href: '/sandbox', matchPrefix: '/sandbox', advancedOnly: true },
      { id: 'config', label: 'Config', icon: Settings, href: '/config', matchPrefix: '/config' },
    ],
  },
];
