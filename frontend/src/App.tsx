import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './hooks/use-theme';
import { useDashboardAuth } from './hooks/use-dashboard-auth';
import { AppLayout } from './layouts/AppLayout';
import { Toaster } from 'sonner';

// Pages — lazy loaded for route-based code splitting
const ChatPage = lazy(() => import('./pages/chat/ChatPage').then(m => ({ default: m.ChatPage })));
const OverviewPage = lazy(() => import('./pages/overview/OverviewPage').then(m => ({ default: m.OverviewPage })));
const SoulMemoryPage = lazy(() => import('./pages/soul-memory/SoulMemoryPage').then(m => ({ default: m.SoulMemoryPage })));
const GatewayRoute = lazy(() => import('./pages/gateway/GatewayRoute').then(m => ({ default: m.GatewayRoute })));
const ApprovalsPage = lazy(() => import('./pages/approvals/ApprovalsPage').then(m => ({ default: m.ApprovalsPage })));
const InstancesRoute = lazy(() => import('./pages/instances/InstancesRoute').then(m => ({ default: m.InstancesRoute })));
const SessionsRoute = lazy(() => import('./pages/sessions/SessionsRoute').then(m => ({ default: m.SessionsRoute })));
const MetricsPage = lazy(() => import('./pages/metrics/MetricsPage').then(m => ({ default: m.MetricsPage })));
const AgentBoardPage = lazy(() => import('./pages/agent-board/AgentBoardPage').then(m => ({ default: m.AgentBoardPage })));
const AgentsPage = lazy(() => import('./pages/agents/AgentsPage').then(m => ({ default: m.AgentsPage })));
const RunsRoute = lazy(() => import('./pages/runs/RunsRoute').then(m => ({ default: m.RunsRoute })));
const WorkflowsPage = lazy(() => import('./pages/workflows/WorkflowsPage').then(m => ({ default: m.WorkflowsPage })));
const SkillsRoute = lazy(() => import('./pages/skills/SkillsRoute').then(m => ({ default: m.SkillsRoute })));
const NodesPage = lazy(() => import('./pages/nodes/NodesPage').then(m => ({ default: m.NodesPage })));
const CronPage = lazy(() => import('./pages/cron/CronPage').then(m => ({ default: m.CronPage })));
const ConfigPage = lazy(() => import('./pages/config/ConfigPage').then(m => ({ default: m.ConfigPage })));
const DiagnosticsPage = lazy(() => import('./pages/diagnostics/DiagnosticsPage').then(m => ({ default: m.DiagnosticsPage })));
const DebugPage = lazy(() => import('./pages/debug/DebugPage').then(m => ({ default: m.DebugPage })));
const LogsPage = lazy(() => import('./pages/logs/LogsPage').then(m => ({ default: m.LogsPage })));
const NotFoundPage = lazy(() => import('./pages/not-found/NotFoundPage').then(m => ({ default: m.NotFoundPage })));
const DesignSystemPage = lazy(() => import('./pages/design-system/DesignSystemPage').then(m => ({ default: m.DesignSystemPage })));
const LoginPage = lazy(() => import('./pages/login/LoginPage').then(m => ({ default: m.LoginPage })));

// Catches render errors from lazy-loaded chunks and prevents a silent white screen
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '2rem', textAlign: 'center' }}>
          Failed to load — please refresh the page.
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const { loading, enabled, authenticated } = useDashboardAuth();

  return (
    <ThemeProvider>
      <ErrorBoundary>
        {loading ? null : (
          <Suspense fallback={null}>
            {enabled && !authenticated ? (
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route path="*" element={<Navigate to="/login" replace />} />
              </Routes>
            ) : (
              <Routes>
                <Route path="/login" element={<Navigate to="/" replace />} />
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
            )}
          </Suspense>
        )}
      </ErrorBoundary>
      <Toaster position="top-right" richColors closeButton />
    </ThemeProvider>
  );
}
