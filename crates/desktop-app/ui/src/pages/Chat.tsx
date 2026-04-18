import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import {
  Plus,
  ShieldCheck,
  ChevronDown,
  PanelRight,
  Mic,
  ArrowUp,
} from 'lucide-react'

import {
  getConversation,
  listConversations,
  type ChatMessage,
  type ConversationDetail,
} from '@/api/chat'
import { listAgents } from '@/api/agents'
import { useChatStream, type PendingApproval, type StreamingTurn } from '@/hooks/useChatStream'
import { ToolCall, Streaming } from '@/components/agent-states'
import { AgentPanel } from '@/components/AgentPanel'
import { notifyIfBlurred } from '@/lib/notify'
import { useAttachments, formatAttachments, basename } from '@/hooks/useAttachments'
import { FileText, X as XIcon } from 'lucide-react'

export default function Chat() {
  const qc = useQueryClient()
  const { id: agentId } = useParams<{ id?: string }>()
  const agentList = useQuery({
    queryKey: ['agents'],
    queryFn: listAgents,
    staleTime: 30_000,
  })
  const activeAgent = agentId
    ? agentList.data?.find((a) => a.id === agentId)
    : undefined
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [composer, setComposer] = useState('')
  const [pending, setPending] = useState<ChatMessage[]>([])
  const [streaming, setStreaming] = useState<{ content: string } | null>(null)
  const [errorBanner, setErrorBanner] = useState<string | null>(null)
  const [approvals, setApprovals] = useState<PendingApproval[]>([])
  const scrollerRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)

  const conversations = useQuery({
    queryKey: ['conversations'],
    queryFn: listConversations,
    staleTime: 30_000,
  })

  useEffect(() => {
    if (conversationId === null && conversations.data && conversations.data.length > 0) {
      setConversationId(conversations.data[0]!.id)
    }
  }, [conversations.data, conversationId])

  const detail = useQuery<ConversationDetail | null>({
    queryKey: ['conversation', conversationId],
    queryFn: () => (conversationId ? getConversation(conversationId) : Promise.resolve(null)),
    enabled: true,
  })

  const onToken = useCallback((delta: string) => {
    setStreaming((prev) => ({ content: (prev?.content ?? '') + delta }))
  }, [])
  const onReset = useCallback(() => setStreaming(null), [])
  const onTurnEnd = useCallback(
    (turn: StreamingTurn) => {
      setStreaming(null)
      setPending([])
      qc.invalidateQueries({ queryKey: ['conversation', conversationId] })
      qc.invalidateQueries({ queryKey: ['conversations'] })
      /* Ping when the window isn't focused so async agents can finish in
         the background without stealing attention from foregrounded work. */
      const preview = turn.content.trim().slice(0, 160).replace(/\s+/g, ' ')
      if (preview) {
        notifyIfBlurred(activeAgent?.name || 'RushDino', preview)
      }
    },
    [qc, conversationId, activeAgent],
  )
  const onToolCall = useCallback(() => {}, [])
  const onError = useCallback((msg: string) => {
    setErrorBanner(msg)
    setStreaming(null)
    window.setTimeout(() => setErrorBanner(null), 6000)
  }, [])
  const onApprovalRequest = useCallback(
    (req: PendingApproval) => {
      setApprovals((prev) => {
        if (prev.some((p) => p.requestId === req.requestId)) return prev
        return [...prev, req]
      })
      /* Approval gates are interrupt-driven — notify when backgrounded. */
      notifyIfBlurred(
        `${activeAgent?.name || 'RushDino'} needs approval`,
        `Tool request: ${req.tool}`,
      )
    },
    [activeAgent],
  )
  const onApprovalResolved = useCallback((requestId: string) => {
    setApprovals((prev) => prev.filter((p) => p.requestId !== requestId))
  }, [])

  const stream = useChatStream({
    conversationId,
    setConversationId: (id) => setConversationId(id),
    onToken,
    onToolCall,
    onTurnEnd,
    onReset,
    onError,
    onApprovalRequest,
    onApprovalResolved,
  })

  const messages: ChatMessage[] = useMemo(() => {
    const base = [...(detail.data?.messages ?? []), ...pending]
    if (streaming) base.push({ role: 'assistant', content: streaming.content })
    return base
  }, [detail.data, pending, streaming])

  useEffect(() => {
    const el = scrollerRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages.length, streaming?.content])

  useEffect(() => {
    const ta = composerRef.current
    if (ta) {
      ta.style.height = 'auto'
      ta.style.height = Math.min(200, ta.scrollHeight) + 'px'
    }
  }, [composer])

  const attachments = useAttachments()

  function submit() {
    const text = composer.trim()
    if (!text && attachments.paths.length === 0) return
    const body = text + formatAttachments(attachments.paths)
    setPending((prev) => [...prev, { role: 'user', content: body }])
    setStreaming({ content: '' })
    setComposer('')
    attachments.clear()
    void stream.send(body)
  }

  const isStreaming = streaming !== null
  const title =
    activeAgent?.name ||
    detail.data?.title?.trim() ||
    'New chat'
  const [showPanel, setShowPanel] = useState(false)

  return (
    <div className="chat">
      <ChatTopbar
        title={title}
        running={isStreaming}
        showPanel={showPanel}
        onTogglePanel={() => setShowPanel((v) => !v)}
      />

      {errorBanner && <div className="chat-error">{errorBanner}</div>}

      <div className="chat-body">
        <div className="chat-main">
          <div className="chat-scroll" ref={scrollerRef}>
            <div className="chat-stream">
              {messages.length === 0 && !isStreaming && approvals.length === 0 && <EmptyChat />}
              {messages.map((m, i) => (
                <MessageBlock
                  key={m.id ?? `p-${i}`}
                  message={m}
                  streaming={i === messages.length - 1 && isStreaming && m.role === 'assistant'}
                />
              ))}
              {approvals.map((a) => (
                <InlineApproval
                  key={a.requestId}
                  approval={a}
                  onDecide={(approved) => {
                    stream.sendApproval(a.requestId, approved)
                    setApprovals((prev) => prev.filter((p) => p.requestId !== a.requestId))
                  }}
                />
              ))}
            </div>
          </div>

          <Composer
            value={composer}
            onChange={setComposer}
            onSubmit={submit}
            textareaRef={composerRef}
            disabled={isStreaming}
            attachments={attachments.paths}
            dragActive={attachments.dragActive}
            onPickFiles={() => void attachments.pick()}
            onRemoveAttachment={attachments.remove}
          />
        </div>

        <AgentPanel
          agentId={agentId}
          conversationId={conversationId}
          label={title}
          running={isStreaming}
          open={showPanel}
        />
      </div>
    </div>
  )
}

