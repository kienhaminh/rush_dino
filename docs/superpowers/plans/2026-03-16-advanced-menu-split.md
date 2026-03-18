# Advanced Menu Split Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single "Advanced" primary nav item with two separate top-level nav items — "Builder" and "System" — each with direct `/builder/*` and `/system/*` URL paths.

**Architecture:** Update `dashboard-routes.ts` to split the nav, rename `ShellView`→`PageHeader`, update `ADVANCED_VIEWS` hrefs and `LEGACY_REDIRECTS`. Create `BuilderPage.tsx` and `SystemPage.tsx` as thin wrappers reusing the same sub-nav sidebar pattern from the deleted `AdvancedPage.tsx`. Update `App.tsx` routing to use two separate route trees.

**Tech Stack:** React, React Router v6, TypeScript, lucide-react, Vitest

---

## Chunk 1: Update dashboard-routes.ts and tests

### Task 1: Update nav types and items in `dashboard-routes.ts`

**Files:**
- Modify: `frontend/src/lib/dashboard-routes.ts`

- [ ] **Step 1: Replace `'advanced'` with `'builder'` and `'system'` in `PrimaryNavId`**

In `dashboard-routes.ts`, change:
```ts
export type PrimaryNavId =
  | 'workspace'
  | 'operations'
  | 'channels'
  | 'sessions'
  | 'runs'
  | 'config'
  | 'advanced';
```
To:
```ts
export type PrimaryNavId =
  | 'workspace'
  | 'operations'
  | 'channels'
  | 'sessions'
  | 'runs'
  | 'config'
  | 'builder'
  | 'system';
```

- [ ] **Step 2: Update the lucide-react import to add `Blocks` and `Server`, remove `Wrench`**

Change the import block at the top of `dashboard-routes.ts`:
```ts
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
```

> Note: If `Blocks` is not available in the installed lucide-react version, use `Hammer` instead. Check with: `grep -r "Blocks" node_modules/lucide-react/dist/lucide-react.js | head -1`

- [ ] **Step 3: Replace the Advanced entry in `PRIMARY_NAV_ITEMS` with Builder and System**

Remove:
```ts
  {
    id: 'advanced',
    label: 'Advanced',
    description: 'Builder and low-frequency system tools',
    href: '/advanced',
    icon: Wrench,
  },
```

Add in its place:
```ts
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
```

- [ ] **Step 4: Update `ADVANCED_VIEWS` hrefs — remove `/advanced/` prefix**

Each href in `ADVANCED_VIEWS` currently starts with `/advanced/builder/` or `/advanced/system/`. Change them to start with `/builder/` and `/system/`:

```ts
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
```

- [ ] **Step 5: Update `LEGACY_REDIRECTS` to point to new paths**

Change all `/advanced/builder/*` and `/advanced/system/*` targets to `/builder/*` and `/system/*`:

```ts
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
```

### Task 2: Rename `ShellView` → `PageHeader` and `resolveShellView` → `resolvePageHeader`

**Files:**
- Modify: `frontend/src/lib/dashboard-routes.ts`

- [ ] **Step 1: Rename the type and function**

In `dashboard-routes.ts`:
- Rename `export type ShellView` → `export type PageHeader`
- Rename `export function resolveShellView` → `export function resolvePageHeader`

- [ ] **Step 2: Replace the `/advanced` branch with `/builder` and `/system` branches in `resolvePageHeader`**

Remove:
```ts
  if (normalized.startsWith('/advanced')) {
    const activeView = ADVANCED_VIEWS.find((view) => normalized === view.href);
    return {
      id: 'advanced',
      title: 'Advanced',
      subtitle: 'Low-frequency builder and system tools',
      detail: activeView ? capitalize(activeView.area) : undefined,
    };
  }
```

Add in its place:
```ts
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
```

### Task 3: Update the test file

**Files:**
- Modify: `frontend/src/lib/dashboard-routes.node.test.ts`

- [ ] **Step 1: Update the import to use `resolvePageHeader` instead of `resolveShellView`**

