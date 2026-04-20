import { useCallback, useEffect, useRef, useState } from 'react'
import { wsOrigin } from '@/api/bootstrap'
import type { PendingInputRequest as ChatInputRequest, ToolCall } from '@/api/chat'
import type { ThinkingLevel } from '@/api/system'

type StreamState =
  | { phase: 'idle' }
  | { phase: 'connecting' }
  | { phase: 'streaming'; conversationId: string | null }
  | { phase: 'error'; error: string }

type StreamingTurn = {
  role: 'assistant'
  content: string
  tool_calls: ToolCall[]
}

export type PendingApproval = {
  requestId: string
  runId?: string | null
  conversationId?: string | null
  tool: string
  args: unknown
}

export type PendingInputRequest = ChatInputRequest

/**
 * Streams chat messages over /api/ws/chat. One long-lived WebSocket per
 * component lifetime. Callers plug in per-event callbacks and call
 * `.send(text)` to kick off a turn or `.sendApproval(id, approved)` to
 * resolve an inline approval gate.
 */
export function useChatStream(opts: {
  conversationId: string | null
  setConversationId: (id: string) => void
  onToken: (delta: string) => void
  onToolCall: (tc: ToolCall & { done: boolean }) => void
  onTurnEnd: (turn: StreamingTurn) => void
  onReset: () => void
  onError: (message: string) => void
  onApprovalRequest: (req: PendingApproval) => void
  onApprovalResolved: (requestId: string, approved: boolean) => void
  onInputRequest: (req: PendingInputRequest) => void
  onSessionReset?: () => void
}) {
  const {
    conversationId,
    setConversationId,
    onToken,
    onToolCall,
    onTurnEnd,
    onReset,
    onError,
    onApprovalRequest,
    onApprovalResolved,
    onInputRequest,
    onSessionReset,
  } = opts

  const [state, setState] = useState<StreamState>({ phase: 'idle' })
  const socketRef = useRef<WebSocket | null>(null)
  const buffer = useRef<StreamingTurn>({ role: 'assistant', content: '', tool_calls: [] })

  const handlers = useRef({
    onToken,
    onToolCall,
    onTurnEnd,
    onReset,
    onError,
    onApprovalRequest,
    onApprovalResolved,
    onInputRequest,
    onSessionReset,
    setConversationId,
  })
  useEffect(() => {
    handlers.current = {
      onToken,
      onToolCall,
      onTurnEnd,
      onReset,
      onError,
      onApprovalRequest,
      onApprovalResolved,
      onInputRequest,
      onSessionReset,
      setConversationId,
    }
  }, [
    onToken,
    onToolCall,
    onTurnEnd,
    onReset,
    onError,
    onApprovalRequest,
    onApprovalResolved,
    onInputRequest,
    onSessionReset,
    setConversationId,
  ])

  const connect = useCallback(async () => {
    if (socketRef.current && socketRef.current.readyState <= WebSocket.OPEN) return
    setState({ phase: 'connecting' })
    const origin = await wsOrigin()
    const sock = new WebSocket(`${origin}/api/ws/chat`)
    socketRef.current = sock

    sock.addEventListener('open', () => {
      setState({ phase: 'streaming', conversationId })
    })

    sock.addEventListener('error', () => {
      handlers.current.onError('websocket error')
      setState({ phase: 'error', error: 'connection failed' })
    })

    sock.addEventListener('close', () => {
      socketRef.current = null
      setState({ phase: 'idle' })
    })

    sock.addEventListener('message', (ev) => {
      let payload: Record<string, unknown>
      try {
        payload = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data))
      } catch {
        return
      }
      const type = payload.type as string | undefined
      switch (type) {
        case 'chat_chunk': {
          const delta = (payload.delta as string) ?? ''
          if (delta) {
            buffer.current.content += delta
            handlers.current.onToken(delta)
          }
          const convId = payload.conversation_id as string | undefined
          if (convId) handlers.current.setConversationId(convId)
          if (payload.done) {
            const finalTurn = { ...buffer.current }
            buffer.current = { role: 'assistant', content: '', tool_calls: [] }
            handlers.current.onTurnEnd(finalTurn)
          }
          break
        }
        case 'assistant_reset': {
          buffer.current = { role: 'assistant', content: '', tool_calls: [] }
          handlers.current.onReset()
          break
        }
        case 'tool_start': {
          const tc: ToolCall & { done: boolean } = {
            name: payload.tool_name as string,
            arguments: payload.args,
            done: false,
          }
          buffer.current.tool_calls.push(tc)
          handlers.current.onToolCall(tc)
          break
        }
        case 'tool_end': {
          const tc: ToolCall & { done: boolean } = {
            name: payload.tool_name as string,
            result: payload.result,
            done: true,
          }
          buffer.current.tool_calls.push(tc)
          handlers.current.onToolCall(tc)
          break
        }
        case 'assistant_message': {
          const content = (payload.content as string) ?? buffer.current.content
          const turn: StreamingTurn = {
            role: 'assistant',
            content,
            tool_calls: buffer.current.tool_calls,
          }
          buffer.current = { role: 'assistant', content: '', tool_calls: [] }
          handlers.current.onTurnEnd(turn)
          break
        }
        case 'error': {
          handlers.current.onError((payload.message as string) ?? 'unknown error')
          break
        }
        case 'approval_request': {
          handlers.current.onApprovalRequest({
            requestId: payload.request_id as string,
            runId: (payload.run_id as string | null | undefined) ?? null,
            conversationId: (payload.conversation_id as string | null | undefined) ?? null,
            tool: payload.tool as string,
            args: payload.args,
          })
          break
        }
        case 'approval_result': {
          handlers.current.onApprovalResolved(
            payload.request_id as string,
            Boolean(payload.approved),
          )
          break
        }
        case 'input_request': {
          const convId = payload.conversation_id as string | undefined
          if (convId) handlers.current.setConversationId(convId)
          handlers.current.onInputRequest({
            requestId: payload.request_id as string,
            sessionId: (payload.session_id as string | undefined) ?? '',
            conversationId: (payload.conversation_id as string | undefined) ?? '',
            runId: payload.run_id as string | undefined,
            payload: payload.payload as PendingInputRequest['payload'],
            createdAt:
              (payload.created_at as string | undefined) ?? new Date().toISOString(),
          })
          break
        }
        case 'session_reset': {
          buffer.current = { role: 'assistant', content: '', tool_calls: [] }
          handlers.current.onSessionReset?.()
          break
        }
        default:
          break
      }
    })
  }, [conversationId])

  const send = useCallback(
    async (
      message: string,
      opts?: {
        profileId?: string
        thinkingMode?: ThinkingLevel
      },
    ) => {
      buffer.current = { role: 'assistant', content: '', tool_calls: [] }
      await connect()
      const sock = socketRef.current
      if (!sock) {
        handlers.current.onError('not connected')
        return
      }
      const dispatch = () =>
        sock.send(
          JSON.stringify({
            message,
            conversation_id: conversationId ?? undefined,
            profile_id: opts?.profileId ?? undefined,
            thinking_mode: opts?.thinkingMode ?? undefined,
          }),
        )
      if (sock.readyState === WebSocket.OPEN) dispatch()
      else sock.addEventListener('open', dispatch, { once: true })
    },
    [conversationId, connect],
  )

  const sendApproval = useCallback(
    (requestId: string, approved: boolean) => {
      const sock = socketRef.current
      if (!sock || sock.readyState !== WebSocket.OPEN) {
        handlers.current.onError('not connected')
        return
      }
      sock.send(
        JSON.stringify({
          type: 'approval_response',
          request_id: requestId,
          approved,
        }),
      )
    },
    [],
  )

  useEffect(() => {
    return () => {
      socketRef.current?.close()
      socketRef.current = null
    }
  }, [])

  return { state, send, sendApproval } as const
}

export type { StreamingTurn }
