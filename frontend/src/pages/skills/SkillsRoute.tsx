import { useState } from 'react';
import { SkillsPage, type SkillStatusReport, type SkillMessageMap } from './SkillsPage';

const INITIAL_REPORT: SkillStatusReport = {
  skills: [
    {
      skillKey: 'workspace:deep-data-crawler-import',
      name: 'deep-data-crawler-import',
      description: 'Crawl recursively and package clean NDJSON for ingestion.',
      source: 'workspace',
      emoji: '🕸️',
      disabled: false,
      missing: { bins: [], env: [] },
      install: [],
      primaryEnv: null,
    },
    {
      skillKey: 'bundled:web-design-guidelines',
      name: 'web-design-guidelines',
      description: 'Audit UI quality, accessibility, and visual consistency.',
      source: 'openclaw-bundled',
      emoji: '📐',
      disabled: false,
      missing: { bins: [], env: [] },
      install: [],
      primaryEnv: null,
    },
    {
      skillKey: 'bundled:vercel-react-best-practices',
      name: 'vercel-react-best-practices',
      description: 'Apply performance patterns for React and Next.js.',
      source: 'built-in',
      emoji: '⚡',
      disabled: true,
      missing: { bins: ['node'], env: [] },
      install: [{ id: 'install-node', label: 'Install deps' }],
      primaryEnv: null,
    },
    {
      skillKey: 'bundled:github-intel',
      name: 'github-intel',
      description: 'Pull issue and PR context from GitHub for planning.',
      source: 'other',
      emoji: '🐙',
      disabled: false,
      missing: { bins: [], env: ['GITHUB_TOKEN'] },
      install: [],
      primaryEnv: 'GITHUB_TOKEN',
    },
  ],
};

export function SkillsRoute() {
  const [filter, setFilter] = useState('');
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [messages, setMessages] = useState<SkillMessageMap>({});
  const [report, setReport] = useState<SkillStatusReport>(INITIAL_REPORT);

  const handleMessage = (skillKey: string, kind: 'ok' | 'error', message: string) => {
    setMessages((current) => ({ ...current, [skillKey]: { kind, message } }));
  };

  return (
    <SkillsPage
      loading={false}
      report={report}
      error={null}
      filter={filter}
      edits={edits}
      busyKey={busyKey}
      messages={messages}
      onFilterChange={setFilter}
      onRefresh={() => {}}
      onToggle={(skillKey, enabled) => {
        setReport((current: any) => ({
          ...current,
          skills: (current.skills ?? []).map((entry: any) =>
            entry.skillKey === skillKey ? { ...entry, disabled: !enabled } : entry,
          ),
        }));
        handleMessage(
          skillKey,
          'ok',
          enabled ? 'Skill enabled in local draft.' : 'Skill disabled in local draft.',
        );
      }}
      onEdit={(skillKey, value) => {
        setEdits((current) => ({ ...current, [skillKey]: value }));
      }}
      onSaveKey={(skillKey) => {
        const value = edits[skillKey]?.trim();
        if (!value) {
          handleMessage(skillKey, 'error', 'API key is empty.');
          return;
        }
        setBusyKey(skillKey);
        window.setTimeout(() => {
          setBusyKey(null);
          handleMessage(skillKey, 'ok', 'API key saved in local draft.');
        }, 300);
      }}
      onInstall={(skillKey, name) => {
        setBusyKey(skillKey);
        window.setTimeout(() => {
          setBusyKey(null);
          handleMessage(skillKey, 'ok', `Installed dependencies for ${name} (mock).`);
        }, 500);
      }}
    />
  );
}
