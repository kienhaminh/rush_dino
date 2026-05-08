import { PanelRight } from 'lucide-react'

/** Top navigation bar showing the conversation title and panel toggle button. */
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
  // -webkit-app-region: drag — keep this region draggable so the user can
  // grab the topbar to move the Tauri window. Buttons opt out via the inner
  // [data-tauri-drag-region="false"] container.
  const borderClass = showPanel ? 'border-b-border-line' : 'border-b-transparent'
  return (
    <div
      className={`flex items-center gap-3 px-4 py-2.5 border-b transition-colors duration-[240ms] ease-ease-cubic flex-shrink-0 [-webkit-app-region:drag] [app-region:drag] ${borderClass}`}
      data-tauri-drag-region
    >
      <span className="font-sans text-sm font-medium text-text-primary">{title}</span>
      {running && (
        <span
          className="w-1.5 h-1.5 rounded-full bg-current opacity-80 animate-rd-dot-pulse"
          aria-label="Responding"
        />
      )}
      <div className="flex-1" />
      <div
        className="flex gap-1.5 [-webkit-app-region:no-drag] [app-region:no-drag]"
        data-tauri-drag-region="false"
      >
        <button
          type="button"
          className={`inline-flex items-center justify-center w-7 h-7 rounded-md border-0 bg-transparent cursor-pointer [-webkit-app-region:no-drag] [app-region:no-drag] transition-colors duration-150 ease-ease-cubic ${
            showPanel
              ? 'bg-[rgb(0_0_0_/_0.07)] dark:bg-[rgb(255_255_255_/_0.1)] text-text-primary'
              : 'text-text-muted'
          }`}
          aria-label="Toggle activity panel"
          onClick={onTogglePanel}
        >
          <PanelRight size={14} strokeWidth={1.7} />
        </button>
      </div>
    </div>
  )
}
