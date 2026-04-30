import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ChatMessage } from '@/api/chat'
import { ToolCall, Streaming } from '@/components/agent-states'

/** Formats a timestamp (ISO string or epoch ms) as HH:MM. */
export function timeFmt(ts?: string | number): string {
  if (!ts) return ''
  const d = typeof ts === 'number' ? new Date(ts) : new Date(ts)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
}

/** Renders a single chat message bubble for both user and assistant roles. */
export function MessageBlock({ message, streaming }: { message: ChatMessage; streaming?: boolean }) {
  if (message.role === 'user') {
    return (
      <div className="msg msg--user">
        <div className="bubble bubble--user">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
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
        </div>
        <div className="msg__prose">
          {streaming && !message.content ? (
            <Streaming text="thinking" />
          ) : (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
          )}
        </div>
        {message.tool_calls && message.tool_calls.length > 0 && (
          <div className="msg__tools">
            {message.tool_calls.map((tc, i) => (
              <ToolCall
                key={tc.id ?? `tc-${i}`}
                name={tc.name ?? 'tool'}
                status="done"
                args={(tc.arguments as Record<string, unknown>) ?? {}}
                defaultOpen={false}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
