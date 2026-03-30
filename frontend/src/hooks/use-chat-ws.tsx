import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useRef,
  useState,
  useMemo,
} from 'react';
import type { ReactNode } from 'react';
import { toast } from 'sonner';

import { useDashboardAuth } from '@/hooks/use-dashboard-auth';
import type { ConversationItem, InputRequestStatus, RichContent, WsEvent } from '@/lib/types';

const MAIN_SESSION_ID = 'main';

// ---------------------------------------------------------------------------
// Context: connection status (rarely changes — safe for AppLayout to consume)
// ---------------------------------------------------------------------------

interface ChatWsConnectionValue {
  isConnected: boolean;
}

const ChatWsConnectionContext = createContext<ChatWsConnectionValue>({
  isConnected: false,
});

// ---------------------------------------------------------------------------
// Context: pairing request notifications (used by sidebar badge + ApprovalsPage)
// ---------------------------------------------------------------------------

interface PairingRequestValue {
  /** Increments each time a pairing_request_created WS event arrives. */
  pairingRequestCount: number;
}

const PairingRequestContext = createContext<PairingRequestValue>({
  pairingRequestCount: 0,
});

// ---------------------------------------------------------------------------
// Context: chat items & actions (changes on every streaming chunk — only
// consumed by ChatPage)
// ---------------------------------------------------------------------------

interface ChatWsValue {
  items: ConversationItem[];
  isStreaming: boolean;
  isConnected: boolean;
  sendMessage: (text: string) => void;
  markInputRequestResolved: (
    requestId: string,
    status: InputRequestStatus,
    values?: Record<string, unknown> | null,
  ) => void;
  clearItems: () => void;
  resetWithItems: (items: ConversationItem[]) => void;
  historyLoaded: boolean;
  setHistoryLoaded: (v: boolean) => void;
}

const ChatWsContext = createContext<ChatWsValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

function buildWsUrl() {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${protocol}://${window.location.host}/api/ws/chat`;
}

