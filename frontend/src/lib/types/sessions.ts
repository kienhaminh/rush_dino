export interface SessionSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  status: 'active' | 'idle' | 'awaiting_approval' | 'awaiting_input' | 'blocked' | string;
  messageCount: number;
  lastRole?: string | null;
  lastMessagePreview?: string | null;
  pendingApprovalCount: number;
  activeRunCount: number;
  queuedRunCount: number;
  lastRunId?: string | null;
  contextWindow?: {
    provider?: string | null;
    model?: string | null;
    limitTokens?: number | null;
    promptTokens?: number | null;
    completionTokens?: number | null;
    totalTokens?: number | null;
    usageRatio?: number | null;
    measuredAt?: string | null;
  };
}
