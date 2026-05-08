import { cn } from '@/lib/cn'
import { TEAL, SUCCESS, WARN, DIM } from './tokens'
import { Card, Dot } from './card'

export type PlanItem = { label: string; done?: boolean; running?: boolean }

export function Plan({
  title = 'Deploy new adapter',
  items = [],
  defaultOpen = true,
}: {
  title?: string
  items?: PlanItem[]
  defaultOpen?: boolean
}) {
  const done = items.filter((i) => i.done).length
  return (
    <Card
      kind="PLAN"
      title={title}
      defaultOpen={defaultOpen}
      meta={`${done}/${items.length}`}
      accent={TEAL}
      compact={items.find((i) => !i.done)?.label ?? null}
    >
      <ol className="list-none p-0 mt-2.5 mb-0 mx-0 flex flex-col gap-2">
        {items.map((it, i) => {
          const running = !!it.running
          const d = !!it.done
          // Checkbox border + fill color is one of three tokens — keep dynamic.
          const color = d ? SUCCESS : running ? WARN : DIM
          return (
            <li
              key={i}
              className={cn(
                'flex items-center gap-2.5 text-[13px]',
                d ? 'text-text-muted line-through' : 'text-text-primary',
              )}
            >
              <span
                className="w-4 h-4 rounded-[4px] flex items-center justify-center flex-shrink-0"
                style={{
                  border: `1.5px solid ${color}`,
                  background: d ? color : 'transparent',
                }}
              >
                {d && (
                  <svg
                    width={10}
                    height={10}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#080c10"
                    strokeWidth={4}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </span>
              <span className="flex-1">{it.label}</span>
              {running && <Dot color={WARN} pulse />}
            </li>
          )
        })}
      </ol>
    </Card>
  )
}
