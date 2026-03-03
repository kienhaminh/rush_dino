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

interface WsContextValue {
  isConnected: boolean;
}

const WsContext = createContext<WsContextValue>({ isConnected: false });

/**
 * Maintains a single persistent WebSocket connection for the app lifetime.
 * Provides `isConnected` to any consumer via `useWsStatus`.
 */
export function WsStatusProvider({ children }: { children: ReactNode }) {
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef(0);

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${protocol}://${window.location.host}/api/ws/chat`;
    const socket = new WebSocket(url);
    socketRef.current = socket;

    socket.onopen = () => {
      reconnectRef.current = 0;
      setIsConnected(true);
    };

    socket.onclose = () => {
      setIsConnected(false);
      const wait = Math.min(1000 * 2 ** reconnectRef.current, 30_000);
      reconnectRef.current += 1;
      window.setTimeout(connect, wait);
    };

    // Message handling is delegated to useWebSocket in ChatPage.
    // This provider only tracks connection status.
  }, []);

  useEffect(() => {
    connect();
    return () => {
      socketRef.current?.close();
    };
  }, [connect]);

  const value = useMemo(() => ({ isConnected }), [isConnected]);

  return <WsContext.Provider value={value}>{children}</WsContext.Provider>;
}

/** Read the global WebSocket connection status. */
export function useWsStatus() {
  return useContext(WsContext);
}