export function ChatWsProvider({ children }: { children: ReactNode }) {
  const { readyForProtectedRoutes } = useDashboardAuth();

  // Connection state
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef(0);
  const readyRef = useRef(readyForProtectedRoutes);
  readyRef.current = readyForProtectedRoutes;

  // Chat state (persists across navigation)
  const [items, setItems] = useState<ConversationItem[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  // Streaming refs
  const streamingConvIdRef = useRef<string | null>(null);
  const lastStreamedConvIdRef = useRef<string | null>(null);

  // Error dedup for runtime_log_error toasts
  const seenErrorLogIdsRef = useRef<Set<string>>(new Set());

  const [pairingRequestCount, setPairingRequestCount] = useState(0);

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

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
        return [
          ...previous.map((item) =>
            item.kind === 'thinking' ? { ...item, done: true } : item,
          ),
          normalized,
        ];
      }

      const index = previous.length - 1 - lastAssistantIndex;
      return [
        ...previous.slice(0, index),
        normalized,
        ...previous.slice(index + 1).map((item) =>
          item.kind === 'thinking' ? { ...item, done: true } : item,
        ),
      ];
    },
    [],
  );

  // -------------------------------------------------------------------------
  // WebSocket connection + message handling
  // -------------------------------------------------------------------------

  const connect = useCallback(() => {
    if (!readyRef.current) return;

    const socket = new WebSocket(buildWsUrl());
    socketRef.current = socket;

    socket.onopen = () => {
      reconnectRef.current = 0;
      setIsConnected(true);
    };

    socket.onclose = () => {
      if (socketRef.current !== socket) return;
      setIsConnected(false);
      if (!readyRef.current) return;
      const wait = Math.min(1000 * 2 ** reconnectRef.current, 30_000);
      reconnectRef.current += 1;
      window.setTimeout(connect, wait);
    };

    socket.onmessage = (event) => {
      let msg: WsEvent;
      try {
        msg = JSON.parse(event.data as string);
      } catch {
        return;
      }

      // --- runtime_log_error (toast, from old WsStatusProvider) ---
      if (msg.type === 'runtime_log_error') {
        if (seenErrorLogIdsRef.current.has(msg.id)) return;
        seenErrorLogIdsRef.current.add(msg.id);
        if (seenErrorLogIdsRef.current.size > 100) {
          const oldestId = seenErrorLogIdsRef.current.values().next().value;
          if (oldestId) seenErrorLogIdsRef.current.delete(oldestId);
        }
        const title = msg.level === 'fatal' ? 'Fatal backend error' : 'Backend error detected';
        const description = msg.target
          ? `[${msg.target}] ${msg.message}`
          : msg.message;
        toast.error(title, { description, duration: 10_000 });
        return;
      }

      // --- chat_chunk ---
      if (msg.type === 'chat_chunk') {
        if (msg.done) {
          lastStreamedConvIdRef.current = streamingConvIdRef.current;
          // Do NOT set isStreaming=false here — the assistant_message event
          // arrives shortly after (post persist_assistant_turn) and handles it.
          // Transitioning here would fire the metrics refetch too early (race condition).
          streamingConvIdRef.current = null;
          setItems((prev) =>
            prev.map((item) =>
              item.kind === 'thinking' && !item.done ? { ...item, done: true } : item,
            ),
          );
          return;
        }
        if (msg.thinking_delta) {
          setItems((prev) => {
            const lastIdx = [...prev].map((x, i) => [x, i] as const).reverse()
              .find(([x]) => x.kind === 'thinking')?.[1] ?? -1;
            const lastItem = lastIdx !== -1 ? prev[lastIdx] : null;
            // Create a new thinking item if none exists or the last one is already done
            // (each react-loop iteration should have its own thinking block)
            if (!lastItem || lastItem.kind !== 'thinking' || lastItem.done) {
              return [
                ...prev,
                { kind: 'thinking' as const, id: crypto.randomUUID(), content: msg.thinking_delta },
              ];
            }
            return [
              ...prev.slice(0, lastIdx),
              { ...lastItem, content: (lastItem.content ?? '') + msg.thinking_delta },
              ...prev.slice(lastIdx + 1),
            ];
          });
          return;
        }
        if (!msg.delta) return;
        if (streamingConvIdRef.current === null) {
          streamingConvIdRef.current = msg.conversation_id ?? null;
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

      // --- assistant_reset ---
      if (msg.type === 'assistant_reset') {
        setItems((prev) => [...prev, { kind: 'thinking', id: crypto.randomUUID() }]);
        return;
      }

      // --- assistant_message ---
      if (msg.type === 'assistant_message') {
        const shouldApply =
          msg.conversation_id === MAIN_SESSION_ID ||
          msg.conversation_id === streamingConvIdRef.current ||
          msg.conversation_id === lastStreamedConvIdRef.current;
        if (!shouldApply) return;
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
        return;
      }

      // --- tool_start ---
      if (msg.type === 'tool_start') {
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

      // --- tool_end ---
      if (msg.type === 'tool_end') {
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

      // --- approval_request ---
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

      // --- input_request ---
      if (msg.type === 'input_request') {
        setItems((prev) => {
          if (
            prev.some(
              (item) =>
                item.kind === 'input_request' && item.requestId === msg.request_id,
            )
          ) {
            return prev;
          }
          return [
            ...prev,
            {
              kind: 'input_request' as const,
              id: `input-${msg.request_id}`,
              requestId: msg.request_id,
              runId: msg.run_id ?? null,
              conversationId: msg.conversation_id,
              payload: msg.payload,
              createdAt: msg.created_at,
              status: 'pending' as const,
              values: null,
            },
          ];
        });
        return;
      }

      // --- error ---
      if (msg.type === 'error') {
        setItems((prev) => [
          ...prev,
          { kind: 'error' as const, id: crypto.randomUUID(), message: msg.message },
        ]);
        setIsStreaming(false);
        return;
      }

      // --- user_message (external channel broadcast) ---
      if (msg.type === 'user_message') {
        setIsStreaming(true);
        streamingConvIdRef.current = msg.conversation_id;
        setItems((prev) => [
          ...prev,
          { kind: 'user' as const, id: crypto.randomUUID(), content: msg.content },
        ]);
        return;
      }

      // --- task_review_ready ---
      if (msg.type === 'task_review_ready') {
        setItems((prev) => [
          ...prev,
          {
            kind: 'assistant' as const,
            id: crypto.randomUUID(),
            content: msg.notification,
            richContent: null,
            runId: null,
          },
        ]);
        return;
      }

      // --- pairing_request_created ---
      if (msg.type === 'pairing_request_created') {
        setPairingRequestCount((n) => n + 1);
        return;
      }
    };
  }, [replaceAssistantItem]);

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!readyForProtectedRoutes) {
      socketRef.current?.close();
      socketRef.current = null;
      setIsConnected(false);
      return;
    }

    connect();
    return () => {
      socketRef.current?.close();
    };
  }, [connect, readyForProtectedRoutes]);

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  const sendMessage = useCallback((text: string) => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) return;
    setItems((prev) => [
      ...prev,
      { kind: 'user' as const, id: crypto.randomUUID(), content: text },
    ]);
    setIsStreaming(true);
    socketRef.current.send(
      JSON.stringify({ conversation_id: MAIN_SESSION_ID, message: text }),
    );
  }, []);

  const markInputRequestResolved = useCallback(
    (
      requestId: string,
      status: InputRequestStatus,
      values?: Record<string, unknown> | null,
    ) => {
      setItems((prev) =>
        prev.map((item) =>
          item.kind === 'input_request' && item.requestId === requestId
            ? {
                ...item,
                status,
                values: values ?? null,
              }
            : item,
        ),
      );
    },
    [],
  );

  const clearItems = useCallback(() => setItems([]), []);

  const resetWithItems = useCallback((history: ConversationItem[]) => {
    setItems(history);
  }, []);

  // -------------------------------------------------------------------------
  // Context values
  // -------------------------------------------------------------------------

  const connectionValue = useMemo(() => ({ isConnected }), [isConnected]);

  const pairingRequestValue = useMemo(
    () => ({ pairingRequestCount }),
    [pairingRequestCount],
  );

  const chatValue = useMemo(
    () => ({
      items,
      isStreaming,
      isConnected,
      sendMessage,
      markInputRequestResolved,
      clearItems,
      resetWithItems,
      historyLoaded,
      setHistoryLoaded,
    }),
    [
      items,
      isStreaming,
      isConnected,
      sendMessage,
      markInputRequestResolved,
      clearItems,
      resetWithItems,
      historyLoaded,
    ],
  );

  return (
    <ChatWsConnectionContext.Provider value={connectionValue}>
      <PairingRequestContext.Provider value={pairingRequestValue}>
        <ChatWsContext.Provider value={chatValue}>{children}</ChatWsContext.Provider>
      </PairingRequestContext.Provider>
    </ChatWsConnectionContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/** Read only the connection status (used by AppLayout header badge). */
export function useChatWsConnection() {
  return useContext(ChatWsConnectionContext);
}

/** Full chat state + actions (used by ChatPage). */
export function useChatWs() {
  const ctx = useContext(ChatWsContext);
  if (!ctx) throw new Error('useChatWs must be used within ChatWsProvider');
  return ctx;
}

/** Subscribe to pairing request arrival events (used by sidebar badge). */
export function usePairingRequestEvents() {
  return useContext(PairingRequestContext);
}
