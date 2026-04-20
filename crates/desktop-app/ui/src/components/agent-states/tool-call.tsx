import { type ReactNode } from 'react'
import { TEAL, SUCCESS, LINE, SURFACE_2, type StatusKey } from './tokens'
import { Card, ArgLabel } from './card'

type ToolCallProps = {
  name?: string
  status?: StatusKey
  args?: Record<string, unknown>
  result?: ReactNode
  defaultOpen?: boolean
}

export function ToolCall({
  name = 'github.create_issue',
  status = 'running',
  args = {},
  result,
  defaultOpen = true,
}: ToolCallProps) {
  const entries = Object.entries(args)
  return (
    <Card
      kind="TOOL"
      title={name}
      status={status}
      defaultOpen={defaultOpen}
      compact={entries.length ? `${entries.length} arg${entries.length > 1 ? 's' : ''}` : null}
    >
      {entries.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <ArgLabel>Arguments</ArgLabel>
          <div
            style={{
              background: SURFACE_2,
              border: `1px solid ${LINE}`,
              borderRadius: 6,
              padding: '10px 12px',
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              lineHeight: 1.6,
              color: 'var(--ds-text-primary)',
              overflowX: 'auto',
            }}
          >
            {entries.map(([k, v], i) => (
              <div key={i} style={{ display: 'flex', gap: 10, whiteSpace: 'nowrap' }}>
                <span style={{ color: TEAL, minWidth: 90, flexShrink: 0 }}>{k}:</span>
                <span style={{ color: 'rgba(255,255,255,.82)' }}>
                  {typeof v === 'string' ? `"${v}"` : String(v)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      {result != null && (
        <div style={{ marginTop: 12 }}>
          <ArgLabel>Result</ArgLabel>
          <div
            style={{
              background: SURFACE_2,
              border: `1px solid ${LINE}`,
              borderRadius: 6,
              padding: '10px 12px',
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              color: SUCCESS,
            }}
          >
            {typeof result === 'object' ? JSON.stringify(result) : String(result)}
          </div>
        </div>
      )}
    </Card>
  )
}
