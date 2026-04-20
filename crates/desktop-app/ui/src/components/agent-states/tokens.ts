export const TEAL      = 'var(--ds-teal-400)'
export const SUCCESS   = 'var(--ds-success)'
export const WARN      = 'var(--ds-warning)'
export const ERROR     = 'var(--ds-error)'
export const INK       = 'var(--ds-text-primary)'
export const MUTED     = 'var(--ds-text-muted)'
export const DIM       = 'var(--ds-text-dim)'
export const LINE      = 'var(--ds-border-line)'
export const LINE_STRONG = 'var(--ds-border-strong)'
export const SURFACE   = 'var(--ds-bg-surface)'
export const SURFACE_2 = 'var(--ds-bg-card)'
export const MONO      = 'var(--font-mono)'

export type StatusKey = 'running' | 'done' | 'error' | 'idle'

export const STATUS: Record<StatusKey, { dot: string; label: string; pulse: boolean }> = {
  running: { dot: WARN,    label: 'Running', pulse: true  },
  done:    { dot: SUCCESS, label: 'Done',    pulse: false },
  error:   { dot: ERROR,   label: 'Error',   pulse: false },
  idle:    { dot: DIM,     label: 'Idle',    pulse: false },
}
