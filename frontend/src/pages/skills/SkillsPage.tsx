import { Pencil, Plus, SearchIcon, Trash2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { SkillRecord } from '@/lib/types';

type SkillsPageProps = {
  skills: SkillRecord[];
  loading: boolean;
  error: string | null;
  filter: string;
  onFilterChange: (next: string) => void;
  draft: {
    name: string;
    description: string;
    instructions: string;
    tools: string;
  };
  saving: boolean;
  onDraftChange: (patch: Partial<SkillsPageProps['draft']>) => void;
  onSave: () => void;
  onResetDraft: () => void;
  onEdit: (skill: SkillRecord) => void;
  onRefresh: () => void;
  onDelete: (name: string) => void;
};

export function SkillsPage({
  skills,
  loading,
  error,
  filter,
  onFilterChange,
  draft,
  saving,
  onDraftChange,
  onSave,
  onResetDraft,
  onEdit,
  onRefresh,
  onDelete,
}: SkillsPageProps) {
  const query = filter.trim().toLowerCase();
  const filtered = query
    ? skills.filter((skill) =>
        [skill.name, skill.description, skill.tools.join(' ')]
          .join(' ')
          .toLowerCase()
          .includes(query),
      )
    : skills;

  return (
    <div className="flex-1 min-w-0 h-full overflow-y-auto bg-background px-6 py-6 md:px-8 md:py-8 flex flex-col gap-6 w-full">
        <section className="rounded-[28px] border border-border/60 bg-card/70 p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              Workspace skills are now managed from the web control UI. This page reflects the
              local skill directory instead of mock bundled placeholders.
            </p>
            <Button onClick={onRefresh} disabled={loading}>
              {loading ? 'Refreshing…' : 'Refresh'}
            </Button>
          </div>
        </section>

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
        </div>

        <Card className="border-border/60 bg-card/80">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Create or edit skill</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Input
                value={draft.name}
                onChange={(event) => onDraftChange({ name: event.target.value })}
                placeholder="skill-name"
              />
              <Input
                value={draft.description}
                onChange={(event) => onDraftChange({ description: event.target.value })}
                placeholder="Short description"
              />
            </div>
            <Input
              value={draft.tools}
              onChange={(event) => onDraftChange({ tools: event.target.value })}
              placeholder="tool_a, tool_b (optional)"
            />
            <Textarea
              value={draft.instructions}
              onChange={(event) => onDraftChange({ instructions: event.target.value })}
              placeholder="Detailed skill instructions"
              className="min-h-[180px]"
            />
            <div className="flex flex-wrap gap-2">
              <Button onClick={onSave} disabled={saving}>
                <Plus className="mr-2 h-4 w-4" />
                {saving ? 'Saving…' : 'Save skill'}
              </Button>
              <Button variant="outline" onClick={onResetDraft} disabled={saving}>
                Reset
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/80">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Workspace skills</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {filtered.length ? (
              filtered.map((skill) => (
                <div
                  key={skill.name}
                  className="flex flex-col gap-4 rounded-3xl border border-border/50 bg-background/50 px-4 py-4 lg:flex-row lg:items-start lg:justify-between"
                >
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold">{skill.name}</p>
                      <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                        workspace
                      </Badge>
                    </div>
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
                  </div>

                  <Button
                    variant="outline"
                    onClick={() => onEdit(skill)}
                  >
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
              ))
            ) : (
              <div className="rounded-3xl border border-dashed border-border/60 bg-background/40 px-4 py-10 text-sm text-muted-foreground">
                No workspace skills found.
              </div>
            )}
          </CardContent>
        </Card>
    </div>
  );
}

export default SkillsPage;
