import { cn } from '@/lib/cn'
import { TEAL } from './tokens'
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
      <div className="mt-2.5 bg-bg-card border border-border-line rounded-md font-mono text-xs leading-[1.7] overflow-auto">
        {hunks.map((h, i) => {
          const rowBg =
            h.kind === '+'
              ? 'bg-[rgb(74_222_128_/_0.08)] text-success'
              : h.kind === '-'
                ? 'bg-[rgb(248_113_113_/_0.08)] text-error'
                : 'bg-transparent text-text-primary'
          return (
            <div
              key={i}
              className={cn('flex', i && 'border-t border-border-line')}
            >
              <div className="px-2.5 py-2 text-text-dim bg-[rgb(0_0_0_/_0.2)] min-w-[38px] text-right select-none text-[11px]">
                {h.line}
              </div>
              <div className={`px-3 py-2 flex-1 whitespace-pre ${rowBg}`}>
                {`${h.kind ?? ' '} ${h.text}`}
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
