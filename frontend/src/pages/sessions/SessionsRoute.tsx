import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  deleteConversation,
  fetchConversation,
  fetchRegisteredTools,
  fetchSessionRuns,
  fetchSessions,
  fetchSoulMemoryState,
  fetchSystemPrompt,
  fetchSystemSummary,
} from '@/lib/api';
import type {
  Message,
  RegisteredTool,
  RunSnapshot,
  SessionSummary,
  SoulMemoryStateResponse,
  SystemSummaryResponse,
} from '@/lib/types';
import { SessionsPage } from './SessionsPage';

const POLL_INTERVAL_MS = 30_000;

export function SessionsRoute() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [runs, setRuns] = useState<RunSnapshot[]>([]);
  const [soulMemory, setSoulMemory] = useState<SoulMemoryStateResponse | null>(null);
  const [systemPrompt, setSystemPrompt] = useState<string | null>(null);
  const [registeredTools, setRegisteredTools] = useState<RegisteredTool[]>([]);
  const [agentConfig, setAgentConfig] = useState<SystemSummaryResponse['agentConfig']>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollingRef = useRef(false);

  // Fetch sessions + soul memory + system prompt
  const refreshMeta = useCallback(async (isInitial = false) => {
    try {
      const [s, mem, prompt, tools, summary] = await Promise.all([
        fetchSessions(),
        fetchSoulMemoryState(),
        fetchSystemPrompt(),
        fetchRegisteredTools(),
        fetchSystemSummary(),
      ]);
      setSessions(s);
      setSoulMemory(mem);
      setSystemPrompt(prompt.content);
      setRegisteredTools(tools);
      setAgentConfig(summary.agentConfig ?? null);
      if (isInitial && s.length > 0) {
        const latest = [...s].sort(
          (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        )[0];
        setSelectedSessionId(latest.id);
      }
    } catch (e) {
      if (isInitial) setError(e instanceof Error ? e.message : 'Failed to load sessions');
    }
  }, []);

  // Mount: load meta
  useEffect(() => {
    refreshMeta(true);
  }, [refreshMeta]);

  // Poll every 30s to keep context window token counts live
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

  // Load conversation + runs when selected session changes
  useEffect(() => {
    if (!selectedSessionId) return;

    async function loadSession() {
      if (!selectedSessionId) return;
      setLoading(true);
      setError(null);
      try {
        const sessionRuns = await fetchSessionRuns(selectedSessionId, 30);
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

  const handleRefresh = async () => {
    setError(null);
    try {
      await refreshMeta(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Refresh failed');
    }
    setSelectedSessionId((prev) => prev);
  };

  const handleDelete = async (sessionId: string) => {
    if (!window.confirm('Delete this conversation session? This cannot be undone.')) return;
    try {
      await deleteConversation(sessionId);
      toast.success('Session deleted.');
      if (selectedSessionId === sessionId) setSelectedSessionId(null);
      await refreshMeta(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete session.');
    }
  };

  return (
    <SessionsPage
      sessions={sessions}
      selectedSessionId={selectedSessionId}
      messages={messages}
      runs={runs}
      soulMemory={soulMemory}
      systemPrompt={systemPrompt}
      registeredTools={registeredTools}
      agentConfig={agentConfig}
      loading={loading}
      error={error}
      onSelectSession={setSelectedSessionId}
      onRefresh={handleRefresh}
      onDelete={handleDelete}
    />
  );
}
