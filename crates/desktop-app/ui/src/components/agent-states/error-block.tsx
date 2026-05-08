import { ERROR } from './tokens'
import { Card } from './card'
import { PILL_BASE, PILL_GHOST, PILL_PRIMARY } from './pill'

export function ErrorBlock({
  title = 'Tool call failed',
  detail = 'connect ECONNREFUSED 127.0.0.1:28847',
  onRetry,
  defaultOpen = true,
}: {
  title?: string
  detail?: string
  onRetry?: () => void
  defaultOpen?: boolean
}) {
  return (
    <Card kind="ERROR" title={title} status="error" defaultOpen={defaultOpen} accent={ERROR}>
      <div className="mt-2.5 flex flex-col gap-3">
        <div className="bg-[rgb(248_113_113_/_0.06)] border border-[rgb(248_113_113_/_0.25)] rounded-md px-3 py-2.5 font-mono text-xs text-error leading-[1.5]">
          {detail}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onRetry}
            className={`${PILL_BASE} ${PILL_PRIMARY}`}
          >
            Retry
          </button>
          <button type="button" className={`${PILL_BASE} ${PILL_GHOST}`}>
            Copy error
          </button>
        </div>
      </div>
    </Card>
  )
}
