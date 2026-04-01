import { useQuery } from '@tanstack/react-query'
import { fetchMessages } from '../api'

export const messageKeys = {
  all:  () => ['messages'] as const,
  list: (agent?: string) => [...messageKeys.all(), 'list', agent ?? ''] as const,
}

export function useMessagesQuery(enabled: boolean, agent?: string) {
  return useQuery({
    queryKey: messageKeys.list(agent),
    queryFn: () => fetchMessages({ agent, limit: 50 }),
    enabled,
    refetchInterval: 5_000,
  })
}
