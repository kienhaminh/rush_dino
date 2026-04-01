import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
  useMemo,
} from 'react';
import type { Dispatch, MutableRefObject, ReactNode, SetStateAction } from 'react';
import { toast } from 'sonner';

import { useDashboardAuth } from '@/hooks/use-dashboard-auth';
import { fetchConversation } from '@/lib/api';
import { messagesToItems } from '@/lib/message-converter';
import type {
  ConversationDetail,
  ConversationItem,
  InputRequestStatus,
  RichContent,
  WsEvent,
} from '@/lib/types';

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
  resetFromConversationDetail: (detail: ConversationDetail) => void;
  historyLoaded: boolean;
  setHistoryLoaded: (v: boolean) => void;
  /** Items for each delegated agent's internal conversation, keyed by conversation id. */
  delegateItems: Map<string, ConversationItem[]>;
  /** Revision counter — increments when any delegate's items change. */
  delegateItemsRevision: number;
}

const ChatWsContext = createContext<ChatWsValue | null>(null);

// ---------------------------------------------------------------------------
// Chat state reducer
// ---------------------------------------------------------------------------

type ChatState = {
  items: ConversationItem[];
  isStreaming: boolean;
  historyLoaded: boolean;
};

type ChatAction =
  | { type: 'setItems'; items: ConversationItem[] }
  | { type: 'updateItems'; updater: (prev: ConversationItem[]) => ConversationItem[] }
  | { type: 'setStreaming'; streaming: boolean }
  | { type: 'setHistoryLoaded'; loaded: boolean };

function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'setItems':
      return { ...state, items: action.items };
    case 'updateItems':
      return { ...state, items: action.updater(state.items) };
    case 'setStreaming':
      return { ...state, isStreaming: action.streaming };
    case 'setHistoryLoaded':
      return { ...state, historyLoaded: action.loaded };
  }
}

const INITIAL_CHAT_STATE: ChatState = {
  items: [],
  isStreaming: false,
  historyLoaded: false,
};

function isConversationStreaming(detail: ConversationDetail): boolean {
  const state = detail.activeRun?.state;
  return (
    state === 'running' ||
    state === 'awaiting_approval' ||
    state === 'awaiting_input'
  );
}

// ---------------------------------------------------------------------------
// WebSocket message handler (extracted to keep ChatWsProvider body concise)
// ---------------------------------------------------------------------------

interface HandleWsMsgDeps {
  seenErrorLogIdsRef: MutableRefObject<Set<string>>;
  streamingConvIdRef: MutableRefObject<string | null>;
  lastStreamedConvIdRef: MutableRefObject<string | null>;
  dispatchChat: Dispatch<ChatAction>;
  setPairingRequestCount: Dispatch<SetStateAction<number>>;
  replaceAssistantItem: (
    prev: ConversationItem[],
    assistant: { content: string; richContent?: RichContent | null; runId?: string | null },
  ) => ConversationItem[];
  delegateItemsRef: MutableRefObject<Map<string, ConversationItem[]>>;
  bumpDelegateRevision: () => void;
}

/** Applies an inner WsEvent from a delegate to its ConversationItem[] array,
 *  producing the updated array. Mirrors the main timeline's event processing
 *  logic but operates on a standalone items array. */
