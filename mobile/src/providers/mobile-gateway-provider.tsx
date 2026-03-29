import {
  createContext,
  startTransition,
  useContext,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type MutableRefObject,
  type PropsWithChildren,
} from 'react';

import {
  buildMobileGatewayWebSocketUrl,
  clearStoredMobileGatewayConnection,
  loadStoredMobileGatewayConnection,
  MobileGatewayRequestError,
  normalizeMobileGatewayConnection,
  saveStoredMobileGatewayConnection,
  type MobileGatewayConnectBootstrap,
  type StoredMobileGatewayConnection,
  validateMobileGatewayConnection,
} from '@/lib/mobile-gateway';

type ConnectionStatus = 'booting' | 'connecting' | 'connected' | 'disconnected';
type MessageRole = 'user' | 'assistant' | 'system';

export type ChatMessage = {
  id: string;
  role: MessageRole;
  content: string;
  pending?: boolean;
};

export type PendingApproval = {
  requestId: string;
  tool: string;
  args?: Record<string, unknown>;
  runId?: string | null;
  conversationId: string;
};

type MobileGatewayContextValue = {
  ready: boolean;
  status: ConnectionStatus;
  error: string | null;
  connection: StoredMobileGatewayConnection | null;
  bootstrap: MobileGatewayConnectBootstrap | null;
  messages: ChatMessage[];
  pendingApproval: PendingApproval | null;
  approvalSubmitting: boolean;
  connect: (connection: StoredMobileGatewayConnection) => Promise<boolean>;
  disconnect: () => Promise<void>;
  sendMessage: (message: string) => void;
  resolveApproval: (approved: boolean) => void;
  clearError: () => void;
};

const MobileGatewayContext = createContext<MobileGatewayContextValue | null>(null);

type NativeWebSocket = WebSocket & {
  close: (code?: number, reason?: string) => void;
};

type NativeWebSocketConstructor = {
  new (
    url: string,
    protocols?: string | string[],
    options?: { headers?: Record<string, string> },
  ): NativeWebSocket;
};

type SocketChunkEvent = {
  type: 'chat_chunk';
  run_id: string;
  delta: string;
  done: boolean;
};

type SocketAssistantMessageEvent = {
  type: 'assistant_message';
  content?: string;
};

type SocketAssistantResetEvent = {
  type: 'assistant_reset';
  run_id: string;
};

type SocketApprovalRequestEvent = {
  type: 'approval_request';
  request_id: string;
  tool: string;
  args?: Record<string, unknown>;
  run_id?: string | null;
  conversation_id: string;
};

type SocketApprovalResultEvent = {
  type: 'approval_result';
  request_id: string;
  approved: boolean;
  error?: string;
};

type SocketEvent =
  | SocketChunkEvent
  | SocketAssistantMessageEvent
  | SocketAssistantResetEvent
  | SocketApprovalRequestEvent
  | SocketApprovalResultEvent;

function createMessageId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function disposeSocket(socketRef: MutableRefObject<NativeWebSocket | null>) {
  const socket = socketRef.current;
  if (!socket) {
    return;
  }

  socket.onopen = null;
  socket.onmessage = null;
  socket.onerror = null;
  socket.onclose = null;
  socketRef.current = null;
  socket.close();
}

function parseSocketEvent(raw: string): SocketEvent | null {
  try {
    return JSON.parse(raw) as SocketEvent;
  } catch {
    return null;
  }
}