/* ───────── Topbar ──────────────────────────────────────── */
function ChatTopbar({
  title,
  running: _running,
  showPanel,
  onTogglePanel,
}: {
  title: string
  running: boolean
  showPanel: boolean
  onTogglePanel: () => void
}) {
  void _running
  return (
    <div className={`chat-topbar ${showPanel ? 'chat-topbar--panel-open' : ''}`} data-tauri-drag-region>
      <span className="chat-topbar__title-text">{title}</span>
      <div className="chat-topbar__spacer" />
      <div className="chat-topbar__actions" data-tauri-drag-region="false">
        <button
          type="button"
          className={`chat-topbar__panel-btn ${showPanel ? 'chat-topbar__panel-btn--active' : ''}`}
          aria-label="Toggle activity panel"
          onClick={onTogglePanel}
        >
          <PanelRight size={14} strokeWidth={1.7} />
        </button>
      </div>
    </div>
  )
}

/* ───────── Message stream ──────────────────────────────── */
function MessageBlock({ message, streaming }: { message: ChatMessage; streaming?: boolean }) {
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

function timeFmt(ts?: string | number): string {
  if (!ts) return ''
  const d = typeof ts === 'number' ? new Date(ts) : new Date(ts)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
}

function InlineApproval({
  approval,
  onDecide,
}: {
  approval: PendingApproval
  onDecide: (approved: boolean) => void
}) {
  return (
    <div className="msg msg--approval">
      <div className="approval-card">
        <div className="approval-card__head">
          <span className="approval-card__label">APPROVAL NEEDED</span>
          <span className="approval-card__tool rd-mono">{approval.tool}</span>
        </div>
        <p className="approval-card__prompt">
          The agent wants to run <code>{approval.tool}</code> with these arguments.
        </p>
        <pre className="approval-card__args rd-mono">{JSON.stringify(approval.args, null, 2)}</pre>
        <div className="approval-card__actions">
          <button type="button" className="btn" onClick={() => onDecide(false)}>
            Deny
          </button>
          <button type="button" className="btn btn--primary" onClick={() => onDecide(true)}>
            Approve
          </button>
        </div>
      </div>
    </div>
  )
}

function EmptyChat() {
  return (
    <div className="chat-empty">
      <div className="chat-empty__eyebrow">FRESH SESSION</div>
      <h2 className="chat-empty__title">Run AI everywhere. Own your data.</h2>
      <p className="chat-empty__lede">
        RushDino runs locally on your machine. Start with a question, a task, or a paste of code —
        tool output streams into the same thread.
      </p>
    </div>
  )
}

/* ───────── Composer ────────────────────────────────────── */
function Composer({
  value,
  onChange,
  onSubmit,
  textareaRef,
  disabled,
  attachments,
  dragActive,
  onPickFiles,
  onRemoveAttachment,
}: {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  textareaRef: React.RefObject<HTMLTextAreaElement>
  disabled?: boolean
  attachments: string[]
  dragActive: boolean
  onPickFiles: () => void
  onRemoveAttachment: (path: string) => void
}) {
  return (
    <form
      className={`composer ${dragActive ? 'composer--drop' : ''}`}
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit()
      }}
    >
      <div className="composer__wrap">
        {attachments.length > 0 && (
          <ul className="composer__attachments">
            {attachments.map((p) => (
              <li key={p} className="composer-attach">
                <FileText size={11} strokeWidth={1.7} className="composer-attach__icon" />
                <span className="composer-attach__name" title={p}>
                  {basename(p)}
                </span>
                <button
                  type="button"
                  className="composer-attach__remove"
                  onClick={() => onRemoveAttachment(p)}
                  aria-label={`Remove ${basename(p)}`}
                >
                  <XIcon size={10} strokeWidth={1.8} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <textarea
          ref={textareaRef}
          className="composer__input"
          placeholder={dragActive ? 'Drop files to attach…' : 'Message rushdino'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault()
              onSubmit()
            } else if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              onSubmit()
            }
          }}
          rows={3}
        />
        <div className="composer__actions">
          <button
            type="button"
            className="composer__icon"
            aria-label="Attach files"
            onClick={onPickFiles}
            title="Attach files (⌘⇧F)"
          >
            <Plus size={15} strokeWidth={1.8} />
          </button>
          <button type="button" className="composer__pill" aria-label="Permissions">
            <ShieldCheck size={13} strokeWidth={1.7} />
            <span>Default permissions</span>
            <ChevronDown size={10} strokeWidth={2} />
          </button>
          <div className="composer__spacer" />
          <button type="button" className="composer__pill" aria-label="Model">
            <span>GLM-5-Turbo</span>
            <ChevronDown size={10} strokeWidth={2} />
          </button>
          <button type="button" className="composer__pill" aria-label="Effort">
            <span>Medium</span>
            <ChevronDown size={10} strokeWidth={2} />
          </button>
          <button type="button" className="composer__icon" aria-label="Voice">
            <Mic size={14} strokeWidth={1.7} />
          </button>
          <button
            type="submit"
            className="composer__send"
            disabled={disabled}
            aria-label="Send message"
          >
            <ArrowUp size={15} strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </form>
  )
}
