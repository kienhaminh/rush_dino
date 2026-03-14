# Frontend Bundle Optimization Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the Vite `> 500 kB` build warning by converting all page imports in `App.tsx` to route-based lazy loading via `React.lazy()` + `Suspense`.

**Architecture:** Replace every static page import in `App.tsx` with a `React.lazy()` dynamic import. Wrap `<Routes>` in a `<Suspense fallback={null}>`. Vite will automatically split each lazy-loaded route into its own async chunk at build time.

**Tech Stack:** React 18 (`React.lazy`, `Suspense`), Vite 5 (automatic code splitting on dynamic imports), TypeScript

---

## Chunk 1: Lazy-load all routes in App.tsx

### Task 1: Convert App.tsx to lazy-loaded routes

**Files:**
- Modify: `frontend/src/App.tsx:1-28` (all page imports + Routes wrapper)

- [ ] **Step 1: Verify current build output**

  Run from `frontend/` directory:
  ```bash
  npm run build 2>&1 | grep -E "kB|warning"
  ```
  Expected output includes:
  ```
  dist/assets/index-*.js   981.46 kB │ gzip: 267.21 kB
  (!) Some chunks are larger than 500 kB after minification.
  ```

- [ ] **Step 2: Replace all static page imports with React.lazy()**

  Open `frontend/src/App.tsx`. Replace the entire file content with:

  ```tsx
  import React, { Suspense } from 'react';
  import { Routes, Route, Navigate } from 'react-router-dom';
  import { ThemeProvider } from './hooks/use-theme';
  import { AppLayout } from './layouts/AppLayout';
  import { Toaster } from 'sonner';

  // Pages — lazy loaded for route-based code splitting
  const ChatPage = React.lazy(() => import('./pages/chat/ChatPage').then(m => ({ default: m.ChatPage })));
  const OverviewPage = React.lazy(() => import('./pages/overview/OverviewPage').then(m => ({ default: m.OverviewPage })));
  const SoulMemoryPage = React.lazy(() => import('./pages/soul-memory/SoulMemoryPage').then(m => ({ default: m.SoulMemoryPage })));
  const GatewayRoute = React.lazy(() => import('./pages/gateway/GatewayRoute').then(m => ({ default: m.GatewayRoute })));
  const ApprovalsPage = React.lazy(() => import('./pages/approvals/ApprovalsPage').then(m => ({ default: m.ApprovalsPage })));
  const InstancesRoute = React.lazy(() => import('./pages/instances/InstancesRoute').then(m => ({ default: m.InstancesRoute })));
  const SessionsRoute = React.lazy(() => import('./pages/sessions/SessionsRoute').then(m => ({ default: m.SessionsRoute })));
  const MetricsPage = React.lazy(() => import('./pages/metrics/MetricsPage').then(m => ({ default: m.MetricsPage })));
  const AgentBoardPage = React.lazy(() => import('./pages/agent-board/AgentBoardPage').then(m => ({ default: m.AgentBoardPage })));
  const AgentsPage = React.lazy(() => import('./pages/agents/AgentsPage').then(m => ({ default: m.AgentsPage })));
  const RunsRoute = React.lazy(() => import('./pages/runs/RunsRoute').then(m => ({ default: m.RunsRoute })));
  const WorkflowsPage = React.lazy(() => import('./pages/workflows/WorkflowsPage').then(m => ({ default: m.WorkflowsPage })));
  const SkillsRoute = React.lazy(() => import('./pages/skills/SkillsRoute').then(m => ({ default: m.SkillsRoute })));
  const NodesPage = React.lazy(() => import('./pages/nodes/NodesPage').then(m => ({ default: m.NodesPage })));
  const CronPage = React.lazy(() => import('./pages/cron/CronPage').then(m => ({ default: m.CronPage })));
  const ConfigPage = React.lazy(() => import('./pages/config/ConfigPage').then(m => ({ default: m.ConfigPage })));
  const DiagnosticsPage = React.lazy(() => import('./pages/diagnostics/DiagnosticsPage').then(m => ({ default: m.DiagnosticsPage })));
  const DebugPage = React.lazy(() => import('./pages/debug/DebugPage').then(m => ({ default: m.DebugPage })));
  const LogsPage = React.lazy(() => import('./pages/logs/LogsPage').then(m => ({ default: m.LogsPage })));
  const NotFoundPage = React.lazy(() => import('./pages/not-found/NotFoundPage').then(m => ({ default: m.NotFoundPage })));
  const DesignSystemPage = React.lazy(() => import('./pages/design-system/DesignSystemPage').then(m => ({ default: m.DesignSystemPage })));

  export default function App() {
    return (
      <ThemeProvider>
        <Suspense fallback={null}>
          <Routes>
            <Route element={<AppLayout />}>
              {/* Chat / workspace */}
              <Route index element={<ChatPage />} />
              <Route path="chat" element={<Navigate to="/" replace />} />

              {/* Control */}
              <Route path="overview" element={<OverviewPage />} />
              <Route path="soul-memory" element={<SoulMemoryPage />} />
              <Route path="gateway" element={<GatewayRoute />} />
              <Route path="gateway/:channel/settings" element={<GatewayRoute />} />
              <Route path="approvals" element={<ApprovalsPage />} />
              <Route path="instances" element={<InstancesRoute />} />
              <Route path="sessions" element={<SessionsRoute />} />
              <Route path="metrics" element={<MetricsPage />} />
              <Route path="cron" element={<CronPage />} />

              {/* Agent */}
              <Route path="agent-board" element={<AgentBoardPage />} />
              <Route path="runs" element={<RunsRoute />} />
              <Route path="agents" element={<AgentsPage />} />
              <Route path="workflows" element={<WorkflowsPage />} />
              <Route path="skills" element={<SkillsRoute />} />
              <Route path="nodes" element={<NodesPage />} />

              {/* Settings */}
              <Route path="config" element={<ConfigPage />} />
              <Route path="diagnostics" element={<DiagnosticsPage />} />
              <Route path="debug" element={<DebugPage />} />
              <Route path="logs" element={<LogsPage />} />

              {/* Design system */}
              <Route path="design-system" element={<DesignSystemPage />} />

              {/* Catch-all */}
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Routes>
        </Suspense>
        <Toaster position="top-right" richColors closeButton />
      </ThemeProvider>
    );
  }
  ```

  > **Note on named exports:** Each page uses a named export (e.g., `export const ChatPage`). The `.then(m => ({ default: m.ChatPage }))` adapter is required because `React.lazy` only accepts modules with a `default` export. If TypeScript complains about a specific page name, check what the file actually exports with a quick read.

  > **Note on `context-debug` route:** `ContextDebugRoute.tsx` does not exist on disk (the directory only contains `components/`). It has been omitted from the replacement content. The original `App.tsx` had a broken import for it — this plan cleans that up.

  > **Note on `Suspense fallback={null}`:** This is intentional. Since the app runs on localhost, the loading flash is imperceptible. No spinner is needed.

- [ ] **Step 3: Run TypeScript check**

  ```bash
  cd frontend && npm run check:types
  ```
  Expected: no errors. If a page component name is wrong, open the page file to check the exact export name and fix the `.then(m => ({ default: m.XxxPage }))` accordingly.

- [ ] **Step 4: Run build and verify warning is gone**

  ```bash
  cd frontend && npm run build 2>&1
  ```
  Expected:
  - No `(!) Some chunks are larger than 500 kB` warning
  - Multiple smaller chunk files listed (one per page + a shared vendor chunk)
  - No build errors

- [ ] **Step 5: Smoke test dev server**

  ```bash
  cd frontend && npm run dev
  ```
  Navigate to `http://localhost:5173` and click through 3–4 routes (e.g., Overview, Config, Logs). Expected: pages render correctly. Open browser DevTools console and verify no `ChunkLoadError`, no `Element type is invalid` (wrong export name), and no Suspense-related errors.

- [ ] **Step 6: Commit**

  From the repo root:
  ```bash
  git add frontend/src/App.tsx && git commit -m "perf: route-based lazy loading — split ~20 page chunks, eliminate 500kB warning"
  ```