export function MobileGatewayProvider({ children }: PropsWithChildren) {
  const socketRef = useRef<NativeWebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const credentialsRef = useRef<StoredMobileGatewayConnection | null>(null);
  const previewMessageIdRef = useRef<string | null>(null);
  const manualDisconnectRef = useRef(false);

  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<ConnectionStatus>('booting');
  const [error, setError] = useState<string | null>(null);
  const [connection, setConnection] = useState<StoredMobileGatewayConnection | null>(null);
  const [bootstrap, setBootstrap] = useState<MobileGatewayConnectBootstrap | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pendingApproval, setPendingApproval] = useState<PendingApproval | null>(null);
  const [approvalSubmitting, setApprovalSubmitting] = useState(false);

  const clearReconnectTimer = () => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  };

  const appendSystemMessage = useEffectEvent((content: string) => {
    startTransition(() => {
      setMessages((current) => [
        ...current,
        {
          id: createMessageId('system'),
          role: 'system',
          content,
        },
      ]);
    });
  });

  const resetTransientState = useEffectEvent((clearMessages: boolean) => {
    previewMessageIdRef.current = null;
    setPendingApproval(null);
    setApprovalSubmitting(false);
    if (clearMessages) {
      startTransition(() => setMessages([]));
    }
  });

  const scheduleReconnect = useEffectEvent((nextConnection: StoredMobileGatewayConnection) => {
    clearReconnectTimer();
    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;
      void connectToGateway(nextConnection, { persist: false, clearMessages: false });
    }, 1500);
  });

  const handleSocketMessage = useEffectEvent((raw: string) => {
    const event = parseSocketEvent(raw);
    if (!event) {
      return;
    }

    if (event.type === 'chat_chunk') {
      startTransition(() => {
        setMessages((current) => {
          const previewId = previewMessageIdRef.current ?? createMessageId('assistant-preview');
          previewMessageIdRef.current = previewId;

          const index = current.findIndex((message) => message.id === previewId);
          if (index === -1) {
            return [
              ...current,
              {
                id: previewId,
                role: 'assistant',
                content: event.delta,
                pending: !event.done,
              },
            ];
          }

          return current.map((message) =>
            message.id === previewId
              ? {
                  ...message,
                  content: `${message.content}${event.delta}`,
                  pending: !event.done,
                }
              : message,
          );
        });
      });
      return;
    }

    if (event.type === 'assistant_reset') {
      const previewId = previewMessageIdRef.current;
      previewMessageIdRef.current = null;
      if (!previewId) {
        return;
      }
      startTransition(() => {
        setMessages((current) => current.filter((message) => message.id !== previewId));
      });
      return;
    }

    if (event.type === 'assistant_message') {
      const finalContent = typeof event.content === 'string' ? event.content : '';
      startTransition(() => {
        setMessages((current) => {
          const previewId = previewMessageIdRef.current;
          previewMessageIdRef.current = null;

          if (!previewId) {
            return [
              ...current,
              {
                id: createMessageId('assistant'),
                role: 'assistant',
                content: finalContent,
              },
            ];
          }

          return current.map((message) =>
            message.id === previewId
              ? {
                  ...message,
                  content: finalContent,
                  pending: false,
                }
              : message,
          );
        });
      });
      return;
    }

    if (event.type === 'approval_request') {
      setPendingApproval({
        requestId: event.request_id,
        tool: event.tool,
        args: event.args,
        runId: event.run_id,
        conversationId: event.conversation_id,
      });
      appendSystemMessage(`RushDino requested approval for ${event.tool}.`);
      return;
    }

    if (event.type === 'approval_result') {
      setApprovalSubmitting(false);
      setPendingApproval(null);
      if (event.error) {
        setError(event.error);
        appendSystemMessage(`Approval failed: ${event.error}`);
        return;
      }

      appendSystemMessage(event.approved ? 'Approval granted.' : 'Approval denied.');
    }
  });

  const openSocket = useEffectEvent(
    (nextConnection: StoredMobileGatewayConnection, nextBootstrap: MobileGatewayConnectBootstrap) => {
      clearReconnectTimer();
      disposeSocket(socketRef);

      manualDisconnectRef.current = false;
      setStatus('connecting');

      const url = buildMobileGatewayWebSocketUrl(
        nextConnection.host,
        nextBootstrap.websocketPath,
      );
      const NativeWebSocketImpl = WebSocket as unknown as NativeWebSocketConstructor;
      const socket = new NativeWebSocketImpl(url, undefined, {
        headers: {
          Authorization: `Bearer ${nextConnection.apiKey}`,
        },
      });

      socketRef.current = socket;
      socket.onopen = () => {
        setStatus('connected');
        setError(null);
      };
      socket.onmessage = (event) => {
        if (typeof event.data === 'string') {
          handleSocketMessage(event.data);
        }
      };
      socket.onerror = () => {
        setError('The RushDino mobile socket hit a transport error.');
      };
      socket.onclose = () => {
        socketRef.current = null;
        if (manualDisconnectRef.current) {
          return;
        }
        setStatus('connecting');
        scheduleReconnect(nextConnection);
      };
    },
  );

  const connectToGateway = useEffectEvent(
    async (
      nextConnection: StoredMobileGatewayConnection,
      options: { persist: boolean; clearMessages: boolean },
    ) => {
      const normalized = normalizeMobileGatewayConnection(nextConnection);
      credentialsRef.current = normalized;

      setConnection(normalized);
      setStatus('connecting');
      setError(null);
      resetTransientState(options.clearMessages);

      try {
        const nextBootstrap = await validateMobileGatewayConnection(normalized);
        if (options.persist) {
          await saveStoredMobileGatewayConnection(normalized);
        }
        setBootstrap(nextBootstrap);
        openSocket(normalized, nextBootstrap);
        return true;
      } catch (connectError) {
        const message =
          connectError instanceof Error
            ? connectError.message
            : 'Failed to connect to the RushDino mobile gateway.';
        const unauthorized =
          connectError instanceof MobileGatewayRequestError && connectError.status === 401;

        setStatus('disconnected');
        setError(message);

        if (unauthorized) {
          credentialsRef.current = null;
          setConnection(null);
          setBootstrap(null);
          resetTransientState(true);
          await clearStoredMobileGatewayConnection();
        } else if (options.clearMessages) {
          setBootstrap(null);
        }

        return false;
      }
    },
  );

  useEffect(() => {
    let active = true;

    void (async () => {
      const storedConnection = await loadStoredMobileGatewayConnection();
      if (!active) {
        return;
      }

      if (!storedConnection) {
        setReady(true);
        setStatus('disconnected');
        return;
      }

      await connectToGateway(storedConnection, {
        persist: false,
        clearMessages: true,
      });

      if (active) {
        setReady(true);
      }
    })();

    return () => {
      active = false;
      clearReconnectTimer();
      disposeSocket(socketRef);
    };
  }, [connectToGateway]);

  const contextValue: MobileGatewayContextValue = {
    ready,
    status,
    error,
    connection,
    bootstrap,
    messages,
    pendingApproval,
    approvalSubmitting,
    connect: async (nextConnection) => {
      const didConnect = await connectToGateway(nextConnection, {
        persist: true,
        clearMessages: true,
      });
      if (didConnect) {
        setReady(true);
      }
      return didConnect;
    },
    disconnect: async () => {
      manualDisconnectRef.current = true;
      clearReconnectTimer();
      disposeSocket(socketRef);
      credentialsRef.current = null;
      setConnection(null);
      setBootstrap(null);
      resetTransientState(true);
      setStatus('disconnected');
      setError(null);
      await clearStoredMobileGatewayConnection();
    },
    sendMessage: (message: string) => {
      const trimmed = message.trim();
      if (!trimmed) {
        return;
      }

      const socket = socketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        setError('RushDino is not connected yet.');
        return;
      }

      startTransition(() => {
        setMessages((current) => [
          ...current,
          {
            id: createMessageId('user'),
            role: 'user',
            content: trimmed,
          },
        ]);
      });

      setError(null);
      socket.send(JSON.stringify({ message: trimmed }));
    },
    resolveApproval: (approved: boolean) => {
      if (!pendingApproval) {
        return;
      }

      const socket = socketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        setError('RushDino is not connected yet.');
        return;
      }

      setApprovalSubmitting(true);
      socket.send(
        JSON.stringify({
          type: 'approval_response',
          request_id: pendingApproval.requestId,
          approved,
        }),
      );
    },
    clearError: () => setError(null),
  };

  return (
    <MobileGatewayContext.Provider value={contextValue}>
      {children}
    </MobileGatewayContext.Provider>
  );
}

export function useMobileGateway() {
  const context = useContext(MobileGatewayContext);
  if (!context) {
    throw new Error('useMobileGateway must be used inside MobileGatewayProvider.');
  }
  return context;
}
