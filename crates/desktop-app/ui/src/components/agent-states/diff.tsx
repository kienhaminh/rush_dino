import { TEAL, SUCCESS, ERROR, INK, DIM, LINE, SURFACE_2 } from './tokens'
import { Card } from './card'

export type DiffHunk = { line: string | number; text: string; kind?: '+' | '-' }

export function Diff({
  file = 'Cargo.toml',
  hunks = [],
  defaultOpen = true,
}: {
  file?: string
  hunks?: DiffHunk[]
  defaultOpen?: boolean
}) {
  return (
    <Card
      kind="DIFF"
      title={file}
      defaultOpen={defaultOpen}
      accent={TEAL}
      meta={`${hunks.length} hunk${hunks.length > 1 ? 's' : ''}`}
    >
      <div
        style={{
          marginTop: 10,
          background: SURFACE_2,
          border: `1px solid ${LINE}`,
          borderRadius: 6,
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          lineHeight: 1.7,
          overflow: 'auto',
        }}
      >
        {hunks.map((h, i) => (
          <div key={i} style={{ display: 'flex', borderTop: i ? `1px solid ${LINE}` : 'none' }}>
            <div
              style={{
                padding: '8px 10px',
                color: DIM,
                background: 'rgba(0,0,0,.2)',
                minWidth: 38,
                textAlign: 'right',
                userSelect: 'none',
                fontSize: 11,
              }}
            >
              {h.line}
            </div>
            <div
              style={{
                padding: '8px 12px',
                flex: 1,
                background:
                  h.kind === '+' ? 'rgba(74,222,128,.08)' : h.kind === '-' ? 'rgba(248,113,113,.08)' : 'transparent',
                color: h.kind === '+' ? SUCCESS : h.kind === '-' ? ERROR : INK,
                whiteSpace: 'pre',
              }}
            >
              {`${h.kind ?? ' '} ${h.text}`}
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}
