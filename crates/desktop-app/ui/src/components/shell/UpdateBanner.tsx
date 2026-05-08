import { Download, X } from 'lucide-react'
import type { UpdateInfo } from '@/api/updater'
import { cn } from '@/lib/cn'

type Props = {
  info: UpdateInfo
  installing?: boolean
  onInstall: () => void
  onDismiss: () => void
}

/**
 * Slim top-of-window banner that appears when the updater found a newer
 * release. Dismiss to hide until next check; Install triggers download +
 * restart. Rendered inside AppShell so it sits above the sidebar + main.
 *
 * The banner spans the entire grid row 1 of the app shell (col-span-full
 * + row-start-1) and lets the OS drag the window from any empty space.
 */
export function UpdateBanner({ info, installing, onInstall, onDismiss }: Props) {
  return (
    <div
      role="status"
      className={cn(
        'col-span-full row-start-1 flex items-center justify-between gap-3 h-9',
        'pl-[132px] pr-3.5 bg-teal-soft border-b border-teal-line',
        'text-text-primary font-sans text-xs',
        '[-webkit-app-region:drag] [app-region:drag]',
      )}
    >
      <div className="flex items-center gap-2.5 overflow-hidden text-ellipsis whitespace-nowrap">
        <span
          className={cn(
            'inline-flex items-center px-[7px] py-0.5 rounded-[4px]',
            'font-mono text-[10px] font-bold tracking-[0.12em] uppercase',
            'bg-teal-400 text-bg-base',
          )}
        >
          Update
        </span>
        <span className="overflow-hidden text-ellipsis whitespace-nowrap">
          RushDino <strong className="font-semibold">{info.version}</strong> is ready
          <span className="font-mono text-[11px] text-text-dim ml-1">
            · you&apos;re on {info.current_version}
          </span>
        </span>
      </div>
      <div
        className={cn(
          'flex items-center gap-1 flex-shrink-0',
          '[-webkit-app-region:no-drag] [app-region:no-drag]',
        )}
      >
        <button
          type="button"
          onClick={onInstall}
          disabled={installing}
          className={cn(
            'inline-flex items-center gap-1.5 px-3 py-[5px] rounded-md border-0',
            'bg-teal-400 text-bg-base font-sans text-xs font-semibold cursor-pointer',
            'transition-colors duration-[140ms] ease-ease-cubic',
            '[&:hover:not(:disabled)]:bg-teal-300',
            'disabled:opacity-[0.55] disabled:cursor-default',
          )}
        >
          <Download size={12} strokeWidth={2} />
          {installing ? 'Installing…' : 'Install & restart'}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className={cn(
            'inline-flex items-center justify-center w-[26px] h-[26px] border-0 bg-transparent',
            'text-text-muted rounded-md cursor-pointer',
            'transition-[background-color,color] duration-[140ms] ease-ease-cubic',
            'hover:text-text-primary hover:bg-black/[0.06] dark:hover:bg-white/[0.08]',
          )}
        >
          <X size={13} strokeWidth={1.8} />
        </button>
      </div>
    </div>
  )
}
