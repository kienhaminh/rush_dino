import { useQuery } from '@tanstack/react-query'
import { Server } from 'lucide-react'

import { getConfig } from '@/api/config'
import { GlassPanel } from '@/components/glass/GlassPanel'
import { SettingsPageHeader } from '@/components/settings/SettingsPageHeader'

type McpServer = {
  name?: string
  url?: string
  enabled?: boolean
  transport?: string
  [key: string]: unknown
}

export default function SettingsMcpServers() {
  const q = useQuery({ queryKey: ['config'], queryFn: getConfig })
  const servers = (q.data?.mcp_servers ?? []) as McpServer[]

  return (
    <div className="flex w-full max-w-[920px] flex-col gap-5">
      <SettingsPageHeader
        title="MCP Servers"
        eyebrow="Integrations"
        lede={<>Model Context Protocol endpoints the agent can call out to. Configured in <span className="mono">~/.rushdino/config.toml</span> under <span className="mono">[[mcp_servers]]</span>. Changes reconcile live.</>}
      />

      {q.isLoading && <p className="kg-hint shimmer">loading…</p>}
      {!q.isLoading && servers.length === 0 && (
        <GlassPanel variant="compact">
          <p className="kg-hint">
            No MCP servers registered. Add an entry to
            <span className="mono"> config.toml </span>
            and it will appear here.
          </p>
        </GlassPanel>
      )}
      <div className="provider-grid">
        {servers.map((s, i) => (
          <GlassPanel key={s.name ?? `mcp-${i}`} variant="body" className="provider-card">
            <div className="provider-card__head">
              <span className="provider-card__badge">
                <Server size={13} strokeWidth={1.8} /> MCP
              </span>
              <span className="provider-card__auth">
                {s.enabled === false ? 'disabled' : 'enabled'}
              </span>
            </div>
            <h3 className="provider-card__name">{s.name ?? `server ${i + 1}`}</h3>
            <dl className="provider-card__specs">
              {s.transport && (
                <div>
                  <dt className="mono">Transport</dt>
                  <dd className="mono">{s.transport}</dd>
                </div>
              )}
              {s.url && (
                <div>
                  <dt className="mono">URL</dt>
                  <dd className="mono provider-card__url">{s.url}</dd>
                </div>
              )}
            </dl>
          </GlassPanel>
        ))}
      </div>
    </div>
  )
}
