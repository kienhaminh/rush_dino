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

  useEffect(() => {
    if (requestedConversationId) {
      // URL param wins
      if (requestedConversationId !== conversationId) {
        setConversationId(requestedConversationId)
      }
      return
    }
    // Fallback: auto-select first conversation when nothing is selected
    if (conversationId === null && conversations.data && conversations.data.length > 0) {
      setConversationId(conversations.data[0]!.id)
    }
  }, [requestedConversationId, conversationId, conversations.data])

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
