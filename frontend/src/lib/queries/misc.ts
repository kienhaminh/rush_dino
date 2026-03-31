import { useQuery } from '@tanstack/react-query'
import { fetchSystemSummary } from '../api'

export const miscKeys = {
  all:      () => ['misc'] as const,
  overview: () => [...miscKeys.all(), 'overview'] as const,
}

export function useOverviewQuery() {
  return useQuery({ queryKey: miscKeys.overview(), queryFn: fetchSystemSummary })
}