function applyDelegateInnerEvent(
  prev: ConversationItem[],
  inner: WsEvent,
): ConversationItem[] {
  if (inner.type === 'chat_chunk') {
    if (inner.done) {
      return prev.map((item) =>
        item.kind === 'thinking' && !item.done ? { ...item, done: true } : item,
      );
    }
    if (inner.thinking_delta) {
      const lastIdx = [...prev]
        .map((x, i) => [x, i] as const)
        .reverse()
        .find(([x]) => x.kind === 'thinking')?.[1] ?? -1;
      const lastItem = lastIdx !== -1 ? prev[lastIdx] : null;
      if (!lastItem || lastItem.kind !== 'thinking' || lastItem.done) {
        return [
          ...prev,
          { kind: 'thinking' as const, id: crypto.randomUUID(), content: inner.thinking_delta },
        ];
      }
      return [
        ...prev.slice(0, lastIdx),
        { ...lastItem, content: (lastItem.content ?? '') + inner.thinking_delta },
        ...prev.slice(lastIdx + 1),
      ];
    }
    if (!inner.delta) return prev;
    const last = prev[prev.length - 1];
    if (last && last.kind === 'assistant') {
      return [
        ...prev.slice(0, -1),
        { ...last, content: last.content + inner.delta, richContent: null },
      ];
    }
    return [
      ...prev,
      { kind: 'assistant' as const, id: crypto.randomUUID(), content: inner.delta, richContent: null, runId: null },
    ];
  }

  if (inner.type === 'assistant_reset') {
    return [...prev, { kind: 'thinking' as const, id: crypto.randomUUID() }];
  }

  if (inner.type === 'assistant_message') {
    // Replace the last streamed assistant item with the final content.
    const lastAssistantIdx = [...prev].reverse().findIndex((item) => item.kind === 'assistant');
    if (lastAssistantIdx !== -1) {
      const realIdx = prev.length - 1 - lastAssistantIdx;
      return [
        ...prev.slice(0, realIdx),
        {
          kind: 'assistant' as const,
          id: prev[realIdx].id,
          content: inner.content,
          richContent: inner.rich_content ?? null,
          runId: inner.run_id ?? null,
        },
        ...prev.slice(realIdx + 1).map((item) =>
          item.kind === 'thinking' ? { ...item, done: true } : item,
        ),
      ];
    }
    return [
      ...prev.map((item) => (item.kind === 'thinking' ? { ...item, done: true } : item)),
      { kind: 'assistant' as const, id: crypto.randomUUID(), content: inner.content, richContent: inner.rich_content ?? null, runId: inner.run_id ?? null },
    ];
  }

  if (inner.type === 'tool_start') {
    return [
      ...prev.map((item) =>
        item.kind === 'thinking' && !item.done ? { ...item, done: true } : item,
      ),
      {
        kind: 'tool_use' as const,
        id: `tool-${inner.tool_name}-${Date.now()}`,
        tool_name: inner.tool_name,
        args: inner.args,
        status: 'running' as const,
      },
    ];
  }

  if (inner.type === 'tool_end') {
    const reversedIdx = [...prev]
      .reverse()
      .findIndex(
        (it) =>
          it.kind === 'tool_use' && it.tool_name === inner.tool_name && it.status === 'running',
      );
    if (reversedIdx === -1) return prev;
    const realIdx = prev.length - 1 - reversedIdx;
    const existing = prev[realIdx];
    if (existing.kind !== 'tool_use') return prev;
    return [
      ...prev.slice(0, realIdx),
      { ...existing, result: inner.result, is_error: inner.is_error, status: inner.is_error ? ('error' as const) : ('done' as const) },
      ...prev.slice(realIdx + 1),
    ];
  }

  if (inner.type === 'error') {
    return [
      ...prev,
      { kind: 'error' as const, id: crypto.randomUUID(), message: inner.message },
    ];
  }

  // Nested delegate events — recursively apply to the inner delegate's items.
  if (inner.type === 'delegate_event') {
    // This case is handled at the top level of handleWsMessage, not here.
    // But if it appears nested, just pass through.
    return prev;
  }

  return prev;
}

