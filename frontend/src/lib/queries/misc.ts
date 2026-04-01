import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import {
  fetchSystemSummary,
  fetchVersionCheck,
  fetchDoctorReport,
  fetchSkills,
  fetchCronJobs,
  fetchCronRuns,
  fetchDashboardAuthStatus,
} from '../api'
import type { KanbanBoardResponse } from '../../pages/kanban/kanban-types'

export const miscKeys = {
  all:        () => ['misc'] as const,
  overview:   () => [...miscKeys.all(), 'overview'] as const,
  version:    () => [...miscKeys.all(), 'version'] as const,
  doctor:     () => [...miscKeys.all(), 'doctor'] as const,
  skills:     () => [...miscKeys.all(), 'skills'] as const,
  cron:       () => [...miscKeys.all(), 'cron'] as const,
  cronRuns:   (jobIds: string[]) => [...miscKeys.all(), 'cron-runs', jobIds] as const,
  kanban:     () => [...miscKeys.all(), 'kanban'] as const,
  authStatus: () => [...miscKeys.all(), 'auth-status'] as const,
}

async function fetchKanbanBoard(): Promise<KanbanBoardResponse> {
  const response = await fetch('/api/kanban/board')
  if (!response.ok) {
    throw new Error(`Failed to load kanban board: ${response.status}`)
  }
  return response.json()
}

async function deleteKanbanTask(taskId: string): Promise<void> {
  const res = await fetch(`/api/kanban/tasks/${taskId}`, { method: 'DELETE' })
  if (!res.ok) {
    throw new Error(`Failed to delete task: ${res.status}`)
  }
}

export function useOverviewQuery() {
  return useQuery({ queryKey: miscKeys.overview(), queryFn: fetchSystemSummary })
}

export function useVersionCheckQuery() {
  return useQuery({ queryKey: miscKeys.version(), queryFn: fetchVersionCheck })
}

export function useDoctorQuery() {
  return useQuery({ queryKey: miscKeys.doctor(), queryFn: fetchDoctorReport })
}

export function useSkillsQuery() {
  return useQuery({ queryKey: miscKeys.skills(), queryFn: fetchSkills })
}

export function useCronQuery() {
  return useQuery({ queryKey: miscKeys.cron(), queryFn: fetchCronJobs })
}

// Fetches runs for all job IDs in a single query
export function useAllCronRunsQuery(jobIds: string[]) {
  return useQuery({
    queryKey: miscKeys.cronRuns(jobIds),
    queryFn: () => Promise.all(jobIds.map((id) => fetchCronRuns(id, 20))),
    enabled: jobIds.length > 0,
  })
}

// Kanban board — polls every 3s when enabled
export function useKanbanBoardQuery(enabled = true) {
  return useQuery({
    queryKey: miscKeys.kanban(),
    queryFn: fetchKanbanBoard,
    enabled,
    refetchInterval: enabled ? 3_000 : false,
  })
}

// Auth status — polls every 30s when enabled
export function useDashboardAuthStatusQuery(enabled: boolean) {
  return useQuery({
    queryKey: miscKeys.authStatus(),
    queryFn: fetchDashboardAuthStatus,
    enabled,
    refetchInterval: enabled ? 30_000 : false,
  })
}

// Kanban board hook with delete mutation
export function useKanbanBoard(enabled: boolean) {
  const queryClient = useQueryClient()
  const { data: board, isPending: loading, isRefetching: refreshing, error: queryError } = useKanbanBoardQuery(enabled)

  const deleteMutation = useMutation({
    mutationFn: deleteKanbanTask,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: miscKeys.kanban() }),
  })

  return {
    board: board ?? null,
    loading,
    refreshing,
    error: queryError?.message ?? null,
    refresh: () => void queryClient.invalidateQueries({ queryKey: miscKeys.kanban() }),
    deleteTask: (taskId: string) => deleteMutation.mutateAsync(taskId),
  }
}
