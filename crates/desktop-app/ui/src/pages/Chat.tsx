import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams, useSearchParams } from 'react-router-dom'
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
  resolveInputRequest,
  type ChatMessage,
  type ConversationDetail,
  type InputFieldSpec,
  type PendingInputRequest,
} from '@/api/chat'
import { listAgents } from '@/api/agents'
import { getConfig } from '@/api/config'
import { listProfiles, type ProviderProfile } from '@/api/providers'
import { getSystemSummary, type ThinkingLevel } from '@/api/system'
import { useChatStream, type PendingApproval, type StreamingTurn } from '@/hooks/useChatStream'
import { ToolCall, Streaming } from '@/components/agent-states'
import { AgentPanel } from '@/components/AgentPanel'
import { notifyIfBlurred } from '@/lib/notify'
import { useAttachments, formatAttachments, basename } from '@/hooks/useAttachments'
import { FileText, X as XIcon } from 'lucide-react'

export default function Chat() {
  const qc = useQueryClient()
  const { id: agentId } = useParams<{ id?: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
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
  const [inputRequests, setInputRequests] = useState<PendingInputRequest[]>([])
  const [selectedProfileId, setSelectedProfileId] = useState('')
  const [thinkingMode, setThinkingMode] = useState<ThinkingLevel>('medium')
  const scrollerRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const profileHydratedRef = useRef(false)
  const thinkingHydratedRef = useRef(false)

  const conversations = useQuery({
    queryKey: ['conversations'],
    queryFn: listConversations,
    staleTime: 30_000,
  })
  const requestedConversationId = searchParams.get('conversation')

  useEffect(() => {
    if (requestedConversationId && requestedConversationId !== conversationId) {
      setConversationId(requestedConversationId)
    }
  }, [requestedConversationId, conversationId])

  useEffect(() => {
    if (
      !requestedConversationId &&
      conversationId === null &&
      conversations.data &&
      conversations.data.length > 0
    ) {
      setConversationId(conversations.data[0]!.id)
    }
  }, [conversations.data, conversationId, requestedConversationId])

  useEffect(() => {
    if (agentId || !conversationId || requestedConversationId === conversationId) {
      return
    }
    const next = new URLSearchParams(searchParams)
    next.set('conversation', conversationId)
    setSearchParams(next, { replace: true })
  }, [
    agentId,
    conversationId,
    requestedConversationId,
    searchParams,
    setSearchParams,
  ])

  const detail = useQuery<ConversationDetail | null>({
    queryKey: ['conversation', conversationId],
    queryFn: () => (conversationId ? getConversation(conversationId) : Promise.resolve(null)),
    enabled: true,
  })
  const configQ = useQuery({
    queryKey: ['config'],
    queryFn: getConfig,
    staleTime: 30_000,
  })
  const profilesQ = useQuery({
    queryKey: ['profiles'],
    queryFn: listProfiles,
    staleTime: 30_000,
  })
  const summaryQ = useQuery({
    queryKey: ['system-summary'],
    queryFn: getSystemSummary,
    staleTime: 10_000,
  })

  useEffect(() => {
    const configured =
      typeof configQ.data?.default_profile_id === 'string' ? configQ.data.default_profile_id : null
    const effective =
      typeof summaryQ.data?.effectiveProfileId === 'string'
        ? summaryQ.data.effectiveProfileId
        : null
    const fallback = profilesQ.data?.[0]?.id ?? ''
    const nextProfileId = effective ?? configured ?? fallback
    if (!profileHydratedRef.current && nextProfileId) {
      setSelectedProfileId(nextProfileId)
      profileHydratedRef.current = true
      return
    }
    if (profilesQ.data && selectedProfileId && !profilesQ.data.some((profile) => profile.id === selectedProfileId)) {
      setSelectedProfileId(nextProfileId)
    }
  }, [
    configQ.data?.default_profile_id,
    profilesQ.data,
    selectedProfileId,
    summaryQ.data?.effectiveProfileId,
  ])

  useEffect(() => {
    const runtimeThinking = summaryQ.data?.agentConfig?.thinkingLevel
    if (!thinkingHydratedRef.current && runtimeThinking) {
      setThinkingMode(runtimeThinking)
      thinkingHydratedRef.current = true
    }
  }, [summaryQ.data?.agentConfig?.thinkingLevel])

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
  const onInputRequest = useCallback(
    (req: PendingInputRequest) => {
      setInputRequests((prev) => mergeInputRequests(prev, [req]))
      notifyIfBlurred(
        `${activeAgent?.name || 'RushDino'} needs input`,
        req.payload.spec.title,
      )
    },
    [activeAgent],
  )
  const onSessionReset = useCallback(() => {
    setStreaming(null)
    setPending([])
    setApprovals([])
    setInputRequests([])
    qc.invalidateQueries({ queryKey: ['conversation', conversationId] })
    qc.invalidateQueries({ queryKey: ['conversations'] })
  }, [qc, conversationId])

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
    onInputRequest,
    onSessionReset,
  })

  useEffect(() => {
    setInputRequests((prev) => mergeInputRequests(prev, detail.data?.pendingInputRequests ?? []))
  }, [detail.data?.pendingInputRequests])

  const visibleInputRequests = useMemo(
    () =>
      inputRequests.filter(
        (request) => !conversationId || request.conversationId === conversationId,
      ),
    [inputRequests, conversationId],
  )

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
    if (streaming !== null) {
      return
    }
    const text = composer.trim()
    if (!text && attachments.paths.length === 0) return
    const body = text + formatAttachments(attachments.paths)
    setPending((prev) => [...prev, { role: 'user', content: body }])
    setStreaming({ content: '' })
    setComposer('')
    attachments.clear()
    void stream.send(body, {
      profileId: selectedProfileId || undefined,
      thinkingMode,
    })
  }

  const isStreaming = streaming !== null
  const title =
    activeAgent?.name ||
    detail.data?.title?.trim() ||
    'New chat'
  const [showPanel, setShowPanel] = useState(false)
  const profiles = profilesQ.data ?? []
  const activeProfile =
    profiles.find((profile) => profile.id === selectedProfileId) ?? profiles[0] ?? null

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
              {messages.length === 0 &&
                !isStreaming &&
                approvals.length === 0 &&
                visibleInputRequests.length === 0 && <EmptyChat />}
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
              {visibleInputRequests.map((req) => (
                <InlineInputRequest
                  key={req.requestId}
                  request={req}
                  onError={onError}
                  onResolved={(requestId) => {
                    setInputRequests((prev) => prev.filter((item) => item.requestId !== requestId))
                    qc.invalidateQueries({ queryKey: ['conversation', conversationId] })
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
            activeProfile={activeProfile}
            profiles={profiles}
            selectedProfileId={selectedProfileId}
            thinkingMode={thinkingMode}
            onSelectProfile={(profileId) => {
              setSelectedProfileId(profileId)
            }}
            onSelectThinkingMode={(level) => {
              setThinkingMode(level)
            }}
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

function InlineInputRequest({
  request,
  onResolved,
  onError,
}: {
  request: PendingInputRequest
  onResolved: (requestId: string) => void
  onError: (message: string) => void
}) {
  const spec = request.payload.spec
  const [values, setValues] = useState<Record<string, unknown>>(() =>
    createInitialInputValues(spec.fields),
  )
  const [busy, setBusy] = useState<'submitted' | 'cancelled' | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    setValues(createInitialInputValues(spec.fields))
    setBusy(null)
    setFormError(null)
  }, [request.requestId, spec.fields])

  const handleSubmit = async (status: 'submitted' | 'cancelled') => {
    setFormError(null)
    setBusy(status)
    try {
      const payload =
        status === 'submitted' ? buildInputRequestSubmission(spec.fields, values) : undefined
      await resolveInputRequest(request.requestId, status, payload)
      onResolved(request.requestId)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to resolve input request'
      setFormError(message)
      onError(message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="msg msg--approval">
      <div className="approval-card approval-card--input">
        <div className="approval-card__head">
          <span className="approval-card__label">INPUT NEEDED</span>
          <span className="approval-card__tool rd-mono">{spec.kind}</span>
        </div>
        <div className="approval-card__content">
          <strong className="approval-card__title">{spec.title}</strong>
          {spec.description && <p className="approval-card__prompt">{spec.description}</p>}
        </div>
        <div className="approval-form">
          {spec.fields.map((field) => (
            <label key={field.name} className="approval-form__field">
              <span className="approval-form__label">
                {field.label}
                {field.required ? ' *' : ''}
              </span>
              {field.description && (
                <span className="approval-form__hint">{field.description}</span>
              )}
              <InputFieldControl
                field={field}
                value={values[field.name]}
                disabled={busy !== null}
                onChange={(nextValue) =>
                  setValues((prev) => ({
                    ...prev,
                    [field.name]: nextValue,
                  }))
                }
              />
            </label>
          ))}
        </div>
        {formError && <div className="chat-error-banner rd-mono">{formError}</div>}
        <div className="approval-card__actions">
          <button
            type="button"
            className="btn"
            disabled={busy !== null}
            onClick={() => void handleSubmit('cancelled')}
          >
            {busy === 'cancelled' ? 'Cancelling…' : spec.cancelLabel ?? 'Cancel'}
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={busy !== null}
            onClick={() => void handleSubmit('submitted')}
          >
            {busy === 'submitted' ? 'Submitting…' : spec.submitLabel ?? 'Submit'}
          </button>
        </div>
      </div>
    </div>
  )
}

function InputFieldControl({
  field,
  value,
  disabled,
  onChange,
}: {
  field: InputFieldSpec
  value: unknown
  disabled?: boolean
  onChange: (nextValue: unknown) => void
}) {
  switch (field.type) {
    case 'textarea':
      return (
        <textarea
          className="approval-form__control approval-form__control--textarea"
          value={typeof value === 'string' ? value : ''}
          placeholder={field.placeholder}
          minLength={field.minLength}
          maxLength={field.maxLength}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          rows={4}
        />
      )
    case 'select':
      return (
        <select
          className="approval-form__control"
          value={typeof value === 'string' ? value : ''}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        >
          {!field.required && <option value="">Select an option</option>}
          {(field.options ?? []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )
    case 'multiselect': {
      const selected = Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
      return (
        <div className="approval-form__choices">
          {(field.options ?? []).map((option) => {
            const checked = selected.includes(option.value)
            return (
              <label key={option.value} className="approval-form__choice">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={disabled}
                  onChange={(event) => {
                    const next = event.target.checked
                      ? [...selected, option.value]
                      : selected.filter((item) => item !== option.value)
                    onChange(next)
                  }}
                />
                <span>{option.label}</span>
              </label>
            )
          })}
        </div>
      )
    }
    case 'boolean':
      return (
        <label className="approval-form__choice approval-form__choice--single">
          <input
            type="checkbox"
            checked={Boolean(value)}
            disabled={disabled}
            onChange={(event) => onChange(event.target.checked)}
          />
          <span>{field.placeholder ?? 'Enabled'}</span>
        </label>
      )
    case 'number':
      return (
        <input
          className="approval-form__control"
          type="number"
          value={typeof value === 'number' ? String(value) : typeof value === 'string' ? value : ''}
          placeholder={field.placeholder}
          min={field.min}
          max={field.max}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        />
      )
    case 'text':
    default:
      return (
        <input
          className="approval-form__control"
          type={field.secret ? 'password' : 'text'}
          value={typeof value === 'string' ? value : ''}
          placeholder={field.placeholder}
          minLength={field.minLength}
          maxLength={field.maxLength}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        />
      )
  }
}

function mergeInputRequests(
  current: PendingInputRequest[],
  incoming: PendingInputRequest[],
): PendingInputRequest[] {
  const byId = new Map<string, PendingInputRequest>()
  for (const request of current) byId.set(request.requestId, request)
  for (const request of incoming) byId.set(request.requestId, request)
  return [...byId.values()].sort((left, right) => left.createdAt.localeCompare(right.createdAt))
}

function createInitialInputValues(fields: InputFieldSpec[]): Record<string, unknown> {
  return Object.fromEntries(
    fields.map((field) => {
      const raw = field.defaultValue
      switch (field.type) {
        case 'multiselect':
          return [field.name, Array.isArray(raw) ? raw.filter((item) => typeof item === 'string') : []]
        case 'boolean':
          return [field.name, typeof raw === 'boolean' ? raw : false]
        case 'number':
          return [field.name, typeof raw === 'number' || typeof raw === 'string' ? raw : '']
        default:
          return [field.name, typeof raw === 'string' ? raw : '']
      }
    }),
  )
}

function buildInputRequestSubmission(
  fields: InputFieldSpec[],
  values: Record<string, unknown>,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {}

  for (const field of fields) {
    const raw = values[field.name]

    if (field.type === 'boolean') {
      payload[field.name] = Boolean(raw)
      continue
    }

    if (field.type === 'multiselect') {
      const selected = Array.isArray(raw) ? raw.filter((item): item is string => typeof item === 'string') : []
      if (field.required && selected.length === 0) {
        throw new Error(`${field.label} is required`)
      }
      if (selected.length > 0) payload[field.name] = selected
      continue
    }

    if (field.type === 'number') {
      const value = typeof raw === 'number' ? String(raw) : typeof raw === 'string' ? raw.trim() : ''
      if (!value) {
        if (field.required) throw new Error(`${field.label} is required`)
        continue
      }
      const numeric = Number(value)
      if (Number.isNaN(numeric)) throw new Error(`${field.label} must be a number`)
      if (field.min !== undefined && numeric < field.min) {
        throw new Error(`${field.label} must be at least ${field.min}`)
      }
      if (field.max !== undefined && numeric > field.max) {
        throw new Error(`${field.label} must be at most ${field.max}`)
      }
      payload[field.name] = numeric
      continue
    }

    const value = typeof raw === 'string' ? raw.trim() : ''
    if (!value) {
      if (field.required) throw new Error(`${field.label} is required`)
      continue
    }
    if (field.minLength !== undefined && value.length < field.minLength) {
      throw new Error(`${field.label} must be at least ${field.minLength} characters`)
    }
    if (field.maxLength !== undefined && value.length > field.maxLength) {
      throw new Error(`${field.label} must be at most ${field.maxLength} characters`)
    }
    payload[field.name] = value
  }

  return payload
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
  activeProfile,
  profiles,
  selectedProfileId,
  thinkingMode,
  onSelectProfile,
  onSelectThinkingMode,
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
  activeProfile: ProviderProfile | null
  profiles: ProviderProfile[]
  selectedProfileId: string
  thinkingMode: ThinkingLevel
  onSelectProfile: (profileId: string) => void
  onSelectThinkingMode: (level: ThinkingLevel) => void
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
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (disabled) return
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
            disabled={disabled}
          >
            <Plus size={15} strokeWidth={1.8} />
          </button>
          <button type="button" className="composer__pill" aria-label="Permissions" disabled={disabled}>
            <ShieldCheck size={13} strokeWidth={1.7} />
            <span>Default permissions</span>
            <ChevronDown size={10} strokeWidth={2} />
          </button>
          <div className="composer__spacer" />
          <label className="composer__control" aria-label="Model profile">
            <span className="composer__control-label">Model</span>
            <select
              className="composer__select"
              value={selectedProfileId}
              disabled={disabled || profiles.length === 0}
              onChange={(event) => onSelectProfile(event.target.value)}
            >
              {profiles.length === 0 ? (
                <option value="">No profile configured</option>
              ) : (
                profiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profileLabel(profile)}
                  </option>
                ))
              )}
            </select>
            {activeProfile && (
              <span className="composer__control-meta">{activeProfile.default_model}</span>
            )}
          </label>
          <label className="composer__control" aria-label="Thinking mode">
            <span className="composer__control-label">Thinking</span>
            <select
              className="composer__select"
              value={thinkingMode}
              disabled={disabled}
              onChange={(event) => onSelectThinkingMode(event.target.value as ThinkingLevel)}
            >
              {THINKING_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="composer__icon" aria-label="Voice" disabled={disabled}>
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

const THINKING_OPTIONS: Array<{ value: ThinkingLevel; label: string }> = [
  { value: 'off', label: 'Off' },
  { value: 'minimal', label: 'Minimal' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'xhigh', label: 'XHigh' },
  { value: 'adaptive', label: 'Adaptive' },
]

function profileLabel(profile: ProviderProfile): string {
  const provider = profile.provider_kind.toLowerCase()
  return `${profile.name} · ${provider}`
}