Change:
```ts
import {
  ADVANCED_VIEWS,
  CONFIG_SECTIONS,
  OPERATIONS_VIEWS,
  PRIMARY_NAV_ITEMS,
  resolveLegacyPath,
  resolveShellView,
} from './dashboard-routes';
```
To:
```ts
import {
  ADVANCED_VIEWS,
  CONFIG_SECTIONS,
  OPERATIONS_VIEWS,
  PRIMARY_NAV_ITEMS,
  resolveLegacyPath,
  resolvePageHeader,
} from './dashboard-routes';
```

- [ ] **Step 2: Update `PRIMARY_NAV_ITEMS` label assertion**

Change:
```ts
    expect(PRIMARY_NAV_ITEMS.map((item) => item.label)).toEqual([
      'Workspace',
      'Operations',
      'Channels',
      'Sessions',
      'Runs',
      'Config',
      'Advanced',
    ]);
```
To:
```ts
    expect(PRIMARY_NAV_ITEMS.map((item) => item.label)).toEqual([
      'Workspace',
      'Operations',
      'Channels',
      'Sessions',
      'Runs',
      'Config',
      'Builder',
      'System',
    ]);
```

- [ ] **Step 3: Update `resolveShellView` calls and the `/advanced` assertion**

Replace all `resolveShellView(` with `resolvePageHeader(`.

Change the advanced assertion:
```ts
    expect(resolveShellView('/advanced/system/logs')).toMatchObject({
      id: 'advanced',
      title: 'Advanced',
      detail: 'System',
    });
```
To:
```ts
    expect(resolvePageHeader('/system/logs')).toMatchObject({
      id: 'system',
      title: 'System',
      detail: 'Logs',
    });
```

- [ ] **Step 4: Add assertions for `/builder` paths**

Add to the `'maps concrete paths to their shell view metadata'` test:
```ts
    expect(resolvePageHeader('/builder/agents')).toMatchObject({
      id: 'builder',
      title: 'Builder',
      detail: 'Agents',
    });
    expect(resolvePageHeader('/builder')).toMatchObject({
      id: 'builder',
      title: 'Builder',
    });
```

- [ ] **Step 5: Update `resolveLegacyPath` test — builder/system routes**

Change:
```ts
  it('redirects builder and system routes into the advanced area', () => {
    expect(resolveLegacyPath('/agents')).toBe('/advanced/builder/agents');
    expect(resolveLegacyPath('/agent-board')).toBe('/advanced/builder/agent-board');
    expect(resolveLegacyPath('/workflows')).toBe('/advanced/builder/workflows');
    expect(resolveLegacyPath('/skills')).toBe('/advanced/builder/skills');
    expect(resolveLegacyPath('/coding-agents')).toBe('/advanced/builder/coding-agents');
    expect(resolveLegacyPath('/acp-sessions')).toBe('/advanced/builder/acp-sessions');
    expect(resolveLegacyPath('/logs')).toBe('/advanced/system/logs');
    expect(resolveLegacyPath('/cron')).toBe('/advanced/system/cron');
    expect(resolveLegacyPath('/nodes')).toBe('/advanced/system/nodes');
    expect(resolveLegacyPath('/debug')).toBe('/advanced/system/debug');
  });
```
To:
```ts
  it('redirects builder and system routes directly to their new homes', () => {
    expect(resolveLegacyPath('/agents')).toBe('/builder/agents');
    expect(resolveLegacyPath('/agent-board')).toBe('/builder/agent-board');
    expect(resolveLegacyPath('/workflows')).toBe('/builder/workflows');
    expect(resolveLegacyPath('/skills')).toBe('/builder/skills');
    expect(resolveLegacyPath('/coding-agents')).toBe('/builder/coding-agents');
    expect(resolveLegacyPath('/acp-sessions')).toBe('/builder/acp-sessions');
    expect(resolveLegacyPath('/logs')).toBe('/system/logs');
    expect(resolveLegacyPath('/cron')).toBe('/system/cron');
    expect(resolveLegacyPath('/nodes')).toBe('/system/nodes');
    expect(resolveLegacyPath('/debug')).toBe('/system/debug');
  });
```

- [ ] **Step 6: Run the tests**

