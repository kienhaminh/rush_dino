// Workflows API — list, fetch, start, and cancel workflow runs.

import { parseJsonOrThrow } from './client';
import type {
  WorkflowDetail,
  WorkflowListItem,
  WorkflowRunDetail,
  WorkflowRunListItem,
  WorkflowRunStartResponse,
} from '@/pages/workflows/workflow-types';

export async function fetchWorkflows(): Promise<WorkflowListItem[]> {
  const response = await fetch('/api/workflows');
  const data = await parseJsonOrThrow(response, '/api/workflows');
  return data.items ?? [];
}

export async function fetchWorkflow(workflowId: string): Promise<WorkflowDetail> {
  const endpoint = `/api/workflows/${encodeURIComponent(workflowId)}`;
  const response = await fetch(endpoint);
  return parseJsonOrThrow(response, endpoint);
}

export async function startWorkflowRun(
  workflowId: string,
  payload: { input?: string; triggeredBy?: string } = {},
): Promise<WorkflowRunStartResponse> {
  const endpoint = `/api/workflows/${encodeURIComponent(workflowId)}/runs`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow(response, endpoint);
}

export async function fetchWorkflowRuns(
  workflowId: string,
  limit = 20,
): Promise<WorkflowRunListItem[]> {
  const endpoint = `/api/workflows/${encodeURIComponent(workflowId)}/runs?limit=${limit}`;
  const response = await fetch(endpoint);
  const data = await parseJsonOrThrow(response, endpoint);
  return data.items ?? [];
}

export async function fetchWorkflowRun(runId: string): Promise<WorkflowRunDetail> {
  const endpoint = `/api/workflow-runs/${encodeURIComponent(runId)}`;
  const response = await fetch(endpoint);
  return parseJsonOrThrow(response, endpoint);
}

export async function cancelWorkflowRun(runId: string): Promise<void> {
  const endpoint = `/api/workflow-runs/${encodeURIComponent(runId)}/cancel`;
  const response = await fetch(endpoint, { method: 'POST' });
  await parseJsonOrThrow(response, endpoint);
}
