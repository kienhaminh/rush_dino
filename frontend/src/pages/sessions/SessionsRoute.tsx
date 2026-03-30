import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  deleteConversation,
  resetSession,
  fetchConversation,
  fetchRegisteredTools,
  fetchSessionRuns,
  fetchSessions,
  fetchSoulMemoryState,
  fetchSystemPrompt,
  fetchSystemSummary,
  patchThinkingLevel,
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

// --- Session detail reducer ---
type SessionDetailState = {
  loading: boolean;
  error: string | null;
  messages: Message[];
  runs: RunSnapshot[];
};
type SessionDetailAction =
  | { type: 'loading' }
  | { type: 'loaded'; runs: RunSnapshot[]; messages: Message[] }
  | { type: 'error'; message: string };

function sessionDetailReducer(state: SessionDetailState, action: SessionDetailAction): SessionDetailState {
  switch (action.type) {
    case 'loading': return { loading: true, error: null, messages: state.messages, runs: state.runs };
    case 'loaded': return { loading: false, error: null, messages: action.messages, runs: action.runs };
    case 'error': return { loading: false, error: action.message, messages: [], runs: [] };
  }
}

// --- Meta reducer ---
type MetaState = {
  sessions: SessionSummary[];
  soulMemory: SoulMemoryStateResponse | null;
  systemPrompt: string | null;
  registeredTools: RegisteredTool[];
  agentConfig: SystemSummaryResponse['agentConfig'];
};
type MetaAction =
  | { type: 'loaded'; sessions: SessionSummary[]; soulMemory: SoulMemoryStateResponse; systemPrompt: string; registeredTools: RegisteredTool[]; agentConfig: SystemSummaryResponse['agentConfig'] }
  | { type: 'error' };

function metaReducer(state: MetaState, action: MetaAction): MetaState {
  if (action.type === 'loaded') {
    return {
      sessions: action.sessions,
      soulMemory: action.soulMemory,
      systemPrompt: action.systemPrompt,
      registeredTools: action.registeredTools,
      agentConfig: action.agentConfig,
    };
  }
  return state;
}

const POLL_INTERVAL_MS = 30_000;

export function SessionsRoute() {
  const [detailState, dispatchDetail] = useReducer(sessionDetailReducer, {
    loading: false,
    error: null,
    messages: [],
    runs: [],
  });
  const [metaState, dispatchMeta] = useReducer(metaReducer, {
    sessions: [],
    soulMemory: null,
    systemPrompt: null,
    registeredTools: [],
    agentConfig: null,
  });
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [thinkingLevelOverride, setThinkingLevelOverride] = useState<string | null>(null);
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
      dispatchMeta({
        type: 'loaded',
        sessions: s,
        soulMemory: mem,
        systemPrompt: prompt.content,
        registeredTools: tools,
        agentConfig: summary.agentConfig ?? null,
      });
      if (isInitial) {
        // Always connect to the main session by its fixed ID.
        const main = s.find((x) => x.id === 'main') ?? s[0] ?? null;
        if (main) setSelectedSessionId(main.id);
      }
    } catch (e) {
      dispatchMeta({ type: 'error' });
      if (isInitial) dispatchDetail({ type: 'error', message: e instanceof Error ? e.message : 'Failed to load sessions' });
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
      dispatchDetail({ type: 'loading' });
      try {
        const sessionRuns = await fetchSessionRuns(selectedSessionId, 30);
        const conversationId = sessionRuns[0]?.conversationId;
        let messages: Message[] = [];
        if (conversationId) {
          const conv = await fetchConversation(conversationId);
          messages = conv.messages;
        }
        dispatchDetail({ type: 'loaded', runs: sessionRuns, messages });
      } catch (e) {
        dispatchDetail({ type: 'error', message: e instanceof Error ? e.message : 'Failed to load session detail' });
      }
    }
    loadSession();
  }, [selectedSessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRefresh = async () => {
    await refreshMeta(false);
    setSelectedSessionId((prev) => prev);
  };

  const handleThinkingLevelChange = async (level: string) => {
    setThinkingLevelOverride(level); // optimistic update
    try {
      await patchThinkingLevel(level);
    } catch (err) {
      setThinkingLevelOverride(null); // revert on error
      toast.error(err instanceof Error ? err.message : 'Failed to update thinking level');
    }
  };

  const handleReset = async (sessionId: string) => {
    if (!window.confirm('Reset this session? This will clear the conversation history and cannot be undone.')) return;
    try {
      await resetSession(sessionId);
      toast.success('Session reset.');
      await refreshMeta(false);
      setSelectedSessionId(sessionId); // re-trigger conversation reload
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reset session.');
    }
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
      sessions={metaState.sessions}
      selectedSessionId={selectedSessionId}
      messages={detailState.messages}
      runs={detailState.runs}
      soulMemory={metaState.soulMemory}
      systemPrompt={metaState.systemPrompt}
      registeredTools={metaState.registeredTools}
      agentConfig={metaState.agentConfig}
      loading={detailState.loading}
      error={detailState.error}
      onSelectSession={setSelectedSessionId}
      onRefresh={handleRefresh}
      onReset={handleReset}
      onDelete={handleDelete}
      thinkingLevelOverride={thinkingLevelOverride}
      onThinkingLevelChange={handleThinkingLevelChange}
    />
  );
}
