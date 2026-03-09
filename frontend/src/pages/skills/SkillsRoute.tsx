import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { deleteSkill, fetchSkills, upsertSkill } from '@/lib/api';
import type { SkillRecord } from '@/lib/types';

import { SkillsPage } from './SkillsPage';

export function SkillsRoute() {
  const [skills, setSkills] = useState<SkillRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [draft, setDraft] = useState({
    name: '',
    description: '',
    instructions: '',
    tools: '',
  });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const next = await fetchSkills();
      setSkills(next);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load skills.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleDelete = async (name: string) => {
    if (!window.confirm(`Delete skill "${name}"? This removes the local workspace skill.`)) {
      return;
    }
    try {
      await deleteSkill(name);
      toast.success('Skill deleted.');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete skill.');
    }
  };

  const resetDraft = () => {
    setDraft({
      name: '',
      description: '',
      instructions: '',
      tools: '',
    });
  };

  const handleSave = async () => {
    if (!draft.name.trim() || !draft.description.trim() || !draft.instructions.trim()) {
      toast.error('Name, description, and instructions are required.');
      return;
    }

    setSaving(true);
    try {
      await upsertSkill({
        name: draft.name.trim(),
        description: draft.description.trim(),
        instructions: draft.instructions.trim(),
        tools: draft.tools
          .split(',')
          .map((tool) => tool.trim())
          .filter(Boolean),
      });
      toast.success('Skill saved.');
      resetDraft();
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save skill.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SkillsPage
      skills={skills}
      loading={loading}
      error={error}
      filter={filter}
      onFilterChange={setFilter}
      draft={draft}
      saving={saving}
      onDraftChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
      onSave={() => {
        void handleSave();
      }}
      onResetDraft={resetDraft}
      onEdit={(skill) =>
        setDraft({
          name: skill.name,
          description: skill.description,
          instructions: skill.instructions,
          tools: skill.tools.join(', '),
        })
      }
      onRefresh={() => void load()}
      onDelete={(name) => {
        void handleDelete(name);
      }}
    />
  );
}
