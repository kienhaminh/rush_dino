import { TEAL } from './tokens'
import { Card } from './card'
import { PILL_BASE, PILL_GHOST, PILL_PRIMARY } from './pill'

export function Artifact({
  kind = 'Image',
  name = 'chart.png',
  size = '42 KB',
  thumb,
  defaultOpen = false,
}: {
  kind?: string
  name?: string
  size?: string
  thumb?: string
  defaultOpen?: boolean
}) {
  return (
    <Card kind="ARTIFACT" title={name} meta={size} defaultOpen={defaultOpen} accent={TEAL} compact={kind}>
      <div className="mt-2.5 flex gap-3.5 items-start">
        <div
          className="w-[120px] h-20 flex-shrink-0 rounded-md border border-border-strong flex items-center justify-center text-teal-400 font-mono text-[10px] tracking-[.12em]"
          // `thumb` may be any background value (image url, gradient); keep dynamic.
          style={{ background: thumb ?? 'linear-gradient(135deg, rgba(34,211,200,.15), rgba(34,211,200,.3))' }}
        >
          {kind.toUpperCase()}
        </div>
        <div className="flex-1 text-xs text-text-muted leading-[1.6]">
          <div className="text-text-primary mb-1">{name}</div>
          <div className="font-mono text-[11px]">
            {kind} · {size}
          </div>
          <div className="mt-2.5 flex gap-2">
            <button type="button" className={`${PILL_BASE} ${PILL_PRIMARY}`}>
              Open
            </button>
            <button type="button" className={`${PILL_BASE} ${PILL_GHOST}`}>
              Download
            </button>
          </div>
        </div>
      </div>
    </Card>
  )
}
