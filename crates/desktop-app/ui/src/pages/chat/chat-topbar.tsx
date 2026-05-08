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
  return (
    <div className={`chat-topbar ${showPanel ? 'chat-topbar--panel-open' : ''}`} data-tauri-drag-region>
      <span className="chat-topbar__title-text">{title}</span>
      {running && <span className="chat-topbar__running-dot" aria-label="Responding" />}
      <div className="chat-topbar__spacer" />
      <div className="chat-topbar__actions" data-tauri-drag-region="false">
        <button
          type="button"
          className={`chat-topbar__panel-btn ${showPanel ? 'chat-topbar__panel-btn--active' : ''}`}
          aria-label="Toggle activity panel"
          onClick={onTogglePanel}
        >
          <PanelRight size={14} strokeWidth={1.7} />
        </button>
      </div>
    </div>
  )
}
