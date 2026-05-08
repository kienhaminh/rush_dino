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
    <div className="grid h-screen w-screen grid-cols-[280px_1fr] bg-bg-side">
      <aside
        className="flex flex-col"
        aria-label="Settings navigation"
      >
        {/* Empty drag strip sitting over the macOS traffic-light area. */}
        <div
          className="h-11 flex-shrink-0 [-webkit-app-region:drag] [app-region:drag]"
          data-tauri-drag-region
        />
        <button
          type="button"
          className={cn(
            'mx-2 mb-1 mt-0.5 flex items-center gap-2 rounded-md px-2.5 py-2',
            'border-none bg-transparent font-sans text-[13px] font-medium text-text-muted',
            'cursor-pointer text-left',
            'hover:bg-[rgba(0,0,0,0.04)] hover:text-text-primary',
            'dark:hover:bg-[rgba(255,255,255,0.05)]',
            '[-webkit-app-region:no-drag] [app-region:no-drag]',
          )}
          onClick={() => navigate('/')}
        >
          <ArrowLeft size={14} strokeWidth={1.7} />
          <span>Back to App</span>
        </button>
        <nav className="flex flex-col gap-0.5 overflow-y-auto px-2.5 py-3">
          {ENTRIES.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2.5 rounded-md px-2.5 py-2',
                  'font-sans text-[13px] no-underline',
                  'transition-colors duration-[140ms] ease-ease-cubic',
                  isActive
                    ? 'bg-teal-soft text-teal-400'
                    : cn(
                        'text-text-muted',
                        'hover:bg-[rgba(0,0,0,0.04)] hover:text-text-primary',
                        'dark:hover:bg-[rgba(255,255,255,0.04)]',
                      ),
                )
              }
            >
              <Icon size={15} strokeWidth={1.7} aria-hidden />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>

      <main className="settings-main flex flex-col gap-5 overflow-y-auto rounded-l-xl bg-bg-main px-10 pb-10 pt-8 shadow-[-1px_0_0_var(--ds-border-base)]">
        <Outlet />
      </main>
    </div>
  )
}