```bash
cd frontend && npx vitest run src/lib/dashboard-routes.node.test.ts
```
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/dashboard-routes.ts frontend/src/lib/dashboard-routes.node.test.ts
git commit -m "feat: split Advanced nav into Builder and System, rename ShellView to PageHeader"
```

---

## Chunk 2: Create BuilderPage, SystemPage, update AppLayout and App

> **Prerequisite:** Chunk 1 must be complete before running any verification steps in this chunk. The `resolvePageHeader` export, updated `ADVANCED_VIEWS` hrefs, and updated `LEGACY_REDIRECTS` targets all come from Chunk 1.

### Task 4: Update `AppLayout.tsx` to use `resolvePageHeader`

**Files:**
- Modify: `frontend/src/layouts/AppLayout.tsx`

- [ ] **Step 1: Update the import**

Change:
```ts
import { resolveShellView } from '@/lib/dashboard-routes';
```
To:
```ts
import { resolvePageHeader } from '@/lib/dashboard-routes';
```

- [ ] **Step 2: Update the call site**

Change:
```ts
  const shellView = resolveShellView(location.pathname);
```
To:
```ts
  const shellView = resolvePageHeader(location.pathname);
```

### Task 5: Create `BuilderPage.tsx`

**Files:**
- Create: `frontend/src/pages/builder/BuilderPage.tsx`

> **Note:** Active state relies on `location.pathname === view.href`. This works because Chunk 1 updated `ADVANCED_VIEWS` hrefs to `/builder/*`. All child route lazy imports (`AgentsPage`, `AgentBoardPage`, etc.) already exist in `App.tsx` — no new lazy imports needed for children.

- [ ] **Step 1: Create the file**

```tsx
import { NavLink, Outlet, useLocation } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import { ADVANCED_VIEWS } from '@/lib/dashboard-routes';
import { cn } from '@/lib/utils';

const BUILDER_VIEWS = ADVANCED_VIEWS.filter((view) => view.area === 'builder');

export function BuilderPage() {
  const location = useLocation();

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden bg-background">
      <aside className="w-[280px] shrink-0 overflow-y-auto border-r border-border/40 bg-card/35 px-4 py-5">
        <div className="space-y-2">
          <Badge variant="outline" className="text-[10px] uppercase tracking-[0.24em]">
            Builder
          </Badge>
          <p className="text-sm leading-6 text-muted-foreground">
            Agents, workflows, skills, and coding tools for building and managing your AI system.
          </p>
        </div>

        <div className="mt-6 space-y-1">
          {BUILDER_VIEWS.map((view) => {
            const active = location.pathname === view.href;
            return (
              <NavLink
                key={view.href}
                to={view.href}
                className={cn(
                  'block rounded-2xl border px-3 py-3 transition-colors',
                  active
                    ? 'border-primary/30 bg-primary/10 text-primary'
                    : 'border-border/40 bg-background/65 text-foreground hover:bg-muted/30',
                )}
              >
                <div className="text-sm font-medium">{view.label}</div>
                <div className="mt-1 text-xs text-muted-foreground">{view.description}</div>
              </NavLink>
            );
          })}
        </div>
      </aside>

      <div className="min-h-0 flex-1 overflow-hidden">
        <Outlet />
      </div>
    </div>
  );
}

export default BuilderPage;
```

### Task 6: Create `SystemPage.tsx`

**Files:**
- Create: `frontend/src/pages/system/SystemPage.tsx`

> **Note:** Same dependency as Task 5 — active state relies on Chunk 1's updated `/system/*` hrefs in `ADVANCED_VIEWS`.

- [ ] **Step 1: Create the file**

```tsx
import { NavLink, Outlet, useLocation } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import { ADVANCED_VIEWS } from '@/lib/dashboard-routes';
import { cn } from '@/lib/utils';

const SYSTEM_VIEWS = ADVANCED_VIEWS.filter((view) => view.area === 'system');

export function SystemPage() {
  const location = useLocation();

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden bg-background">
      <aside className="w-[280px] shrink-0 overflow-y-auto border-r border-border/40 bg-card/35 px-4 py-5">
        <div className="space-y-2">
          <Badge variant="outline" className="text-[10px] uppercase tracking-[0.24em]">
            System
          </Badge>
          <p className="text-sm leading-6 text-muted-foreground">
            Logs, cron, nodes, and debug surfaces for low-frequency system management.
          </p>
        </div>

        <div className="mt-6 space-y-1">
          {SYSTEM_VIEWS.map((view) => {
            const active = location.pathname === view.href;
            return (
              <NavLink
                key={view.href}
                to={view.href}
                className={cn(
                  'block rounded-2xl border px-3 py-3 transition-colors',
                  active
                    ? 'border-primary/30 bg-primary/10 text-primary'
                    : 'border-border/40 bg-background/65 text-foreground hover:bg-muted/30',
                )}
              >
                <div className="text-sm font-medium">{view.label}</div>
                <div className="mt-1 text-xs text-muted-foreground">{view.description}</div>
              </NavLink>
            );
          })}
        </div>
      </aside>

      <div className="min-h-0 flex-1 overflow-hidden">
        <Outlet />
      </div>
    </div>
  );
}

export default SystemPage;
```

### Task 7: Update `App.tsx` routing

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Replace the `AdvancedPage` import with `BuilderPage` and `SystemPage`**

Remove:
```ts
const AdvancedPage = lazy(() => import('./pages/advanced/AdvancedPage').then(m => ({ default: m.AdvancedPage })));
```

Add:
```ts
const BuilderPage = lazy(() => import('./pages/builder/BuilderPage').then(m => ({ default: m.BuilderPage })));
const SystemPage = lazy(() => import('./pages/system/SystemPage').then(m => ({ default: m.SystemPage })));
```

- [ ] **Step 2: Replace the `/advanced` route block with `/builder` and `/system`**

Remove:
```tsx
                  {/* Advanced */}
                  <Route path="advanced" element={<AdvancedPage />}>
                    <Route index element={<Navigate to="builder/agents" replace />} />
                    <Route path="builder/agents" element={<AgentsPage />} />
                    <Route path="builder/agent-board" element={<AgentBoardPage />} />
                    <Route path="builder/workflows" element={<WorkflowsPage />} />
                    <Route path="builder/skills" element={<SkillsRoute />} />
                    <Route path="builder/coding-agents" element={<CodingAgentsPage />} />
                    <Route path="builder/acp-sessions" element={<AcpSessionsPage />} />
                    <Route path="system/logs" element={<LogsPage />} />
                    <Route path="system/cron" element={<CronPage />} />
                    <Route path="system/nodes" element={<NodesPage />} />
                    <Route path="system/debug" element={<DebugPage />} />
                  </Route>
