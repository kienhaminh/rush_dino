import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { RefreshCw, Radio } from 'lucide-react'

import { listAdapters, restartAdapter, type GatewayAdapter } from '@/api/gateway'
import { GlassPanel } from '@/components/glass/GlassPanel'
import { cn } from '@/lib/cn'
import { SettingsPageHeader } from '@/components/settings/SettingsPageHeader'
import { SkeletonCard } from '@/components/Skeleton'

export default function Channels() {
  const qc = useQueryClient()
  const q = useQuery({
    queryKey: ['gateway', 'adapters'],
    queryFn: listAdapters,
    refetchInterval: 4000,
  })
  const restart = useMutation({
    mutationFn: restartAdapter,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['gateway', 'adapters'] }),
  })

  return (
    <div className="settings-page">
      <SettingsPageHeader
        title="Channels"
        lede={<>Every messaging surface RushDino exposes. Enable a channel in <span className="mono">config.toml</span>, then configure its credentials and restart.</>}
      />

      {q.isLoading && (
        <div className="channel-grid">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      )}
      {q.data && q.data.length === 0 && (
        <GlassPanel variant="compact">
          <p className="kg-hint">
            No adapters registered. Enable Telegram, Discord, or Slack in Settings.
          </p>
        </GlassPanel>
      )}

      <div className="channel-grid">
        {q.data?.map((a) => (
          <ChannelCard
            key={a.channelId}
            adapter={a}
            onRestart={() => restart.mutate(a.channelId)}
          />
        ))}
      </div>
    </div>
  )
}

const BRAND: Record<string, string> = {
  telegram: '#27A7E7',
  discord: '#5865F2',
  slack: '#ECB22E',
  webchat: '#E0945A',
  mobile: '#4FE3A3',
}

function ChannelCard({ adapter, onRestart }: { adapter: GatewayAdapter; onRestart: () => void }) {
  const brand = BRAND[adapter.channelId.toLowerCase()] ?? 'var(--copper-500)'
  const status = (adapter.status as string).toLowerCase()
  return (
    <GlassPanel
      variant="body"
      className="channel-card"
      style={{ borderLeft: `2px solid ${brand}` }}
    >
      <div className="channel-card__head">
        <h3 className="channel-card__name">
          <Radio size={13} strokeWidth={1.8} />
          {adapter.channelId}
        </h3>
        <span className={cn('channel-card__status', `channel-card__status--${status}`)}>
          {status}
        </span>
      </div>
      {adapter.lastError && (
        <p className="channel-card__error mono">{adapter.lastError}</p>
      )}
      <dl className="channel-card__meta">
        <div>
          <dt className="mono">Last event</dt>
          <dd className="mono">
            {adapter.lastEventAt
              ? new Date(adapter.lastEventAt).toLocaleString([], { hour12: false })
              : '—'}
          </dd>
        </div>
        <div>
          <dt className="mono">Reconnects</dt>
          <dd className="metric-numeral">{adapter.reconnectCount ?? 0}</dd>
        </div>
      </dl>
      <div className="channel-card__actions">
        <button type="button" className="chip chip--ghost" onClick={onRestart}>
          <RefreshCw size={11} strokeWidth={1.8} /> restart
        </button>
      </div>
    </GlassPanel>
  )
}
