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
 *  in MarkdownRenderer so the affordance feels consistent across the app. */
function CopyMessageButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      className="msg__copy"
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

/** Renders a single chat message bubble for both user and assistant roles. */
export function MessageBlock({ message, streaming }: { message: ChatMessage; streaming?: boolean }) {
  if (message.role === 'user') {
    return (
      <div className="msg msg--user">
        <div className="bubble bubble--user">
          <MarkdownRenderer>{message.content}</MarkdownRenderer>
        </div>
        <span className="msg__time rd-mono">{timeFmt(message.timestamp)}</span>
      </div>
    )
  }

  return (
    <div className="msg msg--assistant">
      <div className="msg__avatar">R</div>
      <div className="msg__body">
        <div className="msg__head">
          <span className="msg__role">rushdino</span>
          <span className="msg__time rd-mono">{timeFmt(message.timestamp)}</span>
          {!streaming && message.content && <CopyMessageButton text={message.content} />}
        </div>
        <div className="msg__prose">
          {streaming && !message.content ? (
            <Streaming text="thinking" />
          ) : (
            <MarkdownRenderer>{message.content}</MarkdownRenderer>
          )}
        </div>
        {message.tool_calls && message.tool_calls.length > 0 && (
          <div className="msg__tools">
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
