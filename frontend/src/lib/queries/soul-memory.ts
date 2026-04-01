import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchSoulMemoryState, patchSoulMemoryFile } from '../api'

export const soulMemoryKeys = {
  all:   () => ['soul-memory'] as const,
  state: () => [...soulMemoryKeys.all(), 'state'] as const,
}

export function useSoulMemoryQuery() {
  return useQuery({ queryKey: soulMemoryKeys.state(), queryFn: fetchSoulMemoryState })
}

export function usePatchCoreFileMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ filename, content }: { filename: string; content: string }) =>
      patchSoulMemoryFile(filename, content),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: soulMemoryKeys.state() }),
  })
}
