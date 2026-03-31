import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchAgents,
  fetchAgentRuntime,
  fetchAgentHealth,
  fetchAgentProgressBoard,
  fetchAgentSessions,
  deleteAgent,
  resetAgentHealth,
} from '../api'

export const agentKeys = {
  all:      () => ['agents'] as const,
  list:     () => [...agentKeys.all(), 'list'] as const,
  runtime:  (id: string) => [...agentKeys.all(), 'runtime', id] as const,
  health:   (id: string) => [...agentKeys.all(), 'health', id] as const,
  progress: (params?: Parameters<typeof fetchAgentProgressBoard>[0]) =>
    [...agentKeys.all(), 'progress', params] as const,
  sessions: () => [...agentKeys.all(), 'sessions'] as const,
}

export function useAgentsQuery() {
  return useQuery({ queryKey: agentKeys.list(), queryFn: fetchAgents })
}

export function useAgentRuntimeQuery(id: string) {
  return useQuery({
    queryKey: agentKeys.runtime(id),
    queryFn: () => fetchAgentRuntime(id),
    enabled: !!id,
  })
}

export function useAgentHealthQuery(id: string) {
  return useQuery({
    queryKey: agentKeys.health(id),
    queryFn: () => fetchAgentHealth(id),
    enabled: !!id,
    refetchInterval: 10_000,
  })
}

export function useAgentProgressBoardQuery(
  params?: Parameters<typeof fetchAgentProgressBoard>[0],
) {
  return useQuery({
    queryKey: agentKeys.progress(params),
    queryFn: () => fetchAgentProgressBoard(params),
    refetchInterval: 5_000,
  })
}

export function useAgentSessionsQuery() {
  return useQuery({ queryKey: agentKeys.sessions(), queryFn: fetchAgentSessions })
}

export function useDeleteAgentMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deleteAgent,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: agentKeys.list() }),
  })
}

export function useResetAgentHealthMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: resetAgentHealth,
    onSuccess: (_data, id) =>
      queryClient.invalidateQueries({ queryKey: agentKeys.health(id) }),
  })
}
