import { useQuery } from '@tanstack/react-query'
import { fetchLogs } from '../api'

export const logKeys = {
  all:  () => ['logs'] as const,
  list: (params?: Parameters<typeof fetchLogs>[0]) =>
    [...logKeys.all(), 'list', params] as const,
}

export function useLogsQuery(params?: Parameters<typeof fetchLogs>[0]) {
  return useQuery({
    queryKey: logKeys.list(params),
    queryFn: () => fetchLogs(params),
    refetchInterval: 2_000,
  })
}
