import { useState, type ReactNode } from 'react'
import { ChevronRight, ChevronDown, Check, X as XIcon, Loader2 } from 'lucide-react'

type ToolCallStatus = 'pending' | 'running' | 'done' | 'error'

type ToolCallProps = {
  name: string
  status?: ToolCallStatus
  args?: Record<string, unknown>
  result?: unknown
  defaultOpen?: boolean
  children?: ReactNode
}

/**
 * Collapsible disclosure for a single tool call — mono header with a status
 * glyph and the tool name; click to expand and see args / result as JSON.
 */
export function ToolCall({
  name,
  status = 'done',
  args,
  result,
  defaultOpen = false,
  children,
}: ToolCallProps) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className={`tool-call tool-call--${status}`}>
      <button
        type="button"
        className="tool-call__head"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown size={12} strokeWidth={1.8} />
        ) : (
          <ChevronRight size={12} strokeWidth={1.8} />
        )}
        <ToolCallGlyph status={status} />
        <span className="tool-call__name">{name}</span>
      </button>
      {open && (
        <div className="tool-call__body">
          {args && Object.keys(args).length > 0 && (
            <>
              <p className="tool-call__label">args</p>
              <pre className="tool-call__args">{JSON.stringify(args, null, 2)}</pre>
            </>
          )}
          {result !== undefined && (
            <>
              <p className="tool-call__label">result</p>
              <pre className="tool-call__args">
                {typeof result === 'string' ? result : JSON.stringify(result, null, 2)}
              </pre>
            </>
          )}
          {children}
        </div>
      )}
    </div>
  )
}

function ToolCallGlyph({ status }: { status: ToolCallStatus }) {
  switch (status) {
    case 'running':
    case 'pending':
      return <Loader2 size={12} strokeWidth={2} className="tool-call__glyph tool-call__glyph--spin" />
    case 'error':
      return <XIcon size={12} strokeWidth={2.2} className="tool-call__glyph tool-call__glyph--error" />
    case 'done':
    default:
      return <Check size={12} strokeWidth={2} className="tool-call__glyph tool-call__glyph--done" />
  }
}

/**
 * Inline streaming indicator — a short text label with a shimmer sweep
 * and a blinking caret, used while the assistant message is still arriving.
 */
export function Streaming({ text = 'thinking' }: { text?: string }) {
  return (
    <span className="streaming">
      <span className="streaming__shimmer">{text}</span>
      <span className="streaming__caret" aria-hidden />
    </span>
  )
}
