import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { RefreshCw, Radio } from 'lucide-react'

import { listAdapters, restartAdapter, type GatewayAdapter } from '@/api/gateway'
import { GlassPanel } from '@/components/glass/GlassPanel'
import { cn } from '@/lib/cn'
import { SettingsPageHeader } from '@/components/settings/SettingsPageHeader'
import { SkeletonCard } from '@/components/Skeleton'

const CHANNEL_GRID = 'grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3.5'

const STATUS_TONE: Record<string, string> = {
  running: 'text-success border-[rgba(74,222,128,0.4)]',
  failed: 'text-error border-[rgba(248,113,113,0.4)]',
  reconnecting: 'text-warning border-[rgba(245,193,24,0.4)]',
}

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
    <div className="flex w-full max-w-[920px] flex-col gap-5">
      <SettingsPageHeader
        title="Channels"
        lede={<>Every messaging surface RushDino exposes. Enable a channel in <span className="mono">config.toml</span>, then configure its credentials and restart.</>}
      />

      {q.isLoading && (
        <div className={CHANNEL_GRID}>
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

      <div className={CHANNEL_GRID}>
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
  const statusTone = STATUS_TONE[status] ?? 'text-text-dim border-border-strong'
  return (
    <GlassPanel
      variant="body"
      className="!flex flex-col gap-2 !px-5 !py-[18px]"
      style={{ borderLeft: `2px solid ${brand}` }}
    >
      <div className="flex items-center justify-between gap-2.5">
        <h3 className="m-0 inline-flex items-center gap-2 text-base font-semibold capitalize text-text-primary">
          <Radio size={13} strokeWidth={1.8} />
          {adapter.channelId}
        </h3>
        <span
          className={cn(
            'rounded-full border px-2 py-[3px]',
            'font-mono text-[10px] font-bold uppercase tracking-[0.1em]',
            statusTone,
          )}
        >
          {status}
        </span>
      </div>
      {adapter.lastError && (
        <p className="m-0 rounded bg-[rgba(248,113,113,0.08)] px-2.5 py-1.5 font-mono text-[11px] text-error">
          {adapter.lastError}
        </p>
      )}
      <dl className="m-0 grid grid-cols-[1fr_auto] gap-x-5 gap-y-2.5">
        <div className="flex justify-between gap-2.5">
          <dt className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-text-dim">
            Last event
          </dt>
          <dd className="m-0 text-xs text-text-primary">
            {adapter.lastEventAt
              ? new Date(adapter.lastEventAt).toLocaleString([], { hour12: false })
              : '—'}
          </dd>
        </div>
        <div className="flex justify-between gap-2.5">
          <dt className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-text-dim">
            Reconnects
          </dt>
          <dd className="metric-numeral m-0 text-xs text-text-primary">{adapter.reconnectCount ?? 0}</dd>
        </div>
      </dl>
      <div className="flex justify-end gap-1.5">
        <button type="button" className="chip chip--ghost" onClick={onRestart}>
          <RefreshCw size={11} strokeWidth={1.8} /> restart
        </button>
      </div>
    </GlassPanel>
  )
}
