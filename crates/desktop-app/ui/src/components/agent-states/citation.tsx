import { useState } from 'react'
import { TEAL, MUTED, INK, LINE_STRONG, SURFACE } from './tokens'

export function Citation({
  num = 1,
  title = 'Rust async-trait RFC',
  domain = 'rust-lang.github.io',
  excerpt,
}: {
  num?: number
  title?: string
  domain?: string
  excerpt?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ display: 'inline-block' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '3px 10px',
          borderRadius: 999,
          background: open ? 'rgba(34,211,200,.15)' : 'rgba(34,211,200,.08)',
          border: `1px solid rgba(34,211,200,.25)`,
          color: TEAL,
          fontSize: 11,
          cursor: 'pointer',
          fontWeight: 600,
          fontFamily: 'inherit',
        }}
      >
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>{String(num).padStart(2, '0')}</span>
        <span>{domain}</span>
      </button>
      {open && (
        <div
          style={{
            marginTop: 8,
            padding: '10px 12px',
            background: SURFACE,
            border: `1px solid ${LINE_STRONG}`,
            borderRadius: 8,
            maxWidth: 360,
            fontSize: 12,
            lineHeight: 1.5,
          }}
        >
          <div style={{ color: INK, fontWeight: 600, marginBottom: 4 }}>{title}</div>
          <div style={{ color: TEAL, fontFamily: 'var(--font-mono)', fontSize: 10, marginBottom: 6 }}>{domain}</div>
          {excerpt && <div style={{ color: MUTED, fontStyle: 'italic' }}>{`"${excerpt}"`}</div>}
        </div>
      )}
    </div>
  )
}
