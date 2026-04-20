import { useQuery } from '@tanstack/react-query'
import { Shield, Lock, Globe, HardDrive } from 'lucide-react'

import { getConfig } from '@/api/config'
import { GlassPanel } from '@/components/glass/GlassPanel'
import { SettingsPageHeader } from '@/components/settings/SettingsPageHeader'

export default function Guardrail() {
  const q = useQuery({ queryKey: ['config'], queryFn: getConfig })
  const sec = q.data?.security as Record<string, unknown> | undefined
  const exec = q.data?.execution as Record<string, unknown> | undefined
  const sandbox = exec?.shell_exec_sandbox as Record<string, unknown> | undefined

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
          <Row label="Allowed origins" value={listHint(sec?.allowed_origins)} />
          <Row label="External hosts" value={listHint(sec?.allowed_external_hosts)} />
          <Row label="Trusted proxies" value={listHint(sec?.trusted_proxies)} />
        </PostureCard>

        <PostureCard icon={<HardDrive size={15} />} title="Execution">
          <Row label="Shell sandbox" value={boolText(sandbox?.enabled)} />
          <Row label="Workspace root" value={String(sandbox?.workspace_root ?? '—')} trunc />
          <Row label="Network access" value={boolText(sandbox?.allow_network)} />
        </PostureCard>

        <PostureCard icon={<Lock size={15} />} title="Filesystem">
          <Row label="Read roots" value={listHint(sec?.allowed_read_roots)} />
          <Row label="Extra write roots" value={listHint(sandbox?.extra_write_roots)} />
          <Row label="Profile count" value={countHint(q.data?.profiles)} />
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

function listHint(v: unknown): string {
  if (!Array.isArray(v)) return '—'
  if (v.length === 0) return 'empty'
  if (v.length <= 2) return v.map((item) => String(item)).join(', ')
  return `${v.length} entries`
}
