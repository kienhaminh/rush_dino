import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { ActiveAgent, ConversationItem, RichContent, WsEvent } from '../lib/types';

// Callback invoked when a broadcast user_message arrives from a channel.
// Provides { conversationId, channel } so the UI can auto-switch.
export type OnChannelMessage = (conversationId: string, channel: string) => void;

// Callback invoked when the server assigns a new conversation_id for a message
// that was sent without one (i.e. "New conversation" flow in the workspace).
export type OnConversationStarted = (conversationId: string) => void;

function buildWsUrl() {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${protocol}://${window.location.host}/api/ws/chat`;
}

export function useWebSocket(
  activeConversationId: string | null,
  onChannelMessage?: OnChannelMessage,
  onConversationStarted?: OnConversationStarted,
) {
  const [items, setItems] = useState<ConversationItem[]>([]);
  const [activeAgent, setActiveAgent] = useState<ActiveAgent>({
    name: 'Orchestrator',
    role: 'orchestrator',
  });
  const [isConnected, setIsConnected] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  // Track which conversation is currently streaming so we can ignore cross-conversation events
  const streamingConvIdRef = useRef<string | null>(null);
  // Holds the conversation_id of the most recently completed stream so that the
  // AssistantMessage event (sent after the done:true chunk) can still be applied.
  const lastStreamedConvIdRef = useRef<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef(0);

  const replaceAssistantItem = useCallback(
    (
      previous: ConversationItem[],
      assistant: { content: string; richContent?: RichContent | null; runId?: string | null },
    ) => {
      const normalized = {
        kind: 'assistant' as const,
        id: assistant.runId ?? crypto.randomUUID(),
        content: assistant.content,
        richContent: assistant.richContent ?? null,
        runId: assistant.runId ?? null,
      };
      const lastAssistantIndex = [...previous].reverse().findIndex((item) => {
        if (item.kind !== 'assistant') return false;
        if (assistant.runId) {
          return item.runId === assistant.runId;
        }
        return true;
      });

      if (lastAssistantIndex === -1) {
        return [...previous.filter((item) => item.kind !== 'thinking'), normalized];
      }

      const index = previous.length - 1 - lastAssistantIndex;
      return [
        ...previous.slice(0, index),
        normalized,
        ...previous.slice(index + 1).filter((item) => item.kind !== 'thinking'),
      ];
    },
    [],
  );

  const connect = useCallback(() => {
    const socket = new WebSocket(buildWsUrl());
    socketRef.current = socket;

    socket.onopen = () => {
      reconnectRef.current = 0;
      setIsConnected(true);
    };

    socket.onclose = () => {
      if (socketRef.current !== socket) return;
      setIsConnected(false);
      const wait = Math.min(1000 * 2 ** reconnectRef.current, 30_000);
      reconnectRef.current += 1;
      window.setTimeout(connect, wait);
    };

    socket.onmessage = (event) => {
      const msg: WsEvent = JSON.parse(event.data as string);

      if (msg.type === 'chat_chunk') {
        if (msg.done) {
          // Save the conv id before clearing so the subsequent AssistantMessage
          // event (which arrives after done:true) can still be matched.
          lastStreamedConvIdRef.current = streamingConvIdRef.current;
          setIsStreaming(false);
          streamingConvIdRef.current = null;
          setActiveAgent({ name: 'Orchestrator', role: 'orchestrator' });
          return;
        }
        if (!msg.delta) return;
        // Track which conversation is streaming; on the first chunk of a new
        // conversation (sent without a conversation_id), notify ChatPage so it
        // can adopt the server-assigned id and continue the same thread.
        if (streamingConvIdRef.current === null) {
          streamingConvIdRef.current = msg.conversation_id ?? null;
          if (msg.conversation_id) {
            onConversationStarted?.(msg.conversation_id);
          }
        }
        setItems((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.kind === 'assistant' && last.runId === (msg.run_id ?? null)) {
            return [
              ...prev.slice(0, -1),
              {
                ...last,
                content: last.content + msg.delta,
                richContent: null,
                runId: msg.run_id ?? null,
              },
            ];
          }
          return [
            ...prev,
            {
              kind: 'assistant',
              id: crypto.randomUUID(),
              content: msg.delta,
              richContent: null,
              runId: msg.run_id ?? null,
            },
          ];
        });
        return;
      }

      if (msg.type === 'assistant_reset') {
        setItems((prev) => [...prev, { kind: 'thinking', id: crypto.randomUUID() }]);
        return;
      }

      if (msg.type === 'assistant_message') {
        const shouldApply =
          msg.conversation_id === activeConversationId ||
          msg.conversation_id === streamingConvIdRef.current ||
          msg.conversation_id === lastStreamedConvIdRef.current;
        if (!shouldApply) {
          return;
        }
        lastStreamedConvIdRef.current = null;
        setItems((prev) =>
          replaceAssistantItem(prev, {
            content: msg.content,
            richContent: msg.rich_content ?? null,
            runId: msg.run_id ?? null,
          }),
        );
        setIsStreaming(false);
        streamingConvIdRef.current = null;
        setActiveAgent({ name: 'Orchestrator', role: 'orchestrator' });
        return;
      }

      if (msg.type === 'tool_start') {
        if (msg.tool_name === 'delegate_to_agent') {
          const agentName = (msg.args as Record<string, string>).agent_name ?? 'Agent';
          setActiveAgent({ name: agentName, role: 'delegate' });
        }
        setItems((prev) => [
          ...prev,
          {
            kind: 'tool_use' as const,
            id: `tool-${msg.tool_name}-${Date.now()}`,
            tool_name: msg.tool_name,
            args: msg.args,
            status: 'running' as const,
          },
        ]);
        return;
      }

      if (msg.type === 'tool_end') {
        if (msg.tool_name === 'delegate_to_agent') {
          setActiveAgent({ name: 'Orchestrator', role: 'orchestrator' });
        }
        setItems((prev) => {
          const reversedIdx = [...prev]
            .reverse()
            .findIndex(
              (it) =>
                it.kind === 'tool_use' && it.tool_name === msg.tool_name && it.status === 'running',
            );
          if (reversedIdx === -1) return prev;
          const realIdx = prev.length - 1 - reversedIdx;
          const existing = prev[realIdx];
          if (existing.kind !== 'tool_use') return prev;
          const updated: ConversationItem = {
            ...existing,
            result: msg.result,
            is_error: msg.is_error,
            status: msg.is_error ? 'error' : 'done',
          };
          return [...prev.slice(0, realIdx), updated, ...prev.slice(realIdx + 1)];
        });
        return;
      }

      if (msg.type === 'approval_request') {
        setItems((prev) => [
          ...prev,
          {
            kind: 'approval' as const,
            id: crypto.randomUUID(),
            request_id: msg.request_id,
            tool: msg.tool,
            args: msg.args,
          },
        ]);
        return;
      }

      if (msg.type === 'error') {
        setItems((prev) => [
          ...prev,
          { kind: 'error' as const, id: crypto.randomUUID(), message: msg.message },
        ]);
        setIsStreaming(false);
        return;
      }

      if (msg.type === 'user_message') {
        // A message arrived via an external channel (Telegram, Discord, etc.).
        // Notify ChatPage so it can switch to / load that conversation.
        onChannelMessage?.(msg.conversation_id, msg.channel);
        setIsStreaming(true);
        setActiveAgent({ name: 'Orchestrator', role: 'orchestrator' });
        streamingConvIdRef.current = msg.conversation_id;
        setItems((prev) => [
          ...prev,
          { kind: 'user' as const, id: crypto.randomUUID(), content: msg.content },
        ]);
        return;
      }
    };
  }, [activeConversationId, onChannelMessage, onConversationStarted, replaceAssistantItem]);

  useEffect(() => {
    connect();
    return () => socketRef.current?.close();
  }, [connect]);

  const sendMessage = useCallback(
    (text: string) => {
      if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) return;
      setItems((prev) => [
        ...prev,
        { kind: 'user' as const, id: crypto.randomUUID(), content: text },
      ]);
      setIsStreaming(true);
      setActiveAgent({ name: 'Orchestrator', role: 'orchestrator' });
      socketRef.current.send(
        JSON.stringify({ conversation_id: activeConversationId, message: text }),
      );
    },
    [activeConversationId],
  );

  const clearItems = useCallback(() => setItems([]), []);

  /** Replace the current item list with a pre-loaded history (e.g. from REST API) */
  const resetWithItems = useCallback((history: ConversationItem[]) => {
    setItems(history);
  }, []);

  return useMemo(
    () => ({
      items,
      activeAgent,
      sendMessage,
      clearItems,
      resetWithItems,
      isConnected,
      isStreaming,
      streamingConvId: streamingConvIdRef.current,
    }),
    [items, activeAgent, sendMessage, clearItems, resetWithItems, isConnected, isStreaming],
  );
}
