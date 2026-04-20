import { type CSSProperties } from 'react'
import { TEAL, MUTED, ERROR, LINE_STRONG } from './tokens'
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

export function ErrorBlock({
  title = 'Tool call failed',
  detail = 'connect ECONNREFUSED 127.0.0.1:28847',
  onRetry,
  defaultOpen = true,
}: {
  title?: string
  detail?: string
  onRetry?: () => void
  defaultOpen?: boolean
}) {
  return (
    <Card kind="ERROR" title={title} status="error" defaultOpen={defaultOpen} accent={ERROR}>
      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div
          style={{
            background: 'rgba(248,113,113,.06)',
            border: `1px solid rgba(248,113,113,.25)`,
            borderRadius: 6,
            padding: '10px 12px',
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            color: ERROR,
            lineHeight: 1.5,
          }}
        >
          {detail}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={onRetry} style={artBtn(true)}>
            Retry
          </button>
          <button type="button" style={artBtn(false)}>
            Copy error
          </button>
        </div>
      </div>
    </Card>
  )
}
