import { NavLink } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  PanelLeft,
  SquarePen,
  Search,
  Clock,
  Kanban,
  SlidersHorizontal,
  Settings as SettingsIcon,
  type LucideIcon,
} from 'lucide-react'

import { listConversations, type ConversationSummary } from '@/api/chat'
import { SkeletonRow } from '@/components/Skeleton'
import { cn } from '@/lib/cn'

type Props = {
  onNewChat?: () => void
  onToggleSidebar?: () => void
}

export function LeftRail({ onNewChat, onToggleSidebar }: Props) {
  const conversations = useQuery({
    queryKey: ['conversations'],
    queryFn: listConversations,
    staleTime: 10_000,
  })

  return (
    <aside className="sidebar" aria-label="Primary navigation">
      <div className="sidebar__titlebar" data-tauri-drag-region>
        <div className="sidebar__titlebar-spacer" />
        <TitlebarIconBtn icon={PanelLeft} label="Hide sidebar" onClick={onToggleSidebar} />
      </div>

      {/* Quick actions */}
      <div className="sidebar__quick">
        <SidebarRow to="/?new=1" icon={SquarePen} label="New chat" end onClick={onNewChat} />
        <SidebarRow to="/search" icon={Search} label="Search" />
        <SidebarRow to="/cron" icon={Clock} label="Automations" />
        <SidebarRow to="/kanban" icon={Kanban} label="Kanban" />
      </div>

      <div className="sidebar__nav-body">
        {/* Chats */}
        <div className="sidebar__section">
          <div className="sidebar__section-head">
            <span className="sidebar__section-label">Chats</span>
            <div className="sidebar__section-tools">
              <button type="button" className="sidebar__ghost-icon" aria-label="Filter">
                <SlidersHorizontal size={13} strokeWidth={1.7} />
              </button>
              <NavLink
                to="/?new=1"
                onClick={onNewChat}
                className="sidebar__ghost-icon"
                aria-label="New chat"
              >
                <SquarePen size={13} strokeWidth={1.7} />
              </NavLink>
            </div>
          </div>
          <div className="sidebar__list">
            {conversations.isLoading && (
              <>
                <SkeletonRow />
                <SkeletonRow />
                <SkeletonRow />
                <SkeletonRow />
              </>
            )}
            {!conversations.isLoading && (!conversations.data || conversations.data.length === 0) && (
              <p className="sidebar__hint">No chats</p>
            )}
            {conversations.data?.map((c) => <ChatRow key={c.id} convo={c} />)}
          </div>
        </div>
      </div>

      <div className="sidebar__grow" />

      <div className="sidebar__bottom">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            cn('sidebar__row sidebar__row--bottom', isActive && 'sidebar__row--active')
          }
        >
          <SettingsIcon size={16} strokeWidth={1.6} className="sidebar__row-icon" />
          <span className="sidebar__row-name">Settings</span>
        </NavLink>
      </div>
    </aside>
  )
}

/* ── Titlebar icon button ─────────────────────────────────────────────── */
function TitlebarIconBtn({ icon: Icon, label, onClick }: { icon: LucideIcon; label: string; onClick?: () => void }) {
  return (
    <button
      type="button"
      className="sidebar__icon-btn"
      aria-label={label}
      title={label}
      data-tauri-drag-region="false"
      onClick={onClick}
    >
      <Icon size={15} strokeWidth={1.6} />
    </button>
  )
}

/* ── Generic sidebar row ──────────────────────────────────────────────── */
function SidebarRow({
  to,
  icon: Icon,
  label,
  end,
  onClick,
}: {
  to: string
  icon: LucideIcon
  label: string
  end?: boolean
  onClick?: () => void
}) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      className={({ isActive }) => cn('sidebar__row', isActive && 'sidebar__row--active')}
    >
      <Icon size={16} strokeWidth={1.6} className="sidebar__row-icon" />
      <span className="sidebar__row-name">{label}</span>
    </NavLink>
  )
}

/* ── Chat row ─────────────────────────────────────────────────────────── */
function ChatRow({ convo }: { convo: ConversationSummary }) {
  return (
    <NavLink
      to={`/?conversation=${convo.id}`}
      className={({ isActive }) => cn('chat-row', isActive && 'sidebar__row--active')}
    >
      <span className="chat-row__title">{convo.title || 'Untitled'}</span>
      <span className="chat-row__meta">···</span>
    </NavLink>
  )
}