```

Add:
```tsx
                  {/* Builder */}
                  <Route path="builder" element={<BuilderPage />}>
                    <Route index element={<Navigate to="agents" replace />} />
                    <Route path="agents" element={<AgentsPage />} />
                    <Route path="agent-board" element={<AgentBoardPage />} />
                    <Route path="workflows" element={<WorkflowsPage />} />
                    <Route path="skills" element={<SkillsRoute />} />
                    <Route path="coding-agents" element={<CodingAgentsPage />} />
                    <Route path="acp-sessions" element={<AcpSessionsPage />} />
                  </Route>

                  {/* System */}
                  <Route path="system" element={<SystemPage />}>
                    <Route index element={<Navigate to="logs" replace />} />
                    <Route path="logs" element={<LogsPage />} />
                    <Route path="cron" element={<CronPage />} />
                    <Route path="nodes" element={<NodesPage />} />
                    <Route path="debug" element={<DebugPage />} />
                  </Route>
```

### Task 8: Delete `AdvancedPage.tsx` and verify

**Files:**
- Delete: `frontend/src/pages/advanced/AdvancedPage.tsx`

- [ ] **Step 1: Delete the file**

```bash
rm frontend/src/pages/advanced/AdvancedPage.tsx
```

- [ ] **Step 2: Verify no `/advanced` references remain in `dashboard-routes.ts`**

```bash
grep -n "advanced" frontend/src/lib/dashboard-routes.ts
```
Expected: zero matches (confirms LEGACY_REDIRECTS and ADVANCED_VIEWS hrefs are all updated).

- [ ] **Step 3: Verify the frontend builds without errors**

```bash
cd frontend && npx tsc --noEmit
```
Expected: no TypeScript errors.

- [ ] **Step 4: Run all frontend tests**

```bash
cd frontend && npx vitest run
```
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/layouts/AppLayout.tsx \
        frontend/src/pages/builder/BuilderPage.tsx \
        frontend/src/pages/system/SystemPage.tsx \
        frontend/src/App.tsx
git rm frontend/src/pages/advanced/AdvancedPage.tsx
git commit -m "feat: add BuilderPage and SystemPage, remove AdvancedPage, update routing"
```
