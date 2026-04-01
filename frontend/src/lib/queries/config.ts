import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchConfig,
  fetchCredentials,
  fetchSystemPrompt,
  fetchRegisteredTools,
  patchConfig,
  patchCredentials,
  patchThinkingLevel,
} from '../api'

export const configKeys = {
  all:          () => ['config'] as const,
  app:          () => [...configKeys.all(), 'app'] as const,
  credentials:  () => [...configKeys.all(), 'credentials'] as const,
  systemPrompt: () => [...configKeys.all(), 'system-prompt'] as const,
  tools:        () => [...configKeys.all(), 'tools'] as const,
}

export function useConfigQuery() {
  return useQuery({ queryKey: configKeys.app(), queryFn: fetchConfig })
}

export function useCredentialsQuery() {
  return useQuery({ queryKey: configKeys.credentials(), queryFn: fetchCredentials })
}

export function useSystemPromptQuery() {
  return useQuery({ queryKey: configKeys.systemPrompt(), queryFn: fetchSystemPrompt })
}

export function useRegisteredToolsQuery() {
  return useQuery({ queryKey: configKeys.tools(), queryFn: fetchRegisteredTools })
}

export function usePatchConfigMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: patchConfig,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: configKeys.app() }),
  })
}

export function usePatchCredentialsMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: patchCredentials,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: configKeys.credentials() }),
  })
}

export function usePatchThinkingLevelMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: patchThinkingLevel,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: configKeys.app() }),
  })
}
