import { ChevronLeft, ChevronRight, PanelRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/primitives/Button'
import { cn } from '@/lib/cn'

/** Top navigation bar showing the conversation title and panel toggle button.
 *  The three-column layout keeps the window title optically centered while
 *  desktop navigation and inspector controls remain at the edges. */
export function ChatTopbar({
  title,
  running,
  showPanel,
  onTogglePanel,
}: {
  title: string
  running: boolean
  showPanel: boolean
  onTogglePanel: () => void
}) {
  const navigate = useNavigate()
  const borderClass = 'border-b-border-line'
  return (
    <div
      className={`grid grid-cols-[1fr_auto_1fr] items-center h-14 px-5 border-b transition-colors duration-[240ms] ease-ease-cubic flex-shrink-0 bg-bg-main [-webkit-app-region:drag] [app-region:drag] ${borderClass}`}
      data-tauri-drag-region
    >
      <div
        className="justify-self-start flex items-center gap-1 [-webkit-app-region:no-drag] [app-region:no-drag]"
        data-tauri-drag-region="false"
      >
        <Button
          variant="square"
          aria-label="Back"
          title="Back"
          onClick={() => navigate(-1)}
          className="size-7"
        >
          <ChevronLeft size={16} strokeWidth={1.6} />
        </Button>
        <Button
          variant="square"
          aria-label="Forward"
          title="Forward"
          onClick={() => navigate(1)}
          className="size-7 text-text-faint"
        >
          <ChevronRight size={16} strokeWidth={1.6} />
        </Button>
      </div>

      <div className="flex items-center justify-center gap-2 min-w-0">
        <h1 className="m-0 font-sans text-sm font-semibold text-text-primary tracking-[-0.005em] whitespace-nowrap overflow-hidden text-ellipsis">
          {title}
        </h1>
        {running && (
          <span
            className="w-1.5 h-1.5 rounded-full bg-teal-400 opacity-80 animate-rd-dot-pulse"
            aria-label="Responding"
          />
        )}
      </div>

      <div
        className="justify-self-end flex [-webkit-app-region:no-drag] [app-region:no-drag]"
        data-tauri-drag-region="false"
      >
        <Button
          variant="square"
          className={cn('size-7', showPanel && 'bg-teal-soft text-text-primary')}
          aria-label="Toggle activity panel"
          aria-pressed={showPanel}
          title={`${showPanel ? 'Hide' : 'Show'} activity inspector`}
          onClick={onTogglePanel}
        >
          <PanelRight size={14} strokeWidth={1.6} />
        </Button>
      </div>
    </div>
  )
}
