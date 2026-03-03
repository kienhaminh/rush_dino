export type AgentPanel = 'overview' | 'files' | 'tools' | 'skills' | 'channels' | 'cron';

export type AgentRecord = {
  id: string;
  name: string;
  emoji: string;
  isDefault: boolean;
  workspace: string;
  model: string;
  description: string;
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

export type AgentRuntimeData = {
  files: AgentFileRecord[];
  toolsProfile: string;
  toolSections: AgentToolSection[];
  skills: AgentSkillRecord[];
  channels: AgentChannelRecord[];
  cronStatus: AgentCronStatus;
  cronJobs: AgentCronJob[];
};
