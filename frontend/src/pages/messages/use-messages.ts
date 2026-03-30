import { useCallback, useEffect, useState } from 'react';

export type AgentMessageRecord = {
  id: string;
  from_agent: string;
  to_agent: string;
  content: string;
  read: boolean;
  created_at: string;
};

const POLL_INTERVAL_MS = 5000;

export function useMessages(enabled: boolean, agent?: string) {
  const [messages, setMessages] = useState<AgentMessageRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const searchParams = new URLSearchParams();
      if (agent) searchParams.set('agent', agent);
      searchParams.set('limit', '50');
      const qs = searchParams.toString();
      const res = await fetch(`/api/messages?${qs}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setMessages(data.items ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch messages');
    } finally {
      setLoading(false);
    }
  }, [agent]);

  useEffect(() => {
    if (!enabled) return;
    load();
    const interval = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [enabled, load]);

  return { messages, loading, error, refresh: load };
}
