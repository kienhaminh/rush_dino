import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Pencil,
  BarChart3,
  Cpu,
  Server,
  BookOpen,
  MessageSquare,
  ShieldCheck,
  MessageCircle,
  Palette,
  type LucideIcon,
} from 'lucide-react'

import { cn } from '@/lib/cn'

type NavEntry = {
  to: string
  label: string
  Icon: LucideIcon
}

const ENTRIES: NavEntry[] = [
  { to: 'general', label: 'General', Icon: Pencil },
  { to: 'appearance', label: 'Appearance', Icon: Palette },
  { to: 'usage', label: 'Usage', Icon: BarChart3 },
  { to: 'models', label: 'Models & API', Icon: Cpu },
  { to: 'mcp', label: 'MCP Servers', Icon: Server },
  { to: 'skills', label: 'Skills', Icon: BookOpen },
  { to: 'channels', label: 'IM Channels', Icon: MessageSquare },
  { to: 'privacy', label: 'Data & Privacy', Icon: ShieldCheck },
  { to: 'feedback', label: 'Feedback', Icon: MessageCircle },
]

export default function SettingsLayout() {
  const navigate = useNavigate()
  return (
    <div className="settings-root">
      <aside className="settings-nav" aria-label="Settings navigation">
        <div className="settings-nav__titlebar" data-tauri-drag-region />
        <button
          type="button"
          className="settings-nav__back"
          onClick={() => navigate('/')}
        >
          <ArrowLeft size={14} strokeWidth={1.7} />
          <span>Back to App</span>
        </button>
        <nav className="settings-nav__list">
          {ENTRIES.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn('settings-nav__item', isActive && 'settings-nav__item--active')
              }
            >
              <Icon size={15} strokeWidth={1.7} aria-hidden />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>

      <main className="settings-main">
        <Outlet />
      </main>
    </div>
  )
}
