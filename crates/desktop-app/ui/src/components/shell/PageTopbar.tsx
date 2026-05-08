import type { ReactNode } from 'react'
import { useOutletContext } from 'react-router-dom'
import { cn } from '@/lib/cn'

type Props = {
  title: string
  eyebrow?: string
  actions?: ReactNode
  className?: string
}

type ShellOutletContext = { collapsed: boolean }

/**
 * Shared top bar for non-chat pages in the main area. Mirrors the
 * sidebar titlebar height (56px) so the two edges line up. Left side:
 * optional eyebrow + title. Right side: caller-supplied actions (files,
 * share, etc.). Drag-enabled so the whole empty space moves the window.
 *
 * When the sidebar is collapsed, the bar reserves ~132px on the left so
 * content does not crash into the macOS traffic lights and the floating
 * sidebar toggle.
 */
export function PageTopbar({ title, eyebrow, actions, className }: Props) {
  /* AppShell provides `{ collapsed }` via Outlet context. May be undefined
     in stories or one-off mounts; default safely. */
  const ctx = useOutletContext<ShellOutletContext | undefined>()
  const collapsed = ctx?.collapsed ?? false

  return (
    <header
      data-tauri-drag-region
      className={cn(
        'flex items-center gap-4 h-14 flex-shrink-0 bg-bg-main',
        '[-webkit-app-region:drag] [app-region:drag]',
        collapsed ? 'pl-[132px] pr-6' : 'px-6',
        className,
      )}
    >
      <div className="flex flex-col gap-0.5 flex-1 min-w-0">
        {eyebrow && (
          <div className="font-mono text-[9px] font-bold tracking-[0.2em] uppercase text-text-dim">
            {eyebrow}
          </div>
        )}
        <h1 className="font-sans text-[15px] font-semibold tracking-[-0.01em] text-text-primary m-0 overflow-hidden text-ellipsis whitespace-nowrap">
          {title}
        </h1>
      </div>
      {actions && (
        <div className="flex items-center gap-2" data-tauri-drag-region="false">
          {actions}
        </div>
      )}
    </header>
  )
}
