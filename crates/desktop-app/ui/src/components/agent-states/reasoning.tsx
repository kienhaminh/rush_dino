import { DIM } from './tokens'
import { Card } from './card'

export function Reasoning({
  duration = '4.2s',
  steps = [],
  defaultOpen = false,
}: {
  duration?: string
  steps?: string[]
  defaultOpen?: boolean
}) {
  return (
    <Card
      kind="THINK"
      title="Reasoning"
      meta={duration}
      defaultOpen={defaultOpen}
      accent="rgba(255,255,255,.2)"
      compact={`${steps.length} steps`}
    >
      <div
        style={{
          marginTop: 10,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          fontSize: 13,
          lineHeight: 1.6,
          color: 'rgba(255,255,255,.65)',
          fontStyle: 'italic',
        }}
      >
        {steps.map((s, i) => (
          <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <span
              style={{
                color: DIM,
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                fontStyle: 'normal',
                width: 22,
                flexShrink: 0,
                lineHeight: 1.7,
              }}
            >
              {String(i + 1).padStart(2, '0')}
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>{s}</span>
          </div>
        ))}
      </div>
    </Card>
  )
}
