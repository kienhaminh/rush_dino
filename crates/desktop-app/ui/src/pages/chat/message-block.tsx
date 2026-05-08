import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import type { ChatMessage, ToolCall as ToolCallType } from '@/api/chat'
import { ToolCall, Streaming } from '@/components/agent-states'
import { MarkdownRenderer } from '@/components/MarkdownRenderer'

/** Formats a timestamp (ISO string or epoch ms) as HH:MM. */
export function timeFmt(ts?: string | number): string {
  if (!ts) return ''
  const d = typeof ts === 'number' ? new Date(ts) : new Date(ts)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
}

/** Heuristically derives a tool call's status from its result payload.
 *  Server doesn't include is_error in persisted history, so we sniff for
 *  shapes that smell like an error: nested `error` field, exception strings. */
function toolStatus(tc: ToolCallType & { done?: boolean }): 'running' | 'done' | 'error' {
  if (tc.done === false) return 'running'
  const r = tc.result
  if (r == null) return 'done'
  if (typeof r === 'string') {
    const trimmed = r.trim().toLowerCase()
    if (trimmed.startsWith('error') || trimmed.includes('exception') || trimmed.includes('traceback')) {
      return 'error'
    }
    return 'done'
  }
  if (typeof r === 'object') {
    const rec = r as Record<string, unknown>
    if ('error' in rec || rec.is_error === true || rec.success === false) return 'error'
  }
  return 'done'
}

/** Small button that copies the message body to clipboard, then briefly
 *  flips to a checkmark. Mirrors the behavior of the code-block copy button
 *  in MarkdownRenderer so the affordance feels consistent across the app.
 *
 *  The button stays in the layout (via opacity, not display) so the row
 *  doesn't reflow on hover. The parent message uses `group` so we can flip
 *  visibility on group-hover without JS state. */
function CopyMessageButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      className="ml-auto inline-flex items-center justify-center w-[22px] h-[22px] p-0 border-0 bg-transparent text-text-dim rounded-[5px] cursor-pointer opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-text-primary hover:bg-[rgb(0_0_0_/_0.05)] dark:hover:bg-[rgb(255_255_255_/_0.06)] transition-[opacity,color,background] duration-150 ease-ease-cubic"
      aria-label={copied ? 'Copied' : 'Copy message'}
      title={copied ? 'Copied' : 'Copy message'}
      onClick={(e) => {
        e.stopPropagation()
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 1600)
        })
      }}
    >
      {copied ? <Check size={12} strokeWidth={2} /> : <Copy size={12} strokeWidth={1.8} />}
    </button>
  )
}

const TIME_CLASSES = 'rd-mono font-mono text-[10px] text-text-dim tracking-[0.05em] px-1'

// Tailwind arbitrary descendant variants that recreate the legacy
// `.msg__prose` typography rules — code/pre/a/ul/ol — for the elements
// MarkdownRenderer emits with its own inline styles.
const ASSISTANT_PROSE_CLASSES =
  '[&_p]:my-0 [&_p]:mb-2.5 [&_p:last-child]:mb-0 ' +
  '[&_code]:font-mono [&_code]:text-[12.5px] [&_code]:px-[5px] [&_code]:py-px [&_code]:bg-bg-card [&_code]:border [&_code]:border-border-subtle [&_code]:rounded-[4px] ' +
  '[&_pre]:font-mono [&_pre]:text-[12.5px] [&_pre]:leading-[1.55] [&_pre]:px-3.5 [&_pre]:py-3 [&_pre]:bg-bg-card [&_pre]:border [&_pre]:border-border-strong [&_pre]:rounded-md [&_pre]:overflow-x-auto [&_pre]:my-1.5 [&_pre]:mb-3 ' +
  '[&_pre_code]:bg-transparent [&_pre_code]:border-0 [&_pre_code]:p-0 ' +
  '[&_a]:text-teal-400 [&_a]:no-underline [&_a]:border-b [&_a]:border-teal-line ' +
  '[&_ul]:my-0 [&_ul]:mb-2.5 [&_ul]:pl-5 [&_ol]:my-0 [&_ol]:mb-2.5 [&_ol]:pl-5'

// User bubble overrides MarkdownRenderer's teal-on-teal InlineCode so it
// stays readable against the teal-soft fill. `!` ensures we beat the
// inline styles MarkdownRenderer applies.
const USER_BUBBLE_PROSE_CLASSES =
  '[&>p:first-child]:mt-0 [&>p:last-child]:mb-0 ' +
  '[&_code]:bg-[rgb(255_255_255_/_0.08)] [&_code]:font-mono [&_code]:text-[12.5px] [&_code]:px-[5px] [&_code]:py-px [&_code]:rounded-[4px] ' +
  '[&_.prose-md_code]:!bg-[rgb(255_255_255_/_0.12)] [&_.prose-md_code]:!text-text-primary [&_.prose-md_code]:!border-[rgb(255_255_255_/_0.18)] ' +
  '[&_.prose-md>div]:!my-1.5'

/** Renders a single chat message bubble for both user and assistant roles. */
export function MessageBlock({ message, streaming }: { message: ChatMessage; streaming?: boolean }) {
  if (message.role === 'user') {
    return (
      <div className="flex flex-col items-end gap-1 font-sans">
        <div
          className={`max-w-[85%] text-sm leading-[1.55] text-text-primary bg-teal-soft border border-teal-line px-3.5 py-2.5 rounded-[14px_14px_4px_14px] ${USER_BUBBLE_PROSE_CLASSES}`}
        >
          <MarkdownRenderer>{message.content}</MarkdownRenderer>
        </div>
        <span className={TIME_CLASSES}>{timeFmt(message.timestamp)}</span>
      </div>
    )
  }

  // `group` lets the hover-revealed copy button toggle opacity from the
  // parent's hover state instead of needing JS focus tracking.
  return (
    <div className="group flex gap-3 font-sans items-start">
      <div className="flex-shrink-0 w-7 h-7 rounded-md bg-teal-400 text-bg-base flex items-center justify-center font-mono text-xs font-bold mt-0.5">
        R
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2.5 mb-1">
          <span className="font-mono text-[11px] tracking-[0.1em] lowercase text-text-muted">
            rushdino
          </span>
          <span className={TIME_CLASSES}>{timeFmt(message.timestamp)}</span>
          {!streaming && message.content && <CopyMessageButton text={message.content} />}
        </div>
        <div
          className={`text-text-primary text-sm leading-[1.65] ${ASSISTANT_PROSE_CLASSES}`}
        >
          {streaming && !message.content ? (
            <Streaming text="thinking" />
          ) : (
            <MarkdownRenderer>{message.content}</MarkdownRenderer>
          )}
        </div>
        {message.tool_calls && message.tool_calls.length > 0 && (
          <div className="mt-2.5 flex flex-col gap-1.5">
            {message.tool_calls.map((tc, i) => (
              <ToolCall
                key={tc.id ?? `tc-${i}`}
                name={tc.name ?? 'tool'}
                status={toolStatus(tc)}
                args={(tc.arguments as Record<string, unknown>) ?? {}}
                result={tc.result}
                defaultOpen={false}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
