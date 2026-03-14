import { Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './hooks/use-theme';
import { AppLayout } from './layouts/AppLayout';
import { Toaster } from 'sonner';

// Pages
import { ChatPage } from './pages/chat/ChatPage';
import { OverviewPage } from './pages/overview/OverviewPage';
import { SoulMemoryPage } from './pages/soul-memory/SoulMemoryPage';
import { GatewayRoute } from './pages/gateway/GatewayRoute';
import { ApprovalsPage } from './pages/approvals/ApprovalsPage';
import { InstancesRoute } from './pages/instances/InstancesRoute';
import { SessionsRoute } from './pages/sessions/SessionsRoute';
import { MetricsPage } from './pages/metrics/MetricsPage';
import { AgentBoardPage } from './pages/agent-board/AgentBoardPage';
import { AgentsPage } from './pages/agents/AgentsPage';
import { RunsRoute } from './pages/runs/RunsRoute';
import { WorkflowsPage } from './pages/workflows/WorkflowsPage';
import { SkillsRoute } from './pages/skills/SkillsRoute';
import { NodesPage } from './pages/nodes/NodesPage';
import { CronPage } from './pages/cron/CronPage';
import { ConfigPage } from './pages/config/ConfigPage';
import { DiagnosticsPage } from './pages/diagnostics/DiagnosticsPage';
import { DebugPage } from './pages/debug/DebugPage';
import { LogsPage } from './pages/logs/LogsPage';
import { NotFoundPage } from './pages/not-found/NotFoundPage';
import { DesignSystemPage } from './pages/design-system/DesignSystemPage';

export default function App() {
  return (
    <ThemeProvider>
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
      <Toaster position="top-right" richColors closeButton />
    </ThemeProvider>
  );
}
