import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SearchIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export type SkillStatusReport = any;
export type SkillMessageMap = Record<string, any>;

export type SkillsProps = {
  loading: boolean;
  report: SkillStatusReport | null;
  error: string | null;
  filter: string;
  edits: Record<string, string>;
  busyKey: string | null;
  messages: SkillMessageMap;
  onFilterChange: (next: string) => void;
  onRefresh: () => void;
  onToggle: (skillKey: string, enabled: boolean) => void;
  onEdit: (skillKey: string, value: string) => void;
  onSaveKey: (skillKey: string) => void;
  onInstall: (skillKey: string, name: string, installId: string) => void;
};

export function SkillsPage(props: SkillsProps) {
  const skills = props.report?.skills ?? [];
  const filter = props.filter.trim().toLowerCase();

  const filtered = filter
    ? skills.filter((skill: any) =>
        [skill.name, skill.description, skill.source].join(' ').toLowerCase().includes(filter),
      )
    : skills;

  // Group similar to skills-grouping.ts
  const groups = [
    {
      id: 'workspace',
      label: 'Workspace',
      skills: filtered.filter((s: any) => s.source === 'workspace'),
    },
    {
      id: 'built-in',
      label: 'Built In',
      skills: filtered.filter(
        (s: any) => s.source === 'built-in' || s.source === 'openclaw-bundled',
      ),
    },
    {
      id: 'other',
      label: 'Other',
      skills: filtered.filter(
        (s: any) =>
          s.source !== 'workspace' && s.source !== 'built-in' && s.source !== 'openclaw-bundled',
      ),
    },
  ].filter((g) => g.skills.length > 0);

  return (
    <div className="flex-1 w-full min-w-0 flex flex-col h-full bg-background p-6 md:p-8 overflow-y-auto space-y-8">
        {props.error && (
          <div className="bg-destructive/10 text-destructive border border-destructive/20 p-4 rounded-md text-sm">
            {props.error}
          </div>
        )}

        <div className="flex gap-4 items-center mb-6">
          <div className="relative flex-1 max-w-md">
            <SearchIcon className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search skills by name or description..."
              value={props.filter}
              onChange={(e) => props.onFilterChange(e.target.value)}
              className="pl-9 bg-card border-border shadow-sm"
            />
          </div>
          <div className="text-sm text-muted-foreground">{filtered.length} shown</div>
          <Button disabled={props.loading} onClick={props.onRefresh} variant="outline" size="sm">
            {props.loading ? 'Loading...' : 'Refresh'}
          </Button>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center p-12 text-sm text-muted-foreground border border-dashed border-border rounded-lg bg-card/50">
            No skills found matching filter.
          </div>
        ) : (
          <div className="space-y-8">
            {groups.map((group) => (
              <div key={group.id} className="space-y-4">
                <h3 className="text-lg font-semibold border-b border-border/40 pb-2 flex items-center gap-2">
                  {group.label}
                  <Badge variant="secondary" className="text-[10px] h-5 rounded-full px-2">
                    {group.skills.length}
                  </Badge>
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                  {group.skills.map((skill: any) => {
                    const isBusy = props.busyKey === skill.skillKey;
                    const apiKey = props.edits[skill.skillKey] ?? '';
                    const msg = props.messages[skill.skillKey] ?? null;
                    const canInstall = skill.install?.length > 0 && skill.missing?.bins?.length > 0;

                    return (
                      <Card
                        key={skill.skillKey}
                        className={`bg-card border-border/70 flex flex-col hover:border-border transition-colors ${skill.disabled ? 'opacity-70' : ''}`}
                      >
                        <CardHeader className="pb-3 flex flex-row justify-between items-start space-y-0">
                          <CardTitle className="text-lg font-semibold pr-4 line-clamp-1">
                            {skill.emoji ? `${skill.emoji} ` : ''}
                            {skill.name}
                          </CardTitle>
                          <div className="flex flex-col gap-2 items-end shrink-0">
                            <Badge
                              variant={skill.disabled ? 'secondary' : 'default'}
                              className="capitalize text-[10px] h-5 tracking-wide"
                            >
                              {skill.disabled ? 'Disabled' : 'Enabled'}
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent className="flex-1 flex flex-col">
                          <p className="text-sm text-muted-foreground flex-1 mb-4 leading-relaxed line-clamp-3">
                            {skill.description}
                          </p>

                          {(skill.missing?.bins?.length > 0 || skill.missing?.env?.length > 0) && (
                            <div className="mb-4 p-2 bg-destructive/10 text-destructive text-xs rounded-md border border-destructive/20">
                              Missing dependencies or keys.
                            </div>
                          )}

                          {skill.primaryEnv && (
                            <div className="mb-4 pt-4 border-t border-border/50">
                              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                                API Key
                              </label>
                              <div className="flex gap-2">
                                <Input
                                  type="password"
                                  className="h-8 text-xs bg-background"
                                  value={apiKey}
                                  onChange={(e) => props.onEdit(skill.skillKey, e.target.value)}
                                  placeholder={`Enter ${skill.primaryEnv}`}
                                />
                                <Button
                                  size="sm"
                                  className="h-8 text-xs"
                                  disabled={isBusy || !apiKey}
                                  onClick={() => props.onSaveKey(skill.skillKey)}
                                >
                                  Save
                                </Button>
                              </div>
                            </div>
                          )}

                          {msg && (
                            <div
                              className={`mb-4 text-xs ${msg.kind === 'error' ? 'text-destructive' : 'text-emerald-500'}`}
                            >
                              {msg.message}
                            </div>
                          )}

                          <div className="flex justify-end gap-2 mt-auto pt-4 border-t border-border/50">
                            {canInstall && (
                              <Button
                                size="sm"
                                variant="secondary"
                                disabled={isBusy}
                                className="text-xs"
                                onClick={() =>
                                  props.onInstall(skill.skillKey, skill.name, skill.install[0].id)
                                }
                              >
                                {isBusy ? 'Installing...' : skill.install[0].label}
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant={skill.disabled ? 'default' : 'outline'}
                              disabled={isBusy}
                              className="text-xs w-[80px]"
                              onClick={() => props.onToggle(skill.skillKey, skill.disabled)}
                            >
                              {skill.disabled ? 'Enable' : 'Disable'}
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
    </div>
  );
}

export default SkillsPage;
