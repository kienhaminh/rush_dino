# Sidebar Restructure Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the sidebar to: standalone Workspace, Operations group (Agents, Board, Workflows, Skills), System group (Sessions, Logs, Metrics, Cron, Gateway, Approvals, Sandbox, Config).

**Architecture:** Replace the old `Tab`-based navigation config in `navigation.ts` with a new `SidebarItem`/`SidebarGroup` structure. Update `sidebar.tsx` to use `useLocation()` for active-state detection instead of a prop. Remove the now-unused `activeNavId` prop from `AppLayout.tsx`. Routes and pages are not changed — only nav config and sidebar rendering.

**Tech Stack:** React, React Router (`useLocation`), Lucide React icons, TypeScript

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `frontend/src/lib/navigation.ts` | Rewrite | New sidebar config: `WORKSPACE_ITEM` + `SIDEBAR_GROUPS` |
| `frontend/src/components/sidebar/sidebar.tsx` | Rewrite | Use new config + `useLocation` for active state |
| `frontend/src/layouts/AppLayout.tsx` | Modify | Remove `activeNavId` prop from `<Sidebar>` |

---

### Task 1: Rewrite navigation.ts with new sidebar config

**Files:**
- Modify: `frontend/src/lib/navigation.ts`

- [ ] **Step 1: Replace the file contents**

```typescript
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
      { id: 'metrics', label: 'Metrics', icon: BarChart, href: '/operations/analytics', matchPrefix: '/operations/analytics' },
      { id: 'cron', label: 'Cron', icon: Loader, href: '/system/cron', matchPrefix: '/system/cron' },
      { id: 'gateway', label: 'Gateway', icon: Waypoints, href: '/channels', matchPrefix: '/channels' },
      { id: 'approvals', label: 'Approvals', icon: ShieldCheck, href: '/operations/approvals', matchPrefix: '/operations/approvals' },
      { id: 'sandbox', label: 'Sandbox', icon: Shield, href: '/system/sandbox', matchPrefix: '/system/sandbox' },
      { id: 'config', label: 'Config', icon: Settings, href: '/config', matchPrefix: '/config' },
    ],
  },
];
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/kien.ha/Code/RushDino/frontend && npx tsc --noEmit 2>&1 | head -30
```

Expected: errors only from sidebar.tsx (which imports the old Tab type) — not from navigation.ts itself.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/navigation.ts
git commit -m "refactor: replace Tab-based nav config with SidebarItem/SidebarGroup structure"
```

---

### Task 2: Rewrite sidebar.tsx

**Files:**
- Modify: `frontend/src/components/sidebar/sidebar.tsx`

- [ ] **Step 1: Replace the file contents**

```tsx
import { cn } from '@/lib/utils';
import { WORKSPACE_ITEM, SIDEBAR_GROUPS, type SidebarItem } from '@/lib/navigation';
import { ChevronDown, ChevronRight, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useDashboardAuth } from '@/hooks/use-dashboard-auth';

