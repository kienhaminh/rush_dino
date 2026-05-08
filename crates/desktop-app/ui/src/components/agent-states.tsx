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
    <div className="border border-border-strong rounded-md bg-bg-card overflow-hidden p-0">
      <button
        type="button"
        className="flex items-center gap-2 w-full px-2.5 py-[7px] bg-transparent border-none text-text-primary font-mono text-xs cursor-pointer text-left transition-[background] duration-[140ms] ease-ease-cubic hover:bg-[rgb(255_255_255_/_0.03)]"
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
        <div className="px-3 pt-2 pb-3 pl-[30px] border-t border-border-line">
          {args && Object.keys(args).length > 0 && (
            <>
              <p className="font-mono text-[10px] tracking-[0.18em] uppercase text-text-dim my-1">
                args
              </p>
              <pre className="m-0 mb-2 font-mono text-[11.5px] text-text-muted px-2.5 py-2 bg-bg-base border border-border-subtle rounded-[6px] whitespace-pre-wrap break-words max-h-60 overflow-auto">
                {JSON.stringify(args, null, 2)}
              </pre>
            </>
          )}
          {result !== undefined && (
            <>
              <p className="font-mono text-[10px] tracking-[0.18em] uppercase text-text-dim my-1">
                result
              </p>
              <pre className="m-0 mb-2 font-mono text-[11.5px] text-text-muted px-2.5 py-2 bg-bg-base border border-border-subtle rounded-[6px] whitespace-pre-wrap break-words max-h-60 overflow-auto">
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
      return <Loader2 size={12} strokeWidth={2} className="text-teal-400 animate-spin" />
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
 *
 * The shimmer uses background-clip: text + a moving linear-gradient (the
 * `shimmer-sweep` keyframe is defined in page-extras.css). The caret blink
 * uses `rd-blink` from tokens.css.
 */
export function Streaming({ text = 'thinking' }: { text?: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-sm">
      <span
        className="italic text-transparent bg-clip-text animate-[shimmer-sweep_2s_linear_infinite]"
        style={{
          backgroundImage:
            'linear-gradient(100deg, var(--ds-text-dim) 0%, var(--ds-text-muted) 45%, var(--ds-teal-300) 55%, var(--ds-text-muted) 65%, var(--ds-text-dim) 100%)',
          backgroundSize: '220% 100%',
        }}
      >
        {text}
      </span>
      <span
        aria-hidden
        className="inline-block w-0.5 h-[14px] bg-teal-400 animate-[rd-blink_1s_steps(2,end)_infinite]"
      />
    </span>
  )
}
