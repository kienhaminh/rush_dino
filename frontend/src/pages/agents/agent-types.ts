import type { SandboxPolicy } from '@/lib/types';

export type AgentPanel =
  | 'overview'
  | 'progress'
  | 'files'
  | 'tools'
  | 'skills'
  | 'channels'
  | 'cron';

export type AgentRecord = {
  id: string;
  name: string;
  emoji: string;
  isDefault: boolean;
  workspace: string;
  description: string;
  sandboxPolicy?: SandboxPolicy | null;
};

export type AgentFileRecord = {
  name: string;
  path: string;
  size: string;
  updatedAt: string;
  missing?: boolean;
  content: string;
};

export type AgentToolRecord = {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
  source: 'core' | 'plugin';
};

export type AgentToolSection = {
  id: string;
  label: string;
  tools: AgentToolRecord[];
};

export type AgentSkillRecord = {
  name: string;
  description: string;
  group: 'workspace' | 'built-in' | 'bundled';
  source: string;
  enabled: boolean;
  emoji?: string;
};

export type AgentChannelAccount = {
  accountId: string;
  name: string;
  connected: boolean;
  configured: boolean;
  enabled: boolean;
  lastError?: string;
};

export type AgentChannelRecord = {
  id: string;
  label: string;
  accounts: AgentChannelAccount[];
};

export type AgentCronStatus = {
  enabled: boolean;
  jobs: number;
  nextWake: string;
};

export type AgentCronJob = {
  id: string;
  name: string;
  description: string;
  schedule: string;
  enabled: boolean;
  nextRun: string;
  state: string;
  payload: string;
};

// ------------------------------------------------------------------
// Soul — agent personality, values, behavioral directives
// ------------------------------------------------------------------

export type AgentTrait = {
  id: string;
  label: string;
  description: string;
};

export type AgentSoulData = {
  /** Short system-level personality description shown in the header */
  persona: string;
  /** Communication style descriptor */
  tone: string;
  /** Core values the agent prioritizes */
  coreValues: string[];
  /** Behavioral traits & habits */
  traits: AgentTrait[];
  /** Raw system prompt directive text */
  systemPrompt: string;
};

// ------------------------------------------------------------------
// Memory — persistent knowledge entries for the agent
// ------------------------------------------------------------------

export type MemoryEntryType = 'fact' | 'instruction' | 'preference' | 'context';
export type MemoryImportance = 'critical' | 'high' | 'medium' | 'low';

export type AgentMemoryEntry = {
  id: string;
  content: string;
  type: MemoryEntryType;
  importance: MemoryImportance;
  createdAt: string;
  /** Optional tag or topic label */
  tag?: string;
  /** Whether this memory is currently active/used by the agent */
  active: boolean;
};

export type AgentRuntimeData = {
  files: AgentFileRecord[];
  toolsProfile: string;
  toolSections: AgentToolSection[];
  skills: AgentSkillRecord[];
  channels: AgentChannelRecord[];
  cronStatus: AgentCronStatus;
  cronJobs: AgentCronJob[];
  soul: AgentSoulData;
  memory: AgentMemoryEntry[];
};

export type AgentProgressCardStatus = 'now' | 'recent' | 'blocked';

export type AgentProgressCard = {
  id: string;
  status: AgentProgressCardStatus;
  title: string;
  sourceTool: string;
  conversationId: string;
  startedAt: string;
  completedAt: string;
  isError: boolean;
};

export type AgentProgressColumns = {
  now: AgentProgressCard[];
  recent: AgentProgressCard[];
  blocked: AgentProgressCard[];
};

export type AgentProgressSummary = {
  nowCount: number;
  recentCount: number;
  blockedCount: number;
  totalCount: number;
  lastActivityAt?: string;
};

export type AgentProgressLane = {
  agentId: string;
  name: string;
  emoji: string;
  summary: AgentProgressSummary;
  columns: AgentProgressColumns;
};

export type AgentProgressBoardResponse = {
  generatedAt: string;
  lookbackMinutes: number;
  activeWindowSeconds: number;
  lanes: AgentProgressLane[];
};
