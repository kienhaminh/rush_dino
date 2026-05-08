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
  collapsed?: boolean
  bannerRow?: boolean
}

/* Hover surfaces: in light (default) tint with black, in dark tint with
   white. Active rows go a notch stronger than hover. Centralised so the
   six row variants below stay in sync. */
const ROW_HOVER = 'hover:bg-black/[0.04] dark:hover:bg-white/[0.05]'
const ROW_ACTIVE_BG = 'bg-black/[0.05] dark:bg-white/[0.06]'

const SIDEBAR_ROW_BASE =
  'flex items-center gap-3 px-2.5 py-[7px] rounded-md text-text-primary font-sans text-[14px] font-normal no-underline cursor-pointer transition-colors duration-[120ms] ease-ease-cubic'

const SIDEBAR_ICON_BTN =
  'inline-flex items-center justify-center w-7 h-7 rounded-md border-0 bg-transparent text-text-secondary cursor-pointer transition-[background-color,color] duration-[140ms] ease-ease-cubic [-webkit-app-region:no-drag] [app-region:no-drag] hover:bg-black/[0.05] hover:text-text-primary dark:hover:bg-white/[0.05]'

const GHOST_ICON =
  'inline-flex items-center justify-center w-[22px] h-[22px] border-0 bg-transparent text-text-muted rounded-[4px] cursor-pointer transition-[background-color,color] duration-[120ms] ease-ease-cubic hover:text-text-primary hover:bg-black/[0.05] dark:hover:bg-white/[0.05]'

export function LeftRail({ onNewChat, onToggleSidebar, collapsed, bannerRow }: Props) {
  const conversations = useQuery({
    queryKey: ['conversations'],
    queryFn: listConversations,
    staleTime: 10_000,
  })

  return (
    <aside
      aria-label="Primary navigation"
      className={cn(
        'flex flex-col min-h-0 bg-bg-side',
        /* Hidden when collapsed — fades content but keeps the layout
           transition smooth (column shrinks separately). */
        collapsed && 'opacity-0 pointer-events-none transition-opacity duration-[180ms] ease-ease-cubic',
        bannerRow && 'row-start-2',
      )}
    >
      {/* Titlebar: 56px tall, traffic-light area reserved on the left. */}
      <div
        data-tauri-drag-region
        className={cn(
          'flex items-center gap-3.5 h-14 pl-[78px] pr-4 flex-shrink-0',
          '[-webkit-app-region:drag] [app-region:drag]',
        )}
      >
        <div className="flex-1" />
        <TitlebarIconBtn icon={PanelLeft} label="Hide sidebar" onClick={onToggleSidebar} />
      </div>

      {/* Quick actions */}
      <div className="flex flex-col gap-px px-2 pt-1 pb-2">
        <SidebarRow to="/?new=1" icon={SquarePen} label="New chat" end onClick={onNewChat} />
        <SidebarRow to="/search" icon={Search} label="Search" />
        <SidebarRow to="/cron" icon={Clock} label="Automations" />
        <SidebarRow to="/kanban" icon={Kanban} label="Kanban" />
      </div>

      {/* Scrollable section body */}
      <div className="flex flex-col flex-1 min-h-0 overflow-y-auto">
        <div className="flex flex-col px-2 mt-3.5 min-h-0">
          <div className="flex items-center justify-between px-2.5 py-1.5">
            <span className="font-sans text-[13px] font-normal text-text-dim">Chats</span>
            <div className="flex items-center gap-0.5">
              <button type="button" aria-label="Filter" className={GHOST_ICON}>
                <SlidersHorizontal size={13} strokeWidth={1.7} />
              </button>
              <NavLink
                to="/?new=1"
                onClick={onNewChat}
                aria-label="New chat"
                className={GHOST_ICON}
              >
                <SquarePen size={13} strokeWidth={1.7} />
              </NavLink>
            </div>
          </div>
          <div className="flex flex-col gap-px overflow-y-auto min-h-0">
            {conversations.isLoading && (
              <>
                <SkeletonRow />
                <SkeletonRow />
                <SkeletonRow />
                <SkeletonRow />
              </>
            )}
            {!conversations.isLoading && (!conversations.data || conversations.data.length === 0) && (
              <p className="px-2.5 py-2 m-0 font-sans text-xs text-text-dim">No chats</p>
            )}
            {conversations.data?.map((c) => <ChatRow key={c.id} convo={c} />)}
          </div>
        </div>
      </div>

      <div className="flex-1" />

      <div className="px-2 pt-1.5 pb-3">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            cn(SIDEBAR_ROW_BASE, ROW_HOVER, 'py-2.5', isActive && cn(ROW_ACTIVE_BG, 'font-medium'))
          }
        >
          {({ isActive }) => (
            <>
              <SettingsIcon
                size={16}
                strokeWidth={1.6}
                className={cn(
                  'flex-shrink-0',
                  isActive ? 'text-text-primary' : 'text-text-secondary',
                )}
              />
              <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">Settings</span>
            </>
          )}
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
      aria-label={label}
      title={label}
      data-tauri-drag-region="false"
      onClick={onClick}
      className={SIDEBAR_ICON_BTN}
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
      className={({ isActive }) =>
        cn(SIDEBAR_ROW_BASE, ROW_HOVER, isActive && cn(ROW_ACTIVE_BG, 'font-medium'))
      }
    >
      {({ isActive }) => (
        <>
          <Icon
            size={16}
            strokeWidth={1.6}
            className={cn(
              'flex-shrink-0',
              isActive ? 'text-text-primary' : 'text-text-secondary',
            )}
          />
          <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">{label}</span>
        </>
      )}
    </NavLink>
  )
}

/* ── Chat row ─────────────────────────────────────────────────────────── */
function ChatRow({ convo }: { convo: ConversationSummary }) {
  return (
    <NavLink
      to={`/?conversation=${convo.id}`}
      className={({ isActive }) =>
        cn(
          'group flex items-center gap-1.5 px-2.5 py-1.5 rounded-md no-underline cursor-pointer',
          'transition-colors duration-[120ms] ease-ease-cubic',
          ROW_HOVER,
          isActive && ROW_ACTIVE_BG,
        )
      }
    >
      <span className="flex-1 font-sans text-[13.5px] font-medium text-text-primary overflow-hidden text-ellipsis whitespace-nowrap">
        {convo.title || 'Untitled'}
      </span>
      <span className="flex-shrink-0 text-[13px] text-text-dim opacity-0 group-hover:opacity-100 transition-opacity duration-[120ms] ease-ease-cubic">
        ···
      </span>
    </NavLink>
  )
}
