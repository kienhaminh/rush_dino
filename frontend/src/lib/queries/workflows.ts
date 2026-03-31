import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchWorkflows,
  fetchWorkflow,
  fetchWorkflowRuns,
  fetchWorkflowRun,
  startWorkflowRun,
  cancelWorkflowRun,
} from '../api'

export const workflowKeys = {
  all:    () => ['workflows'] as const,
  list:   () => [...workflowKeys.all(), 'list'] as const,
  detail: (id: string) => [...workflowKeys.all(), 'detail', id] as const,
  runs:   (id: string) => [...workflowKeys.all(), 'runs', id] as const,
  run:    (runId: string) => [...workflowKeys.all(), 'run', runId] as const,
}

export function useWorkflowsQuery() {
  return useQuery({ queryKey: workflowKeys.list(), queryFn: fetchWorkflows })
}

export function useWorkflowQuery(id: string) {
  return useQuery({
    queryKey: workflowKeys.detail(id),
    queryFn: () => fetchWorkflow(id),
    enabled: !!id,
  })
}

// refetchInterval self-adjusts: 2s when a run is active (queued or running), disabled otherwise
export function useWorkflowRunsQuery(workflowId: string) {
  return useQuery({
    queryKey: workflowKeys.runs(workflowId),
    queryFn: () => fetchWorkflowRuns(workflowId),
    enabled: !!workflowId,
    refetchInterval: (query) => {
      const hasActive = query.state.data?.some(
        (r) => r.status === 'running' || r.status === 'queued',
      )
      return hasActive ? 2_000 : false
    },
  })
}

export function useWorkflowRunQuery(runId: string) {
  return useQuery({
    queryKey: workflowKeys.run(runId),
    queryFn: () => fetchWorkflowRun(runId),
    enabled: !!runId,
    // Also poll the selected run detail when active
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status === 'running' || status === 'queued' ? 2_000 : false
    },
  })
}

export function useStartWorkflowRunMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      workflowId,
      payload,
    }: {
      workflowId: string
      payload?: { input?: string; triggeredBy?: string }
    }) => startWorkflowRun(workflowId, payload ?? {}),
    onSuccess: (_data, { workflowId }) =>
      queryClient.invalidateQueries({ queryKey: workflowKeys.runs(workflowId) }),
  })
}

export function useCancelWorkflowRunMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: cancelWorkflowRun,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: workflowKeys.all() }),
  })
}
