import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type {
  Message,
  RegisteredTool,
  RunSnapshot,
  SessionSummary,
  SoulMemoryStateResponse,
} from '@/lib/types';
import {
  useSessionsQuery,
  useSessionRunsQuery,
  useConversationQuery,
  useDeleteConversationMutation,
  useResetSessionMutation,
  sessionKeys,
} from '@/lib/queries/sessions';
import { useSystemPromptQuery, useRegisteredToolsQuery, usePatchThinkingLevelMutation } from '@/lib/queries/config';
import { useSoulMemoryQuery } from '@/lib/queries/soul-memory';
import { useOverviewQuery } from '@/lib/queries/misc';
import { SessionsPage } from './SessionsPage';

export function SessionsRoute() {
  const queryClient = useQueryClient();
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [thinkingLevelOverride, setThinkingLevelOverride] = useState<string | null>(null);

  // --- Server state via React Query ---
  const sessionsQuery = useSessionsQuery();
  const soulMemoryQuery = useSoulMemoryQuery();
  const systemPromptQuery = useSystemPromptQuery();
  const registeredToolsQuery = useRegisteredToolsQuery();
  const overviewQuery = useOverviewQuery();

  // Auto-select main session on first load
  const sessions: SessionSummary[] = sessionsQuery.data ?? [];
  if (!selectedSessionId && sessions.length > 0) {
    const main = sessions.find((x) => x.id === 'main') ?? sessions[0];
    // Use a deferred set to avoid setState-during-render
    Promise.resolve().then(() => setSelectedSessionId(main.id));
  }

  // Session detail: runs and then conversation messages derived from the first run
  const runsQuery = useSessionRunsQuery(selectedSessionId ?? '', 30);
  const runs: RunSnapshot[] = runsQuery.data ?? [];
  const conversationId = runs[0]?.conversationId ?? '';
  const conversationQuery = useConversationQuery(conversationId);
  const messages: Message[] = conversationQuery.data?.messages ?? [];

  // Derived meta values
  const soulMemory: SoulMemoryStateResponse | null = soulMemoryQuery.data ?? null;
  const systemPrompt: string = systemPromptQuery.data?.content ?? '';
  const registeredTools: RegisteredTool[] = registeredToolsQuery.data ?? [];
  const agentConfig = overviewQuery.data?.agentConfig ?? null;

  // Loading / error: reflect detail loading (runs + conversation)
  const loading = runsQuery.isFetching || (!!conversationId && conversationQuery.isFetching);
  const error =
    runsQuery.isError
      ? (runsQuery.error instanceof Error ? runsQuery.error.message : 'Failed to load session detail')
      : conversationQuery.isError
      ? (conversationQuery.error instanceof Error ? conversationQuery.error.message : 'Failed to load conversation')
      : null;

  // --- Mutations ---
  const deleteMutation = useDeleteConversationMutation();
  const resetMutation = useResetSessionMutation();
  const patchThinkingMutation = usePatchThinkingLevelMutation();

  // --- Handlers ---
  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: sessionKeys.all() });
  };

  const handleThinkingLevelChange = async (level: string) => {
    setThinkingLevelOverride(level); // optimistic update
    try {
      await patchThinkingMutation.mutateAsync(level);
    } catch (err) {
      setThinkingLevelOverride(null); // revert on error
      toast.error(err instanceof Error ? err.message : 'Failed to update thinking level');
    }
  };

  const handleReset = async (sessionId: string) => {
    if (!window.confirm('Reset this session? This will clear the conversation history and cannot be undone.')) return;
    try {
      await resetMutation.mutateAsync(sessionId);
      toast.success('Session reset.');
      queryClient.invalidateQueries({ queryKey: sessionKeys.all() });
      setSelectedSessionId(sessionId); // re-trigger conversation reload
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reset session.');
    }
  };

  const handleDelete = async (sessionId: string) => {
    if (!window.confirm('Delete this conversation session? This cannot be undone.')) return;
    try {
      await deleteMutation.mutateAsync(sessionId);
      toast.success('Session deleted.');
      if (selectedSessionId === sessionId) setSelectedSessionId(null);
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
      onReset={handleReset}
      onDelete={handleDelete}
      thinkingLevelOverride={thinkingLevelOverride}
      onThinkingLevelChange={handleThinkingLevelChange}
    />
  );
}
