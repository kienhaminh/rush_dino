import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchSessions,
  fetchConversation,
  fetchSessionRuns,
  fetchSoulMemoryState,
  fetchSystemPrompt,
} from '@/lib/api';
import type { Message, RunSnapshot, SessionSummary, SoulMemoryStateResponse } from '@/lib/types';
import { ContextDebugPage } from './ContextDebugPage';

const POLL_INTERVAL_MS = 30_000;

export function ContextDebugRoute() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [runs, setRuns] = useState<RunSnapshot[]>([]);
  const [soulMemory, setSoulMemory] = useState<SoulMemoryStateResponse | null>(null);
  const [systemPrompt, setSystemPrompt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Track in-flight polling to avoid overlapping requests
  const pollingRef = useRef(false);

  // Fetch sessions + soul memory + system prompt (used on mount and for polling)
  const refreshMeta = useCallback(async (isInitial = false) => {
    try {
      const [s, mem, prompt] = await Promise.all([
        fetchSessions(),
        fetchSoulMemoryState(),
        fetchSystemPrompt(),
      ]);
      setSessions(s);
      setSoulMemory(mem);
      setSystemPrompt(prompt.content);
      if (isInitial && s.length > 0) {
        // Auto-select the most recently updated session on first load
        const latest = [...s].sort(
          (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        )[0];
        setSelectedSessionId(latest.id);
      }
    } catch (e) {
      if (isInitial) setError(e instanceof Error ? e.message : 'Failed to load sessions');
    }
  }, []);

  // Load sessions, soul memory, and system prompt once on mount
  useEffect(() => {
    refreshMeta(true);
  }, [refreshMeta]);

  // Poll sessions every POLL_INTERVAL_MS to keep context window token counts live
  useEffect(() => {
    const id = setInterval(async () => {
      if (pollingRef.current) return;
      pollingRef.current = true;
      try {
        await refreshMeta(false);
      } finally {
        pollingRef.current = false;
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [refreshMeta]);

  // Load conversation + runs whenever session selection changes
  useEffect(() => {
    if (!selectedSessionId) return;
    const session = sessions.find((s) => s.id === selectedSessionId);
    if (!session) return;

    async function loadSession() {
      if (!selectedSessionId) return;
      const session = sessions.find((s) => s.id === selectedSessionId);
      if (!session) return;

      setLoading(true);
      setError(null);
      try {
        // The session's lastRunId is not the conversation id — sessions track
        // runs but messages live in the conversation. The session summary does
        // not expose the conversation id directly, so we fetch by session runs
        // and use the first run's conversationId to load messages.
        const [sessionRuns] = await Promise.all([fetchSessionRuns(selectedSessionId, 30)]);
        setRuns(sessionRuns);

        const conversationId = sessionRuns[0]?.conversationId;
        if (conversationId) {
          const conv = await fetchConversation(conversationId);
          setMessages(conv.messages);
        } else {
          setMessages([]);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load session detail');
      } finally {
        setLoading(false);
      }
    }
    loadSession();
  }, [selectedSessionId, sessions]);

  async function handleRefresh() {
    setError(null);
    try {
      await refreshMeta(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Refresh failed');
    }
    // Re-trigger session detail load
    setSelectedSessionId((prev) => prev);
  }

  return (
    <ContextDebugPage
      sessions={sessions}
      selectedSessionId={selectedSessionId}
      messages={messages}
      runs={runs}
      soulMemory={soulMemory}
      systemPrompt={systemPrompt}
      loading={loading}
      error={error}
      onSelectSession={setSelectedSessionId}
      onRefresh={handleRefresh}
    />
  );
}
