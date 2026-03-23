import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { LayoutGrid, Network } from 'lucide-react';

import { deleteSkill, fetchSkills, upsertSkill } from '@/lib/api';
import type { SkillRecord } from '@/lib/types';
import { cn } from '@/lib/utils';

import { SkillsPage } from './SkillsPage';
import { SkillGraphView } from './SkillGraphView';

type ViewMode = 'list' | 'graph';

export function SkillsRoute() {
  const [viewMode, setViewMode] = useState<ViewMode>('list');
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
    <div className="flex-1 min-w-0 h-full overflow-y-auto bg-background flex flex-col">
      {/* View mode toggle */}
      <div className="flex items-center gap-2 px-6 pt-6 md:px-8 md:pt-8">
        <div className="flex items-center rounded-lg border border-border/50 p-0.5">
          <button
            type="button"
            onClick={() => setViewMode('list')}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              viewMode === 'list'
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <LayoutGrid size={14} />
            List
          </button>
          <button
            type="button"
            onClick={() => setViewMode('graph')}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              viewMode === 'graph'
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Network size={14} />
            Graph
          </button>
        </div>
      </div>

      {viewMode === 'list' ? (
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
      ) : (
        <div className="flex-1 px-6 pb-6 md:px-8 md:pb-8">
          <SkillGraphView />
        </div>
      )}
    </div>
  );
}
