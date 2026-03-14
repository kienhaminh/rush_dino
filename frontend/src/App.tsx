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
