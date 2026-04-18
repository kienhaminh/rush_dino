import { Download, X } from 'lucide-react'
import type { UpdateInfo } from '@/api/updater'

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
 */
export function UpdateBanner({ info, installing, onInstall, onDismiss }: Props) {
  return (
    <div className="update-banner" role="status">
      <div className="update-banner__body">
        <span className="update-banner__badge mono">Update</span>
        <span className="update-banner__text">
          RushDino <strong>{info.version}</strong> is ready
          <span className="update-banner__current mono">
            · you're on {info.current_version}
          </span>
        </span>
      </div>
      <div className="update-banner__actions">
        <button
          type="button"
          className="update-banner__install"
          onClick={onInstall}
          disabled={installing}
        >
          <Download size={12} strokeWidth={2} />
          {installing ? 'Installing…' : 'Install & restart'}
        </button>
        <button
          type="button"
          className="update-banner__dismiss"
          onClick={onDismiss}
          aria-label="Dismiss"
        >
          <X size={13} strokeWidth={1.8} />
        </button>
      </div>
    </div>
  )
}
