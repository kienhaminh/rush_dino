import { Coins } from 'lucide-react'
import { GlassPanel } from '@/components/glass/GlassPanel'
import { IridescentLine } from '@/components/glass/IridescentLine'

export default function SettingsCredits() {
  return (
    <div className="settings-page">
      <header>
        <p className="eyebrow">Billing</p>
        <h1 className="display-title">Credits</h1>
        <p className="lede">
          RushDino is local-first. The only credits that matter today are the ones on
          your LLM provider's account — configure those keys on
          <strong> Models &amp; API</strong>. A local credit ledger lands in a future
          release for teams that want per-user caps.
        </p>
      </header>

      <IridescentLine opacity={0.3} />

      <GlassPanel variant="compact">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Coins size={28} strokeWidth={1.5} style={{ color: 'var(--ds-teal-400)' }} />
          <div>
            <p className="kg-hint" style={{ margin: 0 }}>
              Coming soon: per-agent usage caps, shared team pools, cost alerts.
            </p>
          </div>
        </div>
      </GlassPanel>
    </div>
  )
}
