import { useQuery } from '@tanstack/react-query'
import { FolderOpen, ExternalLink } from 'lucide-react'

import { getConfig } from '@/api/config'
import { GlassPanel } from '@/components/glass/GlassPanel'
import { SettingsPageHeader } from '@/components/settings/SettingsPageHeader'

export default function SettingsWorkspace() {
  const q = useQuery({ queryKey: ['config'], queryFn: getConfig })
  const execution = (q.data?.execution ?? {}) as Record<string, unknown>
  const workspaceRoot = execution.workspace_root as string | undefined
  const writeRoots = (execution.write_roots ?? []) as string[]
  const sandboxEnabled = execution.shell_sandbox_enabled as boolean | undefined
  const networkPolicy = execution.network_policy as string | undefined

  return (
    <div className="settings-page">
      <SettingsPageHeader
        title="Workspace"
        lede={<>Where the agent is allowed to read and write on disk. Edit in <span className="mono">~/.rushdino/config.toml</span> under <span className="mono">[execution]</span>.</>}
      />

      <GlassPanel variant="body" className="config-summary">
        <div className="config-summary__row">
          <span className="config-summary__label mono">Workspace root</span>
          <span className="config-summary__value mono">{workspaceRoot ?? '—'}</span>
        </div>
        <div className="config-summary__row">
          <span className="config-summary__label mono">Shell sandbox</span>
          <span className="config-summary__value">
            {sandboxEnabled === undefined ? '—' : sandboxEnabled ? 'enabled' : 'disabled'}
          </span>
        </div>
        <div className="config-summary__row">
          <span className="config-summary__label mono">Network policy</span>
          <span className="config-summary__value mono">{networkPolicy ?? '—'}</span>
        </div>
        <div className="config-summary__row">
          <span className="config-summary__label mono">Write roots</span>
          <span className="config-summary__value">
            {writeRoots.length === 0 ? (
              '—'
            ) : (
              <>
                {writeRoots.slice(0, 6).map((p) => (
                  <span key={p} className="tag mono">
                    {p}
                  </span>
                ))}
                {writeRoots.length > 6 && (
                  <span className="tag">+{writeRoots.length - 6}</span>
                )}
              </>
            )}
          </span>
        </div>
      </GlassPanel>

      <GlassPanel variant="compact">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <FolderOpen size={22} strokeWidth={1.5} style={{ color: 'var(--ds-teal-400)' }} />
          <p className="kg-hint" style={{ margin: 0 }}>
            To change any of these, open the TOML directly. A proper editor lands in a
            later pass. <ExternalLink size={12} strokeWidth={1.8} style={{ verticalAlign: 'middle' }} />
          </p>
        </div>
      </GlassPanel>
    </div>
  )
}
