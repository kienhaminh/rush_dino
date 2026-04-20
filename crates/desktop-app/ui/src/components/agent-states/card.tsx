import { useState, type ReactNode } from 'react'
import { TEAL, MUTED, DIM, INK, LINE, SURFACE, STATUS, type StatusKey } from './tokens'

export function Dot({ color, pulse }: { color: string; pulse?: boolean }) {
  return (
    <span
      style={{
        width: 7,
        height: 7,
        borderRadius: 999,
        background: color,
        display: 'inline-block',
        flexShrink: 0,
        boxShadow: `0 0 8px ${color}`,
        opacity: 0.95,
        animation: pulse ? 'rd-pulse 1.4s ease-in-out infinite' : undefined,
      }}
    />
  )
}

export function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width={12}
      height={12}
      viewBox="0 0 24 24"
      fill="none"
      stroke={MUTED}
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        transform: open ? 'rotate(90deg)' : 'none',
        transition: 'transform .15s ease',
        flexShrink: 0,
      }}
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

export function ArgLabel({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        color: DIM,
        fontSize: 10,
        letterSpacing: '.14em',
        textTransform: 'uppercase',
        fontWeight: 600,
        marginBottom: 6,
      }}
    >
      {children}
    </div>
  )
}

type CardProps = {
  kind: string
  title: string
  meta?: string | null
  status?: StatusKey
  defaultOpen?: boolean
  compact?: string | null
  accent?: string
  children?: ReactNode
}

export function Card({ kind, title, meta, status, defaultOpen = false, compact, accent, children }: CardProps) {
  const [open, setOpen] = useState(defaultOpen)
  const s = status ? STATUS[status] : null
  const borderLeft = accent ?? (s ? s.dot : TEAL)

  return (
    <div
      style={{
        border: `1px solid ${LINE}`,
        borderLeft: `2px solid ${borderLeft}`,
        background: SURFACE,
        borderRadius: 8,
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 12px',
          background: 'transparent',
          border: 'none',
          color: 'inherit',
          cursor: 'pointer',
          textAlign: 'left',
          fontFamily: 'inherit',
          fontSize: 12,
        }}
      >
        <Chevron open={open} />
        <span
          style={{
            color: borderLeft,
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            letterSpacing: '.12em',
            fontWeight: 700,
            textTransform: 'uppercase',
            minWidth: 58,
            flexShrink: 0,
          }}
        >
          {kind}
        </span>
        <span
          style={{
            color: INK,
            fontWeight: 500,
            fontSize: 13,
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {title}
        </span>
        {compact && !open ? (
          <span
            style={{
              color: DIM,
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              flexShrink: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: 180,
            }}
          >
            {compact}
          </span>
        ) : null}
        {meta ? (
          <span style={{ color: MUTED, fontFamily: 'var(--font-mono)', fontSize: 11, flexShrink: 0 }}>{meta}</span>
        ) : null}
        {s ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, color: MUTED, fontSize: 11 }}>
            <Dot color={s.dot} pulse={s.pulse} />
            {s.label}
          </span>
        ) : null}
      </button>
      {open ? <div style={{ padding: '4px 12px 14px', borderTop: `1px solid ${LINE}` }}>{children}</div> : null}
    </div>
  )
}
