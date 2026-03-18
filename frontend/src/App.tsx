import React, { Suspense, lazy } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ThemeProvider } from './hooks/use-theme';
import { useDashboardAuth } from './hooks/use-dashboard-auth';
import { AppLayout } from './layouts/AppLayout';
import { Toaster } from 'sonner';
import { resolveLegacyPath } from './lib/dashboard-routes';

// Pages — lazy loaded for route-based code splitting
const ChatPage = lazy(() => import('./pages/chat/ChatPage').then(m => ({ default: m.ChatPage })));
const OverviewPage = lazy(() => import('./pages/overview/OverviewPage').then(m => ({ default: m.OverviewPage })));
const OperationsPage = lazy(() => import('./pages/operations/OperationsPage').then(m => ({ default: m.OperationsPage })));
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
const CodingAgentsPage = lazy(() => import('./pages/coding-agents/CodingAgentsPage').then(m => ({ default: m.CodingAgentsPage })));
const AcpSessionsPage = lazy(() => import('./pages/acp-sessions/AcpSessionsPage').then(m => ({ default: m.AcpSessionsPage })));
const ConfigPage = lazy(() => import('./pages/config/ConfigPage').then(m => ({ default: m.ConfigPage })));
const DiagnosticsPage = lazy(() => import('./pages/diagnostics/DiagnosticsPage').then(m => ({ default: m.DiagnosticsPage })));
const DebugPage = lazy(() => import('./pages/debug/DebugPage').then(m => ({ default: m.DebugPage })));
const LogsPage = lazy(() => import('./pages/logs/LogsPage').then(m => ({ default: m.LogsPage })));
const BuilderPage = lazy(() => import('./pages/builder/BuilderPage').then(m => ({ default: m.BuilderPage })));
const SystemPage = lazy(() => import('./pages/system/SystemPage').then(m => ({ default: m.SystemPage })));
const SandboxMonitorPage = lazy(() => import('./pages/sandbox/SandboxMonitorPage').then(m => ({ default: m.SandboxMonitorPage })));
const NotFoundPage = lazy(() => import('./pages/not-found/NotFoundPage').then(m => ({ default: m.NotFoundPage })));
const DesignSystemPage = lazy(() => import('./pages/design-system/DesignSystemPage').then(m => ({ default: m.DesignSystemPage })));
const LoginPage = lazy(() => import('./pages/login/LoginPage').then(m => ({ default: m.LoginPage })));

function RouteLoading() {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-background">
      <div className="rounded-2xl border border-border/50 bg-card/70 px-5 py-4 text-sm text-muted-foreground shadow-sm">
        Loading dashboard route…
      </div>
    </div>
  );
}

function LegacyRedirect() {
  const location = useLocation();
  const redirectTo = resolveLegacyPath(location.pathname);

  if (!redirectTo) {
    return <NotFoundPage />;
  }

  if (redirectTo.includes('?') || !location.search) {
    return <Navigate to={redirectTo} replace />;
  }

  return <Navigate to={`${redirectTo}${location.search}`} replace />;
}

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
          <Suspense fallback={<RouteLoading />}>
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

                  {/* Operations */}
                  <Route path="operations" element={<OperationsPage />}>
                    <Route index element={<Navigate to="summary" replace />} />
                    <Route path="summary" element={<OverviewPage />} />
                    <Route path="approvals" element={<ApprovalsPage />} />
                    <Route path="diagnostics" element={<DiagnosticsPage />} />
                    <Route path="analytics" element={<MetricsPage />} />
                  </Route>

                  {/* Channels */}
                  <Route path="channels" element={<GatewayRoute />} />
                  <Route path="channels/:channel" element={<GatewayRoute />} />

                  {/* Sessions and runs */}
                  <Route path="sessions" element={<SessionsRoute />} />
                  <Route path="sessions/:sessionId" element={<SessionsRoute />} />
                  <Route path="runs" element={<RunsRoute />} />

                  {/* Config */}
                  <Route path="config" element={<Navigate to="/config/profiles" replace />} />
                  <Route path="config/:section" element={<ConfigPage />} />

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
                    <Route path="sandbox" element={<SandboxMonitorPage />} />
                  </Route>

                  {/* Legacy redirects */}
                  <Route path="overview" element={<LegacyRedirect />} />
                  <Route path="approvals" element={<LegacyRedirect />} />
                  <Route path="diagnostics" element={<LegacyRedirect />} />
                  <Route path="metrics" element={<LegacyRedirect />} />
                  <Route path="gateway" element={<LegacyRedirect />} />
                  <Route path="gateway/:channel/settings" element={<LegacyRedirect />} />
                  <Route path="instances" element={<LegacyRedirect />} />
                  <Route path="soul-memory" element={<LegacyRedirect />} />
                  <Route path="agent-board" element={<LegacyRedirect />} />
                  <Route path="agents" element={<LegacyRedirect />} />
                  <Route path="workflows" element={<LegacyRedirect />} />
                  <Route path="skills" element={<LegacyRedirect />} />
                  <Route path="coding-agents" element={<LegacyRedirect />} />
                  <Route path="acp-sessions" element={<LegacyRedirect />} />
                  <Route path="logs" element={<LegacyRedirect />} />
                  <Route path="cron" element={<LegacyRedirect />} />
                  <Route path="nodes" element={<LegacyRedirect />} />
                  <Route path="debug" element={<LegacyRedirect />} />

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
