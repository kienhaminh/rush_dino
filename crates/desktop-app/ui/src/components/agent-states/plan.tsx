import { TEAL, SUCCESS, WARN, DIM, INK, MUTED } from './tokens'
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
      <ol
        style={{
          listStyle: 'none',
          padding: 0,
          margin: '10px 0 0',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        {items.map((it, i) => {
          const running = !!it.running
          const d = !!it.done
          const color = d ? SUCCESS : running ? WARN : DIM
          return (
            <li
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                fontSize: 13,
                color: d ? MUTED : INK,
                textDecoration: d ? 'line-through' : 'none',
              }}
            >
              <span
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 4,
                  border: `1.5px solid ${color}`,
                  background: d ? color : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
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
              <span style={{ flex: 1 }}>{it.label}</span>
              {running && <Dot color={WARN} pulse />}
            </li>
          )
        })}
      </ol>
    </Card>
  )
}
