import { Pencil, SearchIcon, Trash2, X, Check } from 'lucide-react';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-md flex-1 min-w-[260px]">
          <SearchIcon className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={filter}
            onChange={(event) => onFilterChange(event.target.value)}
            className="pl-9"
            placeholder="Search workspace skills..."
          />
        </div>
        <div className="text-sm text-muted-foreground">{filtered.length} shown</div>
        <Button variant="outline" onClick={onRefresh} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </Button>
      </div>

      <div className="space-y-3">
        {filtered.length ? (
          filtered.map((skill) => {
            const isEditing = editingName === skill.name;

            return (
              <div
                key={skill.name}
                className="rounded-3xl border border-border/50 bg-card/80 px-4 py-4"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold">{skill.name}</p>
                      <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                        workspace
                      </Badge>
                    </div>
                    {!isEditing && (
                      <>
                        <p className="text-sm text-muted-foreground">{skill.description}</p>
                        <p className="font-mono text-[11px] text-muted-foreground">{skill.path}</p>
                        <div className="flex flex-wrap gap-2">
                          {skill.tools.length ? (
                            skill.tools.map((tool) => (
                              <Badge key={tool} variant="secondary" className="text-[10px] uppercase tracking-wider">
                                {tool}
                              </Badge>
                            ))
                          ) : (
                            <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                              no tool constraints
                            </Badge>
                          )}
                        </div>
                      </>
                    )}
                  </div>

                  {!isEditing && (
                    <div className="flex gap-2 shrink-0">
                      <Button variant="outline" onClick={() => startEdit(skill)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => onDelete(skill.name)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </Button>
                    </div>
                  )}
                </div>

                {isEditing && (
                  <div className="mt-4 space-y-3">
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
                      className="min-h-[160px]"
                    />
                    <div className="flex gap-2">
                      <Button onClick={() => commitEdit(skill.name)} disabled={saving}>
                        <Check className="mr-2 h-4 w-4" />
                        {saving ? 'Saving…' : 'Save'}
                      </Button>
                      <Button variant="outline" onClick={cancelEdit} disabled={saving}>
                        <X className="mr-2 h-4 w-4" />
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div className="rounded-3xl border border-dashed border-border/60 bg-background/40 px-4 py-10 text-sm text-muted-foreground">
            No workspace skills found.
          </div>
        )}
      </div>
    </div>
  );
}

export default SkillsPage;
