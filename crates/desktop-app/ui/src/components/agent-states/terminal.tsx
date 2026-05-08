import { type StatusKey } from './tokens'
import { Card } from './card'

export type TermLine = { kind?: 'err' | 'ok' | 'warn'; text: string } | string

const LINE_COLOR: Record<'err' | 'ok' | 'warn', string> = {
  err: 'text-error',
  ok: 'text-success',
  warn: 'text-warning',
}

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
      <div className="mt-2.5 bg-[#050709] border border-border-line rounded-md px-3.5 py-3 font-mono text-xs leading-[1.7] text-text-primary overflow-auto">
        <div className="text-teal-400">$ {cmd}</div>
        {lines.map((l, i) => {
          const line = typeof l === 'string' ? { text: l } : l
          const cls = line.kind ? LINE_COLOR[line.kind] : 'text-[rgb(255_255_255_/_0.78)]'
          return (
            <div key={i} className={cls}>
              {line.text}
            </div>
          )
        })}
      </div>
    </Card>
  )
}
