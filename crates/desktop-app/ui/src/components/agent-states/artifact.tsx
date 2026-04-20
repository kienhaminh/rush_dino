import { type CSSProperties } from 'react'
import { TEAL, MUTED, INK, LINE_STRONG } from './tokens'
import { Card } from './card'

function artBtn(primary: boolean): CSSProperties {
  return {
    fontFamily: 'inherit',
    fontSize: 11,
    letterSpacing: '.08em',
    textTransform: 'uppercase',
    padding: '6px 12px',
    borderRadius: 999,
    cursor: 'pointer',
    background: primary ? TEAL : 'transparent',
    color: primary ? 'var(--ds-bg-base)' : MUTED,
    border: primary ? 'none' : `1px solid ${LINE_STRONG}`,
    fontWeight: 600,
  }
}

export function Artifact({
  kind = 'Image',
  name = 'chart.png',
  size = '42 KB',
  thumb,
  defaultOpen = false,
}: {
  kind?: string
  name?: string
  size?: string
  thumb?: string
  defaultOpen?: boolean
}) {
  return (
    <Card kind="ARTIFACT" title={name} meta={size} defaultOpen={defaultOpen} accent={TEAL} compact={kind}>
      <div style={{ marginTop: 10, display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        <div
          style={{
            width: 120,
            height: 80,
            flexShrink: 0,
            borderRadius: 6,
            background: thumb ?? 'linear-gradient(135deg, rgba(34,211,200,.15), rgba(34,211,200,.3))',
            border: `1px solid ${LINE_STRONG}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: TEAL,
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            letterSpacing: '.12em',
          }}
        >
          {kind.toUpperCase()}
        </div>
        <div style={{ flex: 1, fontSize: 12, color: MUTED, lineHeight: 1.6 }}>
          <div style={{ color: INK, marginBottom: 4 }}>{name}</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
            {kind} · {size}
          </div>
          <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
            <button type="button" style={artBtn(true)}>
              Open
            </button>
            <button type="button" style={artBtn(false)}>
              Download
            </button>
          </div>
        </div>
      </div>
    </Card>
  )
}
