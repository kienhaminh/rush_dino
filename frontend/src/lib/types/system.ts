import type { ChannelStatusSummary } from './channels';

export interface SystemIncidentRecord {
  id: string;
  level: string;
  target: string;
  message: string;
  createdAt: string;
}

export interface SystemSummaryResponse {
  generatedAt: string;
  status: 'healthy' | 'degraded' | string;
  uptimeSecs: number;
  activeProvider: string;
  effectiveProfileId?: string | null;
  defaultProfileId?: string | null;
  runtimeUnavailableError?: string | null;
  profilesCount: number;
  fallbackProfileIds: string[];
  channels: ChannelStatusSummary[];
  runs: {
    totalCount: number;
    activeCount: number;
    queuedCount: number;
    blockedCount: number;
    failedCount: number;
    mostRecentId?: string | null;
  };
  conversations: {
    totalCount: number;
    updatedLastHour: number;
    mostRecentId?: string | null;
    mostRecentTitle?: string | null;
  };
  security: {
    hmacAuthEnabled: boolean;
    allowedOriginsCount: number;
    sandboxEnabled: boolean;
    sandboxAllowNetwork: boolean;
    sandboxWorkspaceRoot: string;
  };
  incidents: SystemIncidentRecord[];
  agentConfig?: {
    thinkingLevel: 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'adaptive' | string;
    maxIterations: number;
    maxContextTokens: number;
  } | null;
}

export interface DoctorFinding {
  code: string;
  severity: 'error' | 'warn' | 'info' | string;
  title: string;
  detail: string;
  action: string;
  fixable: boolean;
}

export interface DoctorReportResponse {
  generatedAt: string;
  status: 'healthy' | 'attention' | 'degraded' | string;
  summary: {
    errorCount: number;
    warnCount: number;
    infoCount: number;
  };
  findings: DoctorFinding[];
}
