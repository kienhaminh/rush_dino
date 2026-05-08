import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams, useSearchParams } from 'react-router-dom'

import {
  getConversation,
  listConversations,
  type ChatMessage,
  type ConversationDetail,
  type PendingInputRequest,
  type ToolCall,
} from '@/api/chat'
import { listAgents } from '@/api/agents'
import { getConfig } from '@/api/config'
import { listProfiles } from '@/api/providers'
import { getSystemSummary, type ThinkingLevel } from '@/api/system'
import { useChatStream, type PendingApproval, type StreamingTurn } from '@/hooks/useChatStream'
import { AgentPanel } from '@/components/AgentPanel'
import { notifyIfBlurred } from '@/lib/notify'
import { useAttachments, formatAttachments } from '@/hooks/useAttachments'

import { mergeInputRequests } from './chat/merge-input-requests'
import { EmptyChat } from './chat/empty-chat'
import { MessageBlock } from './chat/message-block'
import { InlineApproval } from './chat/inline-approval'
import { InlineInputRequest } from './chat/inline-input-request'
import { Composer } from './chat/chat-composer'
import { ChatTopbar } from './chat/chat-topbar'

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
  const [liveToolCalls, setLiveToolCalls] = useState<Array<ToolCall & { done: boolean }>>([])
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
  /* Captured ONCE per mount-with-?new=1 so subsequent renders (after we strip
     the sentinel) still know to skip the auto-select-first-conversation
     fallback. Without this ref the param removal would race the next render. */
  const newChatIntentRef = useRef(searchParams.has('new'))

  useEffect(() => {
    if (requestedConversationId) {
      // URL param wins
      if (requestedConversationId !== conversationId) {
        setConversationId(requestedConversationId)
      }
      newChatIntentRef.current = false
      return
    }
    /* Explicit "new chat" intent: clear selection and strip the marker so a
       refresh doesn't keep forcing empty state. The ref keeps us in this
       branch until the user actually sends a message (which sets a
       conversationId via the WS chat_chunk handler). */
    if (newChatIntentRef.current) {
      if (conversationId !== null) setConversationId(null)
      if (searchParams.has('new')) {
        const next = new URLSearchParams(searchParams)
        next.delete('new')
        setSearchParams(next, { replace: true })
      }
      return
    }
    // Fallback: auto-select first conversation when nothing is selected
    if (conversationId === null && conversations.data && conversations.data.length > 0) {
      setConversationId(conversations.data[0]!.id)
    }
  }, [
    requestedConversationId,
    conversationId,
    conversations.data,
    searchParams,
    setSearchParams,
  ])

  /* Once a real conversation lands (server assigns id mid-stream, or user
     navigates), drop the new-chat lock. */
  useEffect(() => {
    if (conversationId !== null) newChatIntentRef.current = false
  }, [conversationId])

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
  const onReset = useCallback(() => {
    setStreaming(null)
    setLiveToolCalls([])
  }, [])
  const onTurnEnd = useCallback(
    (turn: StreamingTurn) => {
      setStreaming(null)
      setLiveToolCalls([])
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
  const onToolCall = useCallback((tc: ToolCall & { done: boolean }) => {
    setLiveToolCalls((prev) => {
      if (!tc.done) return [...prev, tc]
      // mark the last matching in-progress call as done
      const idx = [...prev].reverse().findIndex((t) => t.name === tc.name && !t.done)
      if (idx === -1) return [...prev, tc]
      const real = prev.length - 1 - idx
      return prev.map((t, i) => (i === real ? { ...t, ...tc } : t))
    })
  }, [])
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
    setLiveToolCalls([])
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
    if (streaming || liveToolCalls.length > 0) {
      base.push({
        role: 'assistant',
        content: streaming?.content ?? '',
        tool_calls: liveToolCalls,
      })
    }
    return base
  }, [detail.data, pending, streaming, liveToolCalls])

  /* Esc while streaming = stop. The handler reads `streaming` via a ref so
     the listener doesn't rebind on every token (setStreaming returns a new
     object reference for every chunk). */
  const isStreamingRef = useRef(false)
  useEffect(() => {
    isStreamingRef.current = streaming !== null
  }, [streaming])
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      if (!isStreamingRef.current) return
      e.preventDefault()
      void stream.stop()
      setPending([])
      qc.invalidateQueries({ queryKey: ['conversation', conversationId] })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [stream, qc, conversationId])

  /* Smart auto-scroll: only follow new content if the user is already near
     the bottom. Reading older context shouldn't yank you down on every token. */
  const [nearBottom, setNearBottom] = useState(true)
  /* Reset to "near bottom" whenever the user switches conversations so the
     new thread starts pinned, not stuck where the old scroll position was. */
  useEffect(() => {
    setNearBottom(true)
  }, [conversationId])
  const handleScroll = useCallback(() => {
    const el = scrollerRef.current
    if (!el) return
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight
    setNearBottom(distance < 120)
  }, [])
  useEffect(() => {
    if (!nearBottom) return
    const el = scrollerRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages.length, streaming?.content, nearBottom])

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
    <div className="flex flex-col flex-1 min-h-0 bg-bg-main">
      <ChatTopbar
        title={title}
        running={isStreaming}
        showPanel={showPanel}
        onTogglePanel={() => setShowPanel((v) => !v)}
      />

      {errorBanner && (
        <div className="max-w-[820px] mx-auto mt-4 px-3.5 py-2.5 bg-[rgb(248_113_113_/_0.08)] border border-[rgb(248_113_113_/_0.4)] text-error rounded-md font-mono text-xs">
          {errorBanner}
        </div>
      )}

      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* `relative` anchors the absolutely-positioned "Jump to latest" pill */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden relative">
          <div
            className="flex-1 min-h-0 overflow-y-auto pt-6 pb-7"
            ref={scrollerRef}
            onScroll={handleScroll}
          >
            <div className="max-w-[820px] mx-auto px-7 flex flex-col gap-5">
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

          {!nearBottom && (
            // pointer-events-none on the wrapper so the surrounding gap above
            // the composer doesn't intercept clicks; the button re-enables them.
            <div className="flex justify-center px-3 pt-1.5 flex-shrink-0 pointer-events-none">
              <button
                type="button"
                className="pointer-events-auto py-1.5 px-3.5 bg-bg-card border border-border-strong rounded-full text-text-secondary font-sans text-[11px] font-medium tracking-[0.02em] cursor-pointer shadow-[0_4px_14px_rgb(0_0_0_/_0.18)] transition-[color,border-color,background] duration-150 ease-ease-cubic hover:text-teal-300 hover:border-teal-line hover:bg-teal-soft"
                onClick={() => {
                  const el = scrollerRef.current
                  if (el) el.scrollTop = el.scrollHeight
                  setNearBottom(true)
                }}
                aria-label="Jump to latest message"
              >
                ↓ Jump to latest
              </button>
            </div>
          )}
          <Composer
            value={composer}
            onChange={setComposer}
            onSubmit={submit}
            onStop={() => {
              void stream.stop()
              /* The user pressed stop — drop optimistic pending and reload
                 history so any partially-persisted state is reconciled. */
              setPending([])
              qc.invalidateQueries({ queryKey: ['conversation', conversationId] })
            }}
            textareaRef={composerRef}
            streaming={isStreaming}
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
