import { useQuery } from '@tanstack/react-query'
import { Shield, Lock, Globe, HardDrive } from 'lucide-react'

import { getConfig } from '@/api/config'
import { GlassPanel } from '@/components/glass/GlassPanel'
import { SettingsPageHeader } from '@/components/settings/SettingsPageHeader'

export default function Guardrail() {
  const q = useQuery({ queryKey: ['config'], queryFn: getConfig })
  const sec = q.data?.security as Record<string, unknown> | undefined
  const exec = q.data?.execution as Record<string, unknown> | undefined

  return (
    <div className="settings-page">
      <SettingsPageHeader
        title="Data & Privacy"
        lede="A read-out of the security posture as it lives on disk. The server applies changes live; execution policy resets sessions on shift."
      />

      <div className="guardrail-grid">
        <PostureCard icon={<Shield size={15} />} title="Authentication">
          <Row label="HMAC auth" value={boolText(sec?.hmac_auth_enabled)} />
          <Row label="Dashboard auth" value={boolText(sec?.dashboard_auth_enabled)} />
          <Row label="TLS mode" value={String(sec?.tls_mode ?? '—')} />
        </PostureCard>

        <PostureCard icon={<Globe size={15} />} title="Network">
          <Row label="Allowed origins" value={countHint(sec?.allowed_origins)} />
          <Row label="SSRF allow-list" value={countHint(sec?.ssrf_allowlist)} />
          <Row label="Egress proxy" value={boolText(sec?.egress_proxy_enabled)} />
        </PostureCard>

        <PostureCard icon={<HardDrive size={15} />} title="Execution">
          <Row label="Shell sandbox" value={boolText(exec?.shell_sandbox_enabled)} />
          <Row label="Workspace root" value={String(exec?.workspace_root ?? '—')} trunc />
          <Row label="Write roots" value={countHint(exec?.write_roots)} />
        </PostureCard>

        <PostureCard icon={<Lock size={15} />} title="Rate limits">
          <Row label="Per-endpoint caps" value={countHint(sec?.rate_limits)} />
          <Row label="Trusted proxies" value={countHint(sec?.trusted_proxies)} />
        </PostureCard>
      </div>
    </div>
  )
}

function PostureCard({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
}) {
  return (
    <GlassPanel variant="body" className="posture-card">
      <h2 className="posture-card__title">
        {icon} {title}
      </h2>
      <dl className="posture-card__list">{children}</dl>
    </GlassPanel>
  )
}

function Row({ label, value, trunc = false }: { label: string; value: string; trunc?: boolean }) {
  return (
    <div className="posture-card__row">
      <dt className="mono">{label}</dt>
      <dd className={trunc ? 'mono posture-card__trunc' : 'mono'}>{value}</dd>
    </div>
  )
}

function boolText(v: unknown): string {
  if (v === true) return 'on'
  if (v === false) return 'off'
  return '—'
}
function countHint(v: unknown): string {
  if (Array.isArray(v)) return v.length === 0 ? 'empty' : `${v.length} entries`
  if (v && typeof v === 'object') return `${Object.keys(v).length} keys`
  return '—'
}
