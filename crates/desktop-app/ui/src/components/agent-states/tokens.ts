/* Color string constants used by agent-states components for the few cases
   where values must flow through component props (e.g. `<Card accent={…}/>`
   sets inline `style.borderLeft` on a runtime-chosen color). Tailwind classes
   handle everything statically — these stay as `var(--ds-*)` strings so they
   resolve to the same tokens. */
export const TEAL    = 'var(--ds-teal-400)'
export const SUCCESS = 'var(--ds-success)'
export const WARN    = 'var(--ds-warning)'
export const ERROR   = 'var(--ds-error)'
export const DIM     = 'var(--ds-text-dim)'

export type StatusKey = 'running' | 'done' | 'error' | 'idle'

export const STATUS: Record<StatusKey, { dot: string; label: string; pulse: boolean }> = {
  running: { dot: WARN,    label: 'Running', pulse: true  },
  done:    { dot: SUCCESS, label: 'Done',    pulse: false },
  error:   { dot: ERROR,   label: 'Error',   pulse: false },
  idle:    { dot: DIM,     label: 'Idle',    pulse: false },
}
