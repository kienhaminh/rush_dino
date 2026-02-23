import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { ChatChunk, Message } from '../lib/types';

function buildWsUrl() {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${protocol}://${window.location.host}/api/ws/chat`;
}

export function useWebSocket(activeConversationId: string | null) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef(0);

  const connect = useCallback(() => {
    const socket = new WebSocket(buildWsUrl());
    socketRef.current = socket;

    socket.onopen = () => {
      reconnectRef.current = 0;
      setIsConnected(true);
    };

    socket.onclose = () => {
      setIsConnected(false);
      const wait = Math.min(1000 * 2 ** reconnectRef.current, 30000);
      reconnectRef.current += 1;
      window.setTimeout(connect, wait);
    };

    socket.onmessage = (event) => {
      const chunk: ChatChunk = JSON.parse(event.data);
      if (chunk.done) {
        setIsStreaming(false);
        return;
      }

      setMessages((current) => {
        const next = [...current];
        const last = next[next.length - 1];
        if (last && last.role === 'assistant') {
          last.content += chunk.delta;
          return [...next.slice(0, -1), last];
        }
        next.push({ id: crypto.randomUUID(), role: 'assistant', content: chunk.delta });
        return next;
      });
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      socketRef.current?.close();
    };
  }, [connect]);

  const sendMessage = useCallback(
    (text: string) => {
      if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
        return;
      }
      setMessages((current) => [
        ...current,
        { id: crypto.randomUUID(), role: 'user', content: text },
        { id: crypto.randomUUID(), role: 'assistant', content: '' },
      ]);
      setIsStreaming(true);
      socketRef.current.send(
        JSON.stringify({
          conversation_id: activeConversationId,
          message: text,
        }),
      );
    },
    [activeConversationId],
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return useMemo(
    () => ({ messages, sendMessage, clearMessages, isConnected, isStreaming }),
    [messages, sendMessage, clearMessages, isConnected, isStreaming],
  );
}
