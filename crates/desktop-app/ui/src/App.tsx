import { Navigate, Route, Routes } from 'react-router-dom'

import { AppShell } from '@/components/shell/AppShell'

import Chat from '@/pages/Chat'
import Search from '@/pages/Search'
import Sessions from '@/pages/Sessions'
import Agents from '@/pages/Agents'
import CodingAgents from '@/pages/CodingAgents'
import Workflows from '@/pages/Workflows'
import Kanban from '@/pages/Kanban'
import KnowledgeGraph from '@/pages/KnowledgeGraph'
import Cron from '@/pages/Cron'
import Approvals from '@/pages/Approvals'
import Logs from '@/pages/Logs'
import NotFound from '@/pages/NotFound'

import SettingsLayout from '@/pages/settings/SettingsLayout'
import SettingsGeneral from '@/pages/settings/General'
import SettingsUsage from '@/pages/Metrics'
import SettingsModels from '@/pages/Providers'
import SettingsMcp from '@/pages/settings/McpServers'
import SettingsSkills from '@/pages/Skills'
import SettingsImChannels from '@/pages/Channels'
import SettingsPrivacy from '@/pages/Guardrail'
import SettingsFeedback from '@/pages/settings/Feedback'
import SettingsAppearance from '@/pages/settings/Appearance'

export default function App() {
  return (
    <Routes>
      {/* Settings — full-screen layout with its own side nav. */}
      <Route path="/settings" element={<SettingsLayout />}>
        <Route index element={<Navigate to="general" replace />} />
        <Route path="general" element={<SettingsGeneral />} />
        <Route path="usage" element={<SettingsUsage />} />
        <Route path="models" element={<SettingsModels />} />
        <Route path="mcp" element={<SettingsMcp />} />
        <Route path="skills" element={<SettingsSkills />} />
        <Route path="channels" element={<SettingsImChannels />} />
        <Route path="privacy" element={<SettingsPrivacy />} />
        <Route path="feedback" element={<SettingsFeedback />} />
        <Route path="appearance" element={<SettingsAppearance />} />
      </Route>

      {/* Main app — sidebar (Agents / IM Channels / Cron Jobs) + chat. */}
      <Route element={<AppShell />}>
        <Route path="/" element={<Chat />} />
        <Route path="/search" element={<Search />} />
        <Route path="/agents" element={<Agents />} />
        <Route path="/agents/:id" element={<Chat />} />
        <Route path="/sessions" element={<Sessions />} />
        <Route path="/coding-agents" element={<CodingAgents />} />
        <Route path="/acp-sessions" element={<CodingAgents />} />
        <Route path="/workflows" element={<Workflows />} />
        <Route path="/kanban" element={<Kanban />} />
        <Route path="/agent-board" element={<Kanban />} />
        <Route path="/knowledge-graph" element={<KnowledgeGraph />} />
        <Route path="/cron" element={<Cron />} />
        <Route path="/approvals" element={<Approvals />} />
        <Route path="/logs" element={<Logs />} />

        {/* Legacy top-level routes now live under /settings — redirect so
            bookmarks and command-palette history still work. */}
        <Route path="/config" element={<Navigate to="/settings/general" replace />} />
        <Route path="/providers" element={<Navigate to="/settings/models" replace />} />
        <Route path="/skills" element={<Navigate to="/settings/skills" replace />} />
        <Route path="/channels" element={<Navigate to="/settings/channels" replace />} />
        <Route path="/metrics" element={<Navigate to="/settings/usage" replace />} />
        <Route path="/guardrail" element={<Navigate to="/settings/privacy" replace />} />

        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