function handleWsMessage(msg: WsEvent, deps: HandleWsMsgDeps): void {
  const {
    seenErrorLogIdsRef,
    streamingConvIdRef,
    lastStreamedConvIdRef,
    dispatchChat,
    setPairingRequestCount,
    replaceAssistantItem,
    delegateItemsRef,
    bumpDelegateRevision,
  } = deps;

  // --- delegate_event (route to nested timeline) ---
  if (msg.type === 'delegate_event') {
    const { delegate_conversation_id: delegateId, inner } = msg;
    const map = delegateItemsRef.current;
    const prev = map.get(delegateId) ?? [];
    const updated = applyDelegateInnerEvent(prev, inner);
    map.set(delegateId, updated);
    bumpDelegateRevision();
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
      dispatchChat({ type: 'updateItems', updater: (prev) =>
        prev.map((item) =>
          item.kind === 'thinking' && !item.done ? { ...item, done: true } : item,
        ),
      });
      return;
    }
    if (msg.thinking_delta) {
      dispatchChat({ type: 'updateItems', updater: (prev) => {
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
      }});
      return;
    }
    if (!msg.delta) return;
    if (streamingConvIdRef.current === null) {
      streamingConvIdRef.current = msg.conversation_id ?? null;
    }
    dispatchChat({ type: 'updateItems', updater: (prev) => {
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
    }});
    return;
  }

  // --- assistant_reset ---
  if (msg.type === 'assistant_reset') {
    dispatchChat({ type: 'updateItems', updater: (prev) => [...prev, { kind: 'thinking', id: crypto.randomUUID() }] });
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
    dispatchChat({ type: 'updateItems', updater: (prev) =>
      replaceAssistantItem(prev, {
        content: msg.content,
        richContent: msg.rich_content ?? null,
        runId: msg.run_id ?? null,
      }),
    });
    dispatchChat({ type: 'setStreaming', streaming: false });
    streamingConvIdRef.current = null;
    return;
  }

  // --- tool_start ---
  if (msg.type === 'tool_start') {
    dispatchChat({ type: 'updateItems', updater: (prev) => [
      ...prev.map((item) =>
        item.kind === 'thinking' && !item.done ? { ...item, done: true } : item,
      ),
      {
        kind: 'tool_use' as const,
        id: `tool-${msg.tool_name}-${Date.now()}`,
        tool_name: msg.tool_name,
        args: msg.args,
        status: 'running' as const,
      },
    ]});
    return;
  }

  // --- tool_end ---
  if (msg.type === 'tool_end') {
    dispatchChat({ type: 'updateItems', updater: (prev) => {
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
    }});
    return;
  }

  // --- approval_request ---
  if (msg.type === 'approval_request') {
    dispatchChat({ type: 'updateItems', updater: (prev) => [
      ...prev.map((item) =>
        item.kind === 'thinking' && !item.done ? { ...item, done: true } : item,
      ),
      {
        kind: 'approval' as const,
        id: crypto.randomUUID(),
        request_id: msg.request_id,
        tool: msg.tool,
        args: msg.args,
      },
    ]});
    return;
  }

  // --- input_request ---
  if (msg.type === 'input_request') {
    dispatchChat({ type: 'updateItems', updater: (prev) => {
      if (
        prev.some(
          (item) =>
            item.kind === 'input_request' && item.requestId === msg.request_id,
        )
      ) {
        return prev;
      }
      return [
        ...prev.map((item) =>
          item.kind === 'thinking' && !item.done ? { ...item, done: true } : item,
        ),
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
    }});
    return;
  }

  // --- session_reset (profile changed, session cleared) ---
  if (msg.type === 'session_reset') {
    dispatchChat({ type: 'setItems', items: [] });
    dispatchChat({ type: 'setStreaming', streaming: false });
    toast.info('Profile changed — conversation reset.');
    return;
  }

  // --- error ---
  if (msg.type === 'error') {
    dispatchChat({ type: 'updateItems', updater: (prev) => [
      ...prev,
      { kind: 'error' as const, id: crypto.randomUUID(), message: msg.message },
    ]});
    dispatchChat({ type: 'setStreaming', streaming: false });
    return;
  }

  // --- user_message (external channel broadcast) ---
  if (msg.type === 'user_message') {
    dispatchChat({ type: 'setStreaming', streaming: true });
    streamingConvIdRef.current = msg.conversation_id;
    dispatchChat({ type: 'updateItems', updater: (prev) => [
      ...prev,
      { kind: 'user' as const, id: crypto.randomUUID(), content: msg.content },
    ]});
    return;
  }

  // --- task_review_ready ---
  if (msg.type === 'task_review_ready') {
    dispatchChat({ type: 'updateItems', updater: (prev) => [
      ...prev,
      {
        kind: 'assistant' as const,
        id: crypto.randomUUID(),
        content: msg.notification,
        richContent: null,
        runId: null,
      },
    ]});
    return;
  }

  // --- pairing_request_created ---
  if (msg.type === 'pairing_request_created') {
    setPairingRequestCount((n) => n + 1);
    return;
  }
}

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
  const [chatState, dispatchChat] = useReducer(chatReducer, INITIAL_CHAT_STATE);
  const { items, isStreaming, historyLoaded } = chatState;

  // Streaming refs
  const streamingConvIdRef = useRef<string | null>(null);
  const lastStreamedConvIdRef = useRef<string | null>(null);

  // Error dedup for runtime_log_error toasts
  const seenErrorLogIdsRef = useRef<Set<string>>(new Set());

  // Delegate agent internal conversation items, keyed by delegate_conversation_id.
  const delegateItemsRef = useRef<Map<string, ConversationItem[]>>(new Map());
  const [delegateItemsRevision, setDelegateItemsRevision] = useState(0);

  const [pairingRequestCount, setPairingRequestCount] = useState(0);
  const rehydratingRef = useRef(false);

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

  const resetFromConversationDetail = useCallback((detail: ConversationDetail) => {
    dispatchChat({
      type: 'setItems',
      items: messagesToItems(
        detail.messages,
        detail.pendingInputRequests ?? [],
        detail.activeRun ?? null,
      ),
    });
    dispatchChat({ type: 'setStreaming', streaming: isConversationStreaming(detail) });
  }, []);

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
      if (historyLoaded && !rehydratingRef.current) {
        rehydratingRef.current = true;
        void fetchConversation(MAIN_SESSION_ID)
          .then((detail) => {
            resetFromConversationDetail(detail);
          })
          .catch(() => {
            // Keep the current client state if the refresh fails.
          })
          .finally(() => {
            rehydratingRef.current = false;
          });
      }
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
      handleWsMessage(msg, {
        seenErrorLogIdsRef,
        streamingConvIdRef,
        lastStreamedConvIdRef,
        dispatchChat,
        setPairingRequestCount,
        replaceAssistantItem,
        delegateItemsRef,
        bumpDelegateRevision: () => setDelegateItemsRevision((n) => n + 1),
      });
    };
  }, [historyLoaded, replaceAssistantItem, resetFromConversationDetail]);

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
    dispatchChat({ type: 'updateItems', updater: (prev) => [
      ...prev,
      { kind: 'user' as const, id: crypto.randomUUID(), content: text },
    ]});
    dispatchChat({ type: 'setStreaming', streaming: true });
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
      dispatchChat({ type: 'updateItems', updater: (prev) =>
        prev.map((item) =>
          item.kind === 'input_request' && item.requestId === requestId
            ? {
                ...item,
                status,
                values: values ?? null,
              }
            : item,
        ),
      });
    },
    [],
  );

  const clearItems = useCallback(() => dispatchChat({ type: 'setItems', items: [] }), []);

  const resetWithItems = useCallback((history: ConversationItem[]) => {
    dispatchChat({ type: 'setItems', items: history });
  }, []);

  // -------------------------------------------------------------------------
  // Context values
  // -------------------------------------------------------------------------

  const connectionValue = useMemo(() => ({ isConnected }), [isConnected]);

  const pairingRequestValue = useMemo(
    () => ({ pairingRequestCount }),
    [pairingRequestCount],
  );

  const setHistoryLoaded = useCallback(
    (v: boolean) => dispatchChat({ type: 'setHistoryLoaded', loaded: v }),
    [],
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
      resetFromConversationDetail,
      historyLoaded,
      setHistoryLoaded,
      delegateItems: delegateItemsRef.current,
      delegateItemsRevision,
    }),
    [
      items,
      isStreaming,
      isConnected,
      sendMessage,
      markInputRequestResolved,
      clearItems,
      resetWithItems,
      resetFromConversationDetail,
      historyLoaded,
      setHistoryLoaded,
      delegateItemsRevision,
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
