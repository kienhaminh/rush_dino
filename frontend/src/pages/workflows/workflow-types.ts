export type WorkflowSource = 'manual' | 'agent';
export type WorkflowStatus = 'draft' | 'active';
export type WorkflowRunStatus = 'queued' | 'running' | 'succeeded' | 'failed';
export type WorkflowRunStepStatus = 'pending' | 'running' | 'succeeded' | 'failed';

export type WorkflowStepInput = {
  name: string;
  instructions: string;
  agentId: string;
};

export type WorkflowStep = {
  id: string;
  workflowId: string;
  position: number;
  name: string;
  instructions: string;
  agentId: string;
  createdAt: string;
  updatedAt: string;
};

export type WorkflowListItem = {
  id: string;
  name: string;
  description: string;
  source: WorkflowSource;
  status: WorkflowStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  stepCount: number;
};

export type WorkflowDetail = {
  id: string;
  name: string;
  description: string;
  source: WorkflowSource;
  status: WorkflowStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  steps: WorkflowStep[];
};

export type CreateWorkflowInput = {
  name: string;
  description?: string;
  status?: WorkflowStatus;
  steps: WorkflowStepInput[];
};

export type UpdateWorkflowInput = {
  name?: string;
  description?: string;
  status?: WorkflowStatus;
  steps?: WorkflowStepInput[];
};

export type WorkflowRunStartResponse = {
  runId: string;
  status: WorkflowRunStatus;
};

export type WorkflowRunListItem = {
  id: string;
  workflowId: string;
  status: WorkflowRunStatus;
  triggeredBy: string;
  input: string;
  error?: string;
  startedAt: string;
  completedAt?: string;
};

export type WorkflowRunStepDetail = {
  id: string;
  runId: string;
  stepId: string;
  position: number;
  stepName: string;
  agentId: string;
  status: WorkflowRunStepStatus;
  input: string;
  output?: string;
  error?: string;
  conversationId?: string;
  startedAt?: string;
  completedAt?: string;
};

export type WorkflowRunDetail = {
  id: string;
  workflowId: string;
  status: WorkflowRunStatus;
  triggeredBy: string;
  input: string;
  error?: string;
  startedAt: string;
  completedAt?: string;
  steps: WorkflowRunStepDetail[];
};
