import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchSessions,
  fetchConversations,
  fetchConversation,
  fetchSessionRuns,
  deleteConversation,
  resetSession,
} from '../api'

export const sessionKeys = {
  all:           () => ['sessions'] as const,
  list:          () => [...sessionKeys.all(), 'list'] as const,
  conversations: () => [...sessionKeys.all(), 'conversations'] as const,
  detail:   (id: string) => [...sessionKeys.all(), 'detail', id] as const,
  runs:     (id: string, limit?: number) =>
    [...sessionKeys.all(), 'runs', id, limit] as const,
}

// Admin sessions list — polls every 30s
export function useSessionsQuery() {
  return useQuery({
    queryKey: sessionKeys.list(),
    queryFn: fetchSessions,
    refetchInterval: 30_000,
  })
}

export function useConversationsQuery() {
  return useQuery({
    queryKey: sessionKeys.conversations(),
    queryFn: fetchConversations,
  })
}

export function useConversationQuery(id: string) {
  return useQuery({
    queryKey: sessionKeys.detail(id),
    queryFn: () => fetchConversation(id),
    enabled: !!id,
  })
}

export function useSessionRunsQuery(sessionId: string, limit = 30) {
  return useQuery({
    queryKey: sessionKeys.runs(sessionId, limit),
    queryFn: () => fetchSessionRuns(sessionId, limit),
    enabled: !!sessionId,
  })
}

export function useDeleteConversationMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deleteConversation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sessionKeys.list() })
      queryClient.invalidateQueries({ queryKey: sessionKeys.conversations() })
    },
  })
}

export function useResetSessionMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: resetSession,
    onSuccess: (_data, sessionId) =>
      queryClient.invalidateQueries({ queryKey: sessionKeys.detail(sessionId) }),
  })
}
