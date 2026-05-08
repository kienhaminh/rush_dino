import { useState, type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { TEAL, STATUS, type StatusKey } from './tokens'

/* ────────────────────────────────────────────────────────────────────
   Card primitives for the agent-states component family.
   The `borderLeft` accent + `kind` label color are genuinely dynamic
   (callers may pass tokens, raw rgba literals, or status colors), so
   those stay as inline `style` props. Everything else is utilities.
   ──────────────────────────────────────────────────────────────────── */

export function Dot({ color, pulse }: { color: string; pulse?: boolean }) {
  return (
    <span
      className={cn(
        'inline-block flex-shrink-0 w-[7px] h-[7px] rounded-full opacity-95',
        pulse && 'animate-[rd-pulse_1.4s_ease-in-out_infinite]',
      )}
      style={{ background: color, boxShadow: `0 0 8px ${color}` }}
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
      stroke="var(--ds-text-muted)"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('flex-shrink-0 transition-transform duration-150 ease-ease-cubic', open && 'rotate-90')}
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

export function ArgLabel({ children }: { children: ReactNode }) {
  return (
    <div className="text-[10px] tracking-[.14em] uppercase font-semibold mb-1.5 text-text-dim">
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
      className="border border-border-line bg-bg-surface rounded-lg overflow-hidden"
      style={{ borderLeft: `2px solid ${borderLeft}` }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 bg-transparent border-none text-inherit cursor-pointer text-left font-[inherit] text-xs"
      >
        <Chevron open={open} />
        <span
          className="font-mono text-[10px] tracking-[.12em] font-bold uppercase min-w-[58px] flex-shrink-0"
          style={{ color: borderLeft }}
        >
          {kind}
        </span>
        <span className="text-text-primary font-medium text-[13px] flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
          {title}
        </span>
        {compact && !open ? (
          <span className="text-text-dim font-mono text-[11px] flex-shrink-0 overflow-hidden text-ellipsis whitespace-nowrap max-w-[180px]">
            {compact}
          </span>
        ) : null}
        {meta ? (
          <span className="text-text-muted font-mono text-[11px] flex-shrink-0">{meta}</span>
        ) : null}
        {s ? (
          <span className="flex items-center gap-1.5 flex-shrink-0 text-text-muted text-[11px]">
            <Dot color={s.dot} pulse={s.pulse} />
            {s.label}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="pt-1 px-3 pb-3.5 border-t border-border-line">{children}</div>
      ) : null}
    </div>
  )
}
