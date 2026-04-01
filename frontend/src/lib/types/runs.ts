export type RunKind = 'assistant' | 'workflow';
export type RunState =
  | 'queued'
  | 'running'
  | 'awaiting_approval'
  | 'awaiting_input'
  | 'blocked'
  | 'completed'
  | 'failed'
  | 'aborted';

export interface RunPolicySnapshot {
  decision: string;
  approvalState: string;
  sandboxState: string;
  effectiveScope: string;
  reason?: string | null;
}

export interface RunSnapshot {
  id: string;
  kind: RunKind;
  state: RunState;
  source?: string | null;
  channelId?: string | null;
  senderId?: string | null;
  gatewaySessionId?: string | null;
  sessionId?: string | null;
  conversationId?: string | null;
  workflowId?: string | null;
  title: string;
  inputText?: string | null;
  outputText?: string | null;
  provider: string;
  model: string;
  fallbackProfileId?: string | null;
  queuePosition?: number | null;
  activeTool?: string | null;
  abortRequested: boolean;
  policy: RunPolicySnapshot;
  error?: string | null;
  createdAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
  updatedAt: string;
}

export interface RunEventRecord {
  id: string;
  runId: string;
  eventType: string;
  state?: RunState | null;
  toolName?: string | null;
  message?: string | null;
  policy: RunPolicySnapshot;
  createdAt: string;
}

export interface RunDetail {
  snapshot: RunSnapshot;
  events: RunEventRecord[];
}
