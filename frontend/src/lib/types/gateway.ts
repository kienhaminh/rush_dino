import type { RunState } from './runs';

export type GatewayAdapterStatus =
  | 'disabled'
  | 'starting'
  | 'connected'
  | 'degraded'
  | 'disconnected';

export type GatewayRichDeliveryMode = 'native' | 'degraded' | 'unsupported';

export interface GatewayAdapterCapabilities {
  plainText: boolean;
  markdown: boolean;
  codeBlocks: boolean;
  images: GatewayRichDeliveryMode;
  linkButtons: GatewayRichDeliveryMode;
}

export interface GatewayAdapterState {
  channelId: string;
  status: GatewayAdapterStatus;
  lastEventAt?: string | null;
  lastError?: string | null;
  reconnectCount: number;
  capabilities: GatewayAdapterCapabilities;
}

export interface GatewaySessionSummary {
  id: string;
  channelId: string;
  senderId: string;
  conversationId: string;
  lastActive: string;
  lastRunId?: string | null;
  lastDeliveryAt?: string | null;
  lastError?: string | null;
  status: string;
  pendingApprovalCount: number;
  activeRunCount: number;
  queuedRunCount: number;
  lastRunState?: RunState | null;
}

export interface GatewayChannelActivity {
  channelId: string;
  sessionCount: number;
  recentRunCount: number;
  activeRunCount: number;
  blockedRunCount: number;
}

export interface GatewayFailureRecord {
  kind: string;
  channelId?: string | null;
  sessionId?: string | null;
  runId?: string | null;
  message: string;
  createdAt: string;
}

export interface GatewaySummaryResponse {
  generatedAt: string;
  adapters: GatewayAdapterState[];
  sessions: {
    totalCount: number;
    activeLastHour: number;
    mostRecentId?: string | null;
    mostRecentAt?: string | null;
  };
  runs: {
    totalCount: number;
    activeCount: number;
    blockedCount: number;
    failedCount: number;
    mostRecentId?: string | null;
  };
  channelActivity: GatewayChannelActivity[];
  recentFailures: GatewayFailureRecord[];
}
