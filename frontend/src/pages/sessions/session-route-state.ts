export type SessionTab = 'overview' | 'prompts' | 'context' | 'runs' | 'tools';

export const SESSION_TABS: Array<{ id: SessionTab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'prompts', label: 'Prompts & Calls' },
  { id: 'context', label: 'Injected Context' },
  { id: 'runs', label: 'Runs' },
  { id: 'tools', label: 'Tools' },
];

export function getValidSessionTab(value: string | null | undefined): SessionTab {
  return SESSION_TABS.find((tab) => tab.id === value)?.id ?? 'overview';
}

export function buildSessionsPath({
  sessionId,
  tab,
}: {
  sessionId: string | null;
  tab: SessionTab;
}) {
  const params = new URLSearchParams();
  params.set('tab', tab);
  const base = sessionId ? `/sessions/${encodeURIComponent(sessionId)}` : '/sessions';
  return `${base}?${params.toString()}`;
}
