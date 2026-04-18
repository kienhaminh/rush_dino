import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

type Props = {
  title: string
  eyebrow?: string
  actions?: ReactNode
  className?: string
}

/**
 * Shared top bar for non-chat pages in the main area. Mirrors the
 * sidebar titlebar height (56px) so the two edges line up. Left side:
 * optional eyebrow + title. Right side: caller-supplied actions (files,
 * share, etc.). Drag-enabled so the whole empty space moves the window.
 */
export function PageTopbar({ title, eyebrow, actions, className }: Props) {
  return (
    <header className={cn('page-topbar', className)} data-tauri-drag-region>
      <div className="page-topbar__body">
        {eyebrow && <div className="page-topbar__eyebrow mono">{eyebrow}</div>}
        <h1 className="page-topbar__title">{title}</h1>
      </div>
      {actions && (
        <div className="page-topbar__actions" data-tauri-drag-region="false">
          {actions}
        </div>
      )}
    </header>
  )
}
