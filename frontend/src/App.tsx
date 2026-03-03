import { Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './hooks/use-theme';
import { AppLayout } from './layouts/AppLayout';

// Pages
import { ChatPage } from './pages/chat/ChatPage';
import { OverviewPage } from './pages/overview/OverviewPage';
import { ChannelsRoute } from './pages/channels/ChannelsRoute';
import { InstancesRoute } from './pages/instances/InstancesRoute';
import { SessionsRoute } from './pages/sessions/SessionsRoute';
import { UsagePage } from './pages/usage/UsagePage';
import { AgentsPage } from './pages/agents/AgentsPage';
import { SkillsRoute } from './pages/skills/SkillsRoute';
import { NodesPage } from './pages/nodes/NodesPage';
import { CronPage } from './pages/cron/CronPage';
import { ConfigPage } from './pages/config/ConfigPage';
import { DebugPage } from './pages/debug/DebugPage';
import { LogsPage } from './pages/logs/LogsPage';
import { NotFoundPage } from './pages/not-found/NotFoundPage';

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
          <Route path="channels" element={<ChannelsRoute />} />
          <Route path="instances" element={<InstancesRoute />} />
          <Route path="sessions" element={<SessionsRoute />} />
          <Route path="usage" element={<UsagePage />} />
          <Route path="cron" element={<CronPage />} />

          {/* Agent */}
          <Route path="agents" element={<AgentsPage />} />
          <Route path="skills" element={<SkillsRoute />} />
          <Route path="nodes" element={<NodesPage />} />

          {/* Settings */}
          <Route path="config" element={<ConfigPage />} />
          <Route path="debug" element={<DebugPage />} />
          <Route path="logs" element={<LogsPage />} />

          {/* Catch-all */}
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </ThemeProvider>
  );
}
