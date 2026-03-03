import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import type { AgentRuntimeData, AgentSkillRecord } from './agent-types';

type AgentSkillsPanelProps = {
  runtime: AgentRuntimeData;
};

type SkillGroup = AgentSkillRecord['group'];

const GROUP_LABELS: Record<SkillGroup, string> = {
  workspace: 'Workspace Skills',
  'built-in': 'Built-in Skills',
  bundled: 'Bundled Skills',
};

export function AgentSkillsPanel({ runtime }: AgentSkillsPanelProps) {
  const [skills, setSkills] = useState<AgentSkillRecord[]>(runtime.skills);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    setSkills(runtime.skills);
    setFilter('');
  }, [runtime]);

  const filtered = useMemo(() => {
    const term = filter.trim().toLowerCase();
    if (!term) return skills;
    return skills.filter((skill) =>
      [skill.name, skill.description, skill.source].join(' ').toLowerCase().includes(term),
    );
  }, [filter, skills]);

  const grouped = useMemo(
    () =>
      (['workspace', 'bundled', 'built-in'] as SkillGroup[]).map((group) => ({
        group,
        entries: filtered.filter((skill) => skill.group === group),
      })),
    [filtered],
  );

  function toggleSkill(name: string, nextEnabled: boolean) {
    setSkills((current) =>
      current.map((skill) => (skill.name === name ? { ...skill, enabled: nextEnabled } : skill)),
    );
  }

  const enabledCount = filtered.filter((skill) => skill.enabled).length;

  return (
    <Card className="bg-card border-border/70">
      <CardHeader className="flex flex-row justify-between items-start">
        <div>
          <CardTitle className="text-lg">Skills</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Skill allowlist and workspace skill visibility for this agent.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-mono border-border/50 bg-muted/40">
            {enabledCount}/{filtered.length} enabled
          </Badge>
          <Button size="sm">Save</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Input
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Search skills"
        />
        <div className="space-y-3">
          {grouped.map((entry) => (
            <div key={entry.group} className="border border-border/50 rounded-lg p-4 bg-muted/20">
              <p className="text-sm font-semibold mb-3">
                {GROUP_LABELS[entry.group]} ({entry.entries.length})
              </p>
              <div className="space-y-2">
                {entry.entries.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No skills in this group.</p>
                ) : (
                  entry.entries.map((skill) => (
                    <div key={skill.name} className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">
                          {skill.emoji ? `${skill.emoji} ` : ''}
                          {skill.name}
                        </p>
                        <p className="text-xs text-muted-foreground">{skill.description}</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={skill.enabled}
                        onChange={(event) => toggleSkill(skill.name, event.target.checked)}
                        className="h-4 w-4 mt-1"
                      />
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
