# Advanced Menu Split — Design Spec
_Date: 2026-03-16_

## Overview

The "Advanced" primary nav item is replaced by two separate top-level nav items: **Builder** and **System**. This removes the double-click required to reach any advanced view and makes both areas directly accessible from the sidebar.

## Nav Structure

### Before
```
PRIMARY_NAV_ITEMS: Workspace | Operations | Channels | Sessions | Runs | Config | Advanced
PrimaryNavId: 'workspace' | 'operations' | 'channels' | 'sessions' | 'runs' | 'config' | 'advanced'
```

### After
```
PRIMARY_NAV_ITEMS: Workspace | Operations | Channels | Sessions | Runs | Config | Builder | System
PrimaryNavId: 'workspace' | 'operations' | 'channels' | 'sessions' | 'runs' | 'config' | 'builder' | 'system'
```

**Builder nav item**
- Label: `Builder`
- Description: `Agents, workflows, skills, and coding tools`
- Href: `/builder`
- Icon: `Blocks` (lucide-react — verify available in installed version; fallback `Hammer`)

**System nav item**
- Label: `System`
- Description: `Logs, cron, nodes, and debug surfaces`
- Href: `/system`
- Icon: `Server` (lucide-react)

## URL Structure

All `/advanced/builder/*` and `/advanced/system/*` paths move to `/builder/*` and `/system/*`. No legacy redirects — old `/advanced/*` paths 404. All internal `ADVANCED_VIEWS` hrefs are updated so no in-app link breaks.

| Old | New |
|-----|-----|
| `/advanced/builder/agents` | `/builder/agents` |
| `/advanced/builder/agent-board` | `/builder/agent-board` |
| `/advanced/builder/workflows` | `/builder/workflows` |
| `/advanced/builder/skills` | `/builder/skills` |
| `/advanced/builder/coding-agents` | `/builder/coding-agents` |
| `/advanced/builder/acp-sessions` | `/builder/acp-sessions` |
| `/advanced/system/logs` | `/system/logs` |
| `/advanced/system/cron` | `/system/cron` |
| `/advanced/system/nodes` | `/system/nodes` |
| `/advanced/system/debug` | `/system/debug` |

## Sub-nav Views

`ADVANCED_VIEWS` stays in `dashboard-routes.ts` unchanged except for updated hrefs. Each new page imports it and filters by area:

**Builder sub-nav** (`area: 'builder'`): Agents, Agent Board, Workflows, Skills, Coding Agents, ACP Sessions

**System sub-nav** (`area: 'system'`): Logs, Cron, Nodes, Debug

`AdvancedAreaId` (`'builder' | 'system'`) is kept unchanged.

## Pages

`AdvancedPage.tsx` is deleted. Its layout (sub-nav sidebar + `<Outlet>`) is ~50 lines and is reimplemented inline in each new page — no shared layout component needed.

**`frontend/src/pages/builder/BuilderPage.tsx`** (new)
- Sub-nav sidebar showing only Builder views (filtered from `ADVANCED_VIEWS`)
- `<Outlet>` renders the active child route
- Index redirects to `/builder/agents`

**`frontend/src/pages/system/SystemPage.tsx`** (new)
- Sub-nav sidebar showing only System views (filtered from `ADVANCED_VIEWS`)
- `<Outlet>` renders the active child route
- Index redirects to `/system/logs`

## Routing (`App.tsx`)

The single `/advanced` route block becomes two:

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

`AdvancedPage` import and the `/advanced` route block are removed from `App.tsx`.

## Type and Function Renames

| Before | After |
|--------|-------|
| `ShellView` type | `PageHeader` |
| `resolveShellView()` | `resolvePageHeader()` |

Used in 3 files only: `dashboard-routes.ts`, `dashboard-routes.node.test.ts`, `AppLayout.tsx`.

## Active State Logic

`resolvePageHeader` determines the active nav item by URL prefix:
- Paths starting with `/builder` → `id: 'builder'`
- Paths starting with `/system` → `id: 'system'`

Navigating to `/builder` (bare) redirects to `/builder/agents` via the index route, so the sub-nav always has an active selection. Same applies to `/system` → `/system/logs`.

The sidebar highlights the matching `PrimaryNavItem` using the `activeNavId` from `resolvePageHeader`, identical to the existing pattern for all other nav items.

## Header Detail Badge

Consistent with Operations and Config, the header badge shows the active view label (e.g. "Agents", "Logs") when navigated to a specific sub-view. `resolvePageHeader` for `/builder/*` and `/system/*` paths looks up the matching view in `ADVANCED_VIEWS` by href.

## Test Updates (`dashboard-routes.node.test.ts`)

- Rename all `resolveShellView` calls to `resolvePageHeader` and `ShellView` type references to `PageHeader`
- Replace any test cases asserting `id: 'advanced'` with `id: 'builder'` or `id: 'system'` as appropriate
- Add test cases for `/builder`, `/builder/agents`, `/system`, `/system/logs` paths

## Files Changed

| File | Change |
|------|--------|
| `frontend/src/lib/dashboard-routes.ts` | Update `PrimaryNavId`, `PRIMARY_NAV_ITEMS`, `ADVANCED_VIEWS` hrefs; update `LEGACY_REDIRECTS` targets from `/advanced/builder/*` and `/advanced/system/*` to `/builder/*` and `/system/*`; rename `ShellView` → `PageHeader` and `resolveShellView` → `resolvePageHeader`; add `/builder` and `/system` branches in `resolvePageHeader` |
| `frontend/src/lib/dashboard-routes.node.test.ts` | Rename type/function references; update and add test cases |
| `frontend/src/layouts/AppLayout.tsx` | Update import: `resolveShellView` → `resolvePageHeader` |
| `frontend/src/pages/advanced/AdvancedPage.tsx` | Delete |
| `frontend/src/pages/builder/BuilderPage.tsx` | Create |
| `frontend/src/pages/system/SystemPage.tsx` | Create |
| `frontend/src/App.tsx` | Update routes and imports |
