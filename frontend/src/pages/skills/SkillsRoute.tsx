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

  const handleSave = async (
    name: string,
    patch: { description: string; instructions: string; tools: string[] },
  ) => {
    setSaving(true);
    try {
      await upsertSkill({ name, ...patch });
      toast.success('Skill saved.');
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
      saving={saving}
      onSave={(name, patch) => void handleSave(name, patch)}
      onRefresh={() => void load()}
      onDelete={(name) => void handleDelete(name)}
    />
  );
}
