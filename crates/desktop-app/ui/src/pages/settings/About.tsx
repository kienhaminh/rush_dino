import { Download, RefreshCw, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'

import { SettingsPageHeader } from '@/components/settings/SettingsPageHeader'
import { useUpdater } from '@/hooks/useUpdater'
import { cn } from '@/lib/cn'

export default function SettingsAbout() {
  const updater = useUpdater()
  const checking = updater.status === 'checking'
  const installing = updater.status === 'installing'

  return (
    <div className="settings-page">
      <SettingsPageHeader title="RushDino Desktop" eyebrow="About" divider={false} />

      {/* Hero */}
      <div className="about-hero">
        <div className="about-hero__logo">
          <img src="/logo.png" alt="RushDino" width={36} height={36} style={{ objectFit: 'contain' }} />
        </div>
        <div className="about-hero__text">
          <p className="about-hero__name">RushDino Desktop</p>
          <p className="about-hero__tagline">Local-first AI agent workbench · runs entirely on your machine</p>
        </div>
        <span className="about-hero__version">v0.1.0</span>
      </div>

      {/* Description */}
      <div className="about-desc">
        <div className="about-desc__block">
          <h3 className="about-desc__heading">Run AI on your own machine</h3>
          <p className="about-desc__body">
            RushDino embeds a full AI agent runtime directly inside the app — no cloud backend, no subprocess, no phone-home. Your conversations, credentials, and tool outputs stay on disk under <span className="mono">~/.rushdino/</span> and never leave without your explicit action.
          </p>
        </div>
        <div className="about-desc__block">
          <h3 className="about-desc__heading">Agents that actually do things</h3>
          <p className="about-desc__body">
            Connect agents to real tools — shell commands, file system, MCP servers, browser automation, and messaging channels. Each agent run is streamed token-by-token with full tool visibility, approval gates, and structured logging built in.
          </p>
        </div>
        <div className="about-desc__block">
          <h3 className="about-desc__heading">Bring your own models</h3>
          <p className="about-desc__body">
            RushDino is provider-agnostic. Plug in Anthropic, OpenAI, Gemini, or any Ollama model. Profiles let you stack variants, set fallback chains, and switch context without touching config files.
          </p>
        </div>
      </div>

      {/* Update */}
      <div className="about-update">
        <div className="about-update__head">
          <h2 className="about-update__title">Software Update</h2>
          <button
            type="button"
            className="btn"
            onClick={() => void updater.check()}
            disabled={checking || installing}
          >
            <RefreshCw
              size={13}
              strokeWidth={1.7}
              className={cn(checking && 'update-section__spin')}
            />
            {checking ? 'Checking…' : 'Check now'}
          </button>
        </div>

        <div className="about-update__status">
          <StatusLine
            status={updater.status}
            availableVersion={updater.info?.version}
            lastChecked={updater.lastChecked}
            error={updater.error}
          />
        </div>

        {updater.info && updater.status === 'available' && (
          <div className="about-update__release">
            {updater.info.body && (
              <pre className="about-update__notes">{updater.info.body}</pre>
            )}
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => void updater.install()}
              disabled={installing}
            >
              <Download size={13} strokeWidth={1.8} />
              {installing ? 'Installing & restarting…' : `Install ${updater.info.version} & restart`}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function StatusLine({
  status,
  availableVersion,
  lastChecked,
  error,
}: {
  status: ReturnType<typeof useUpdater>['status']
  availableVersion?: string
  lastChecked: Date | null
  error: string | null
}) {
  const when = lastChecked
    ? `checked ${lastChecked.toLocaleString([], { hour12: false })}`
    : 'not checked yet'

  switch (status) {
    case 'checking':
      return (
        <span className="update-line update-line--neutral">
          <Loader2 size={13} strokeWidth={1.7} className="update-section__spin" />
          Contacting update server…
        </span>
      )
    case 'up-to-date':
      return (
        <span className="update-line update-line--ok">
          <CheckCircle2 size={13} strokeWidth={1.7} />
          You're on the latest version. <span className="mono">· {when}</span>
        </span>
      )
    case 'available':
      return (
        <span className="update-line update-line--teal">
          <Download size={13} strokeWidth={1.7} />
          Version <strong>{availableVersion}</strong> is ready to install.
        </span>
      )
    case 'installing':
      return (
        <span className="update-line update-line--teal">
          <Loader2 size={13} strokeWidth={1.7} className="update-section__spin" />
          Downloading and installing update…
        </span>
      )
    case 'error':
      return (
        <span className="update-line update-line--error">
          <AlertCircle size={13} strokeWidth={1.7} />
          {error ?? 'Unknown error.'}
        </span>
      )
    case 'idle':
    default:
      return (
        <span className="update-line update-line--neutral">
          Click <strong>Check now</strong> to look for a newer build.
          <span className="mono"> · {when}</span>
        </span>
      )
  }
}