interface SidebarProps {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

function isItemActive(item: SidebarItem, pathname: string): boolean {
  if (item.matchPrefix === null) {
    // /chat redirects to / in the router, so only exact / match is needed
    return pathname === '/';
  }
  return pathname.startsWith(item.matchPrefix);
}

export function Sidebar({ collapsed, onToggleCollapse }: SidebarProps) {
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const navigate = useNavigate();
  const location = useLocation();
  const { enabled, logout } = useDashboardAuth();

  const toggleGroup = (label: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  const renderItem = (item: SidebarItem) => {
    const Icon = item.icon;
    const active = isItemActive(item, location.pathname);

    if (collapsed) {
      return (
        <button
          key={item.id}
          onClick={() => navigate(item.href)}
          title={item.label}
          className={cn(
            'w-10 h-10 mx-auto flex items-center justify-center rounded-xl transition-all mb-1',
            active
              ? 'bg-primary text-primary-foreground shadow-md scale-105'
              : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
          )}
        >
          <Icon size={20} />
        </button>
      );
    }

    return (
      <button
        key={item.id}
        onClick={() => navigate(item.href)}
        className={cn(
          'flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium transition-all group relative',
          active
            ? 'border-l-2 border-primary text-primary bg-primary/[0.06]'
            : 'text-muted-foreground hover:text-foreground hover:bg-white/5',
        )}
      >
        <Icon
          size={18}
          className={cn(
            'transition-colors',
            active ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground',
          )}
        />
        <span className="truncate">{item.label}</span>
      </button>
    );
  };

  return (
    <aside
      className={cn(
        'flex flex-col bg-card border-r border-border transition-all duration-300 ease-in-out h-full shrink-0',
        collapsed ? 'w-[70px]' : 'w-[260px]',
      )}
    >
      {/* Brand / Header */}
      <div className="flex items-center justify-between px-4 h-[72px] border-b border-border/40 shrink-0 w-full">
        {!collapsed && (
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="h-8 w-8 flex items-center justify-center rounded-lg bg-primary text-primary-foreground shrink-0 shadow-sm ring-1 ring-primary/20">
              <span className="font-bold text-lg">R</span>
            </div>
            <div className="flex flex-col justify-center">
              <span className="font-display font-bold text-sm tracking-tight truncate leading-none">
                RUSHDINO
              </span>
              <span className="text-[9px] text-muted-foreground uppercase tracking-[0.2em] font-bold leading-none mt-1 opacity-60">
                Dashboard
              </span>
            </div>
          </div>
        )}
        {collapsed && (
          <div className="h-8 w-8 mx-auto flex items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm ring-1 ring-primary/20">
            <span className="font-bold text-lg">R</span>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto px-3 py-6 space-y-6 scrollbar-none">
        {/* Standalone Workspace */}
        <div className="space-y-0.5">
          {renderItem(WORKSPACE_ITEM)}
        </div>

        {/* Groups */}
        {SIDEBAR_GROUPS.map((group) => {
          const isCollapsed = collapsedGroups[group.label] ?? false;
          const hasActive = group.items.some((item) => isItemActive(item, location.pathname));
          const showItems = !isCollapsed || hasActive;

          return (
            <div key={group.label} className="space-y-1">
              {!collapsed && (
                <button
                  onClick={() => toggleGroup(group.label)}
                  className="flex items-center justify-between w-full px-2 py-1.5 text-[9px] tracking-[0.15em] text-muted-foreground/60 uppercase hover:text-foreground transition-colors group"
                >
                  <span>{group.label}</span>
                  {isCollapsed && !hasActive ? (
                    <ChevronRight size={10} className="opacity-50" />
                  ) : (
                    <ChevronDown size={10} className="opacity-50" />
                  )}
                </button>
              )}
              {(showItems || collapsed) && (
                <div className="space-y-0.5">
                  {group.items.map(renderItem)}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-border/40 mt-auto shrink-0 bg-muted/30">
        {enabled ? (
          <button
            onClick={() => void logout()}
            className="flex items-center gap-3 w-full px-3 py-2 rounded-xl text-sm font-medium text-muted-foreground hover:bg-muted/80 hover:text-foreground transition-all mb-2"
          >
            <span>Log out</span>
          </button>
        ) : null}
        <button
          onClick={onToggleCollapse}
          className="flex items-center gap-3 w-full px-3 py-2 rounded-xl text-sm font-medium text-muted-foreground hover:bg-muted/80 hover:text-foreground transition-all"
        >
          {collapsed ? (
            <PanelLeftOpen size={18} />
          ) : (
            <>
              <PanelLeftClose size={18} />
              <span>Collapse sidebar</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles (expect one error from AppLayout — fixed in Task 3)**

```bash
cd /Users/kien.ha/Code/RushDino/frontend && npx tsc --noEmit 2>&1 | head -30
```

Expected: exactly 1 error — `AppLayout.tsx` passing unknown prop `activeNavId` to `<Sidebar>`. This is fixed in Task 3. No other errors should appear.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/sidebar/sidebar.tsx
git commit -m "refactor: rewrite sidebar to use location-based active state and new nav groups"
```

---

### Task 3: Remove activeNavId prop from AppLayout

**Files:**
- Modify: `frontend/src/layouts/AppLayout.tsx`

- [ ] **Step 1: Remove `activeNavId` prop from Sidebar usage**

In `AppLayout.tsx`, change:
```tsx
<Sidebar
  activeNavId={shellView.id}
  collapsed={isSidebarCollapsed}
  onToggleCollapse={() => setIsSidebarCollapsed((value) => !value)}
/>
```
To:
```tsx
<Sidebar
  collapsed={isSidebarCollapsed}
  onToggleCollapse={() => setIsSidebarCollapsed((value) => !value)}
/>
```

- [ ] **Step 2: Verify TypeScript compiles clean**

```bash
cd /Users/kien.ha/Code/RushDino/frontend && npx tsc --noEmit 2>&1 | head -30
```

Expected: 0 errors.

- [ ] **Step 3: Run dev server and verify sidebar visually**

```bash
cd /Users/kien.ha/Code/RushDino/frontend && npm run dev
```

Navigate to each route and verify:
- `/` → Workspace item highlighted
- `/builder/agents` → Agents item highlighted (Operations group)
- `/builder/agent-board` → Board item highlighted
- `/system/logs` → Logs item highlighted (System group)
- `/system/sandbox` → Sandbox item highlighted
- `/channels` → Gateway item highlighted
- Sidebar collapse/expand still works

- [ ] **Step 4: Commit**

```bash
git add frontend/src/layouts/AppLayout.tsx
git commit -m "refactor: remove activeNavId prop from AppLayout, sidebar self-detects active state"
```
