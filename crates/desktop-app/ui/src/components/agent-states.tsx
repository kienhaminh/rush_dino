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

/* Layout/colors are static; the only behavior-driven class is the spinner
   animation on the running glyph. */
const HEAD_BASE =
  'flex items-center gap-2 w-full px-2.5 py-[7px] bg-transparent border-none ' +
  'text-text-primary font-mono text-xs cursor-pointer text-left ' +
  'transition-[background] duration-[140ms] ease-ease-cubic ' +
  'hover:bg-[rgb(255_255_255_/_0.03)]'

const ARGS_BASE =
  'm-0 mb-2 font-mono text-[11.5px] text-text-muted px-2.5 py-2 bg-bg-base ' +
  'border border-border-subtle rounded-md whitespace-pre-wrap break-words ' +
  'max-h-60 overflow-auto'

const LABEL_CLS =
  'font-mono text-[10px] tracking-[0.18em] uppercase text-text-dim my-1'

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
    <div className="border border-border-strong rounded-md bg-bg-card overflow-hidden p-0">
      <button
        type="button"
        className={HEAD_BASE}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown size={12} strokeWidth={1.8} />
        ) : (
          <ChevronRight size={12} strokeWidth={1.8} />
        )}
        <ToolCallGlyph status={status} />
        <span className="text-text-primary font-medium tracking-[-0.01em]">{name}</span>
      </button>
      {open && (
        <div className="px-3 pb-3 pt-2 pl-[30px] border-t border-border-line">
          {args && Object.keys(args).length > 0 && (
            <>
              <p className={LABEL_CLS}>args</p>
              <pre className={ARGS_BASE}>{JSON.stringify(args, null, 2)}</pre>
            </>
          )}
          {result !== undefined && (
            <>
              <p className={LABEL_CLS}>result</p>
              <pre className={ARGS_BASE}>
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
      return (
        <Loader2
          size={12}
          strokeWidth={2}
          className="text-teal-400 animate-[rd-spin_1s_linear_infinite]"
        />
      )
    case 'error':
      return <XIcon size={12} strokeWidth={2.2} className="text-error" />
    case 'done':
    default:
      return <Check size={12} strokeWidth={2} className="text-success" />
  }
}

/**
 * Inline streaming indicator — a short text label with a shimmer sweep
 * and a blinking caret, used while the assistant message is still arriving.
 */
export function Streaming({ text = 'thinking' }: { text?: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-sm">
      {/* Shimmer text uses a horizontal-sweep gradient clipped to the glyph. */}
      <span
        className="bg-clip-text text-transparent italic animate-[shimmer-sweep_2s_linear_infinite]"
        style={{
          backgroundImage:
            'linear-gradient(100deg, var(--ds-text-dim) 0%, var(--ds-text-muted) 45%, var(--ds-teal-300) 55%, var(--ds-text-muted) 65%, var(--ds-text-dim) 100%)',
          backgroundSize: '220% 100%',
        }}
      >
        {text}
      </span>
      <span
        className="inline-block w-0.5 h-3.5 bg-teal-400 animate-[rd-blink_1s_steps(2,end)_infinite]"
        aria-hidden
      />
    </span>
  )
}
