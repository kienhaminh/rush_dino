import { TEAL, SUCCESS, WARN, ERROR, INK, LINE, type StatusKey } from './tokens'
import { Card } from './card'

export type TermLine = { kind?: 'err' | 'ok' | 'warn'; text: string } | string

export function Terminal({
  cmd = 'cargo test',
  lines = [],
  defaultOpen = true,
  exit = 0,
}: {
  cmd?: string
  lines?: TermLine[]
  defaultOpen?: boolean
  exit?: number
}) {
  const status: StatusKey = exit === 0 ? 'done' : 'error'
  return (
    <Card kind="SHELL" title={cmd} status={status} defaultOpen={defaultOpen} meta={`exit ${exit}`}>
      <div
        style={{
          marginTop: 10,
          background: '#050709',
          border: `1px solid ${LINE}`,
          borderRadius: 6,
          padding: '12px 14px',
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          lineHeight: 1.7,
          color: INK,
          overflow: 'auto',
        }}
      >
        <div style={{ color: TEAL }}>$ {cmd}</div>
        {lines.map((l, i) => {
          const line = typeof l === 'string' ? { text: l } : l
          const color =
            line.kind === 'err'
              ? ERROR
              : line.kind === 'ok'
                ? SUCCESS
                : line.kind === 'warn'
                  ? WARN
                  : 'rgba(255,255,255,.78)'
          return (
            <div key={i} style={{ color }}>
              {line.text}
            </div>
          )
        })}
      </div>
    </Card>
  )
}
