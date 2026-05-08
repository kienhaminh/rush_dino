import { cn } from '@/lib/cn'
import { type StatusKey } from './tokens'
import { Card, ArgLabel } from './card'

function formatArgValue(v: unknown): string {
  if (typeof v === 'string') return `"${v}"`
  if (v == null || typeof v === 'number' || typeof v === 'boolean') return String(v)
  try {
    return JSON.stringify(v, null, 2)
  } catch {
    return String(v)
  }
}

type ToolCallProps = {
  name?: string
  status?: StatusKey
  args?: Record<string, unknown>
  /** Server-provided tool result. Rendered as JSON when object, string otherwise. */
  result?: unknown
  defaultOpen?: boolean
}

export function ToolCall({
  name = 'github.create_issue',
  status = 'running',
  args = {},
  result,
  defaultOpen = true,
}: ToolCallProps) {
  const entries = Object.entries(args)
  return (
    <Card
      kind="TOOL"
      title={name}
      status={status}
      defaultOpen={defaultOpen}
      compact={entries.length ? `${entries.length} arg${entries.length > 1 ? 's' : ''}` : null}
    >
      {entries.length > 0 && (
        <div className="mt-2.5">
          <ArgLabel>Arguments</ArgLabel>
          <div className="bg-bg-card border border-border-line rounded-md px-3 py-2.5 font-mono text-xs leading-[1.6] text-text-primary overflow-x-auto">
            {entries.map(([k, v], i) => (
              <div
                key={i}
                className="flex gap-2.5 whitespace-pre-wrap break-words"
              >
                <span className="text-teal-400 min-w-[90px] flex-shrink-0">{k}:</span>
                <span className="text-[rgb(255_255_255_/_0.82)]">{formatArgValue(v)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {result != null && (
        <div className="mt-3">
          <ArgLabel>Result</ArgLabel>
          <div
            className={cn(
              'bg-bg-card border border-border-line rounded-md px-3 py-2.5 font-mono text-xs whitespace-pre-wrap break-words max-h-80 overflow-auto',
              status === 'error' ? 'text-error' : 'text-success',
            )}
          >
            {typeof result === 'object'
              ? JSON.stringify(result, null, 2)
              : String(result)}
          </div>
        </div>
      )}
    </Card>
  )
}
