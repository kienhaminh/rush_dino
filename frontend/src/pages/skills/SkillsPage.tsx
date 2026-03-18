import { Pencil, SearchIcon, Trash2, X, Check } from 'lucide-react';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { SkillRecord } from '@/lib/types';

type SkillsPageProps = {
  skills: SkillRecord[];
  loading: boolean;
  error: string | null;
  filter: string;
  onFilterChange: (next: string) => void;
  saving: boolean;
  onSave: (name: string, patch: { description: string; instructions: string; tools: string[] }) => void;
  onRefresh: () => void;
  onDelete: (name: string) => void;
};

export function SkillsPage({
  skills,
  loading,
  error,
  filter,
  onFilterChange,
  saving,
  onSave,
  onRefresh,
  onDelete,
}: SkillsPageProps) {
  const [editingName, setEditingName] = useState<string | null>(null);
  const [draft, setDraft] = useState({ description: '', instructions: '', tools: '' });

  const startEdit = (skill: SkillRecord) => {
    setEditingName(skill.name);
    setDraft({
      description: skill.description,
      instructions: skill.instructions,
      tools: skill.tools.join(', '),
    });
  };

  const cancelEdit = () => {
    setEditingName(null);
    setDraft({ description: '', instructions: '', tools: '' });
  };

  const commitEdit = (name: string) => {
    onSave(name, {
      description: draft.description,
      instructions: draft.instructions,
      tools: draft.tools.split(',').map((t) => t.trim()).filter(Boolean),
    });
    setEditingName(null);
  };

  const query = filter.trim().toLowerCase();
  const filtered = query
    ? skills.filter((skill) =>
        [skill.name, skill.description, skill.tools.join(' ')].join(' ').toLowerCase().includes(query),
      )
    : skills;

  return (
    <div className="flex-1 min-w-0 h-full overflow-y-auto bg-background px-6 py-6 md:px-8 md:py-8 flex flex-col gap-6 w-full">
      {error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-md flex-1 min-w-[260px]">
          <SearchIcon className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={filter}
            onChange={(e) => onFilterChange(e.target.value)}
            className="pl-9"
            placeholder="Search skills..."
          />
        </div>
        <span className="text-sm text-muted-foreground">{filtered.length} shown</span>
        <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </Button>
      </div>

      {/* Skill grid */}
      {filtered.length ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((skill) => {
            const isEditing = editingName === skill.name;

            return (
              <div
                key={skill.name}
                className={cn(
                  'group rounded-3xl border bg-card/40 transition-all duration-300',
                  isEditing
                    ? 'border-primary/40 shadow-lg shadow-primary/5'
                    : 'border-border/40 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5',
                )}
              >
                {isEditing ? (
                  <div className="p-5 space-y-3">
                    <p className="text-sm font-semibold">{skill.name}</p>
                    <Input
                      value={draft.description}
                      onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                      placeholder="Short description"
                    />
                    <Input
                      value={draft.tools}
                      onChange={(e) => setDraft((d) => ({ ...d, tools: e.target.value }))}
                      placeholder="tool_a, tool_b (optional)"
                    />
                    <Textarea
                      value={draft.instructions}
                      onChange={(e) => setDraft((d) => ({ ...d, instructions: e.target.value }))}
                      placeholder="Detailed skill instructions"
                      className="min-h-[140px]"
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => commitEdit(skill.name)} disabled={saving}>
                        <Check className="mr-1.5 h-3.5 w-3.5" />
                        {saving ? 'Saving…' : 'Save'}
                      </Button>
                      <Button size="sm" variant="outline" onClick={cancelEdit} disabled={saving}>
                        <X className="mr-1.5 h-3.5 w-3.5" />
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="p-5 flex flex-col gap-3 h-full">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold leading-tight">{skill.name}</p>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <button
                          onClick={() => startEdit(skill)}
                          className="p-1.5 rounded-lg hover:bg-primary/10 hover:text-primary transition-colors"
                          title="Edit"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={() => onDelete(skill.name)}
                          className="p-1.5 rounded-lg hover:bg-destructive/10 hover:text-destructive transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>

                    <p className="text-xs text-muted-foreground leading-relaxed flex-1">
                      {skill.description || <span className="italic opacity-50">No description</span>}
                    </p>

                    <div className="space-y-2">
                      <p className="font-mono text-[10px] text-muted-foreground/60 truncate">{skill.path}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {skill.tools.length ? (
                          skill.tools.map((tool) => (
                            <Badge key={tool} variant="secondary" className="text-[10px] uppercase tracking-wider">
                              {tool}
                            </Badge>
                          ))
                        ) : (
                          <Badge variant="outline" className="text-[10px] uppercase tracking-wider opacity-50">
                            no tool constraints
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 rounded-3xl border-2 border-dashed border-border/40 bg-card/20 text-sm text-muted-foreground">
          No workspace skills found.
        </div>
      )}
    </div>
  );
}

export default SkillsPage;
