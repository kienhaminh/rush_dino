import { Card } from './card'

export function Reasoning({
  duration = '4.2s',
  steps = [],
  defaultOpen = false,
}: {
  duration?: string
  steps?: string[]
  defaultOpen?: boolean
}) {
  return (
    <Card
      kind="THINK"
      title="Reasoning"
      meta={duration}
      defaultOpen={defaultOpen}
      accent="rgba(255,255,255,.2)"
      compact={`${steps.length} steps`}
    >
      <div className="mt-2.5 flex flex-col gap-3 text-[13px] leading-[1.6] italic text-[rgb(255_255_255_/_0.65)]">
        {steps.map((s, i) => (
          <div key={i} className="flex gap-2.5 items-start">
            <span className="text-text-dim font-mono text-[11px] not-italic w-[22px] flex-shrink-0 leading-[1.7]">
              {String(i + 1).padStart(2, '0')}
            </span>
            <span className="flex-1 min-w-0">{s}</span>
          </div>
        ))}
      </div>
    </Card>
  )
}
