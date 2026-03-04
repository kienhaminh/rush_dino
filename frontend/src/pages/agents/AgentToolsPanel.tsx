import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { AgentRuntimeData, AgentToolSection } from './agent-types';

type AgentToolsPanelProps = {
  runtime: AgentRuntimeData;
};

export function AgentToolsPanel({ runtime }: AgentToolsPanelProps) {
  const [profile, setProfile] = useState(runtime.toolsProfile);
  const [sections, setSections] = useState<AgentToolSection[]>(runtime.toolSections);

  useEffect(() => {
    setProfile(runtime.toolsProfile);
    setSections(runtime.toolSections);
  }, [runtime]);

  const total = useMemo(() => sections.flatMap((section) => section.tools).length, [sections]);
  const enabled = useMemo(
    () => sections.flatMap((section) => section.tools).filter((tool) => tool.enabled).length,
    [sections],
  );

  function toggleTool(sectionId: string, toolId: string, nextEnabled: boolean) {
    setSections((current) =>
      current.map((section) => {
        if (section.id !== sectionId) return section;
        return {
          ...section,
          tools: section.tools.map((tool) =>
            tool.id === toolId ? { ...tool, enabled: nextEnabled } : tool,
          ),
        };
      }),
    );
  }

  return (
    <Card className="bg-card border-border/50">
      <CardHeader className="flex flex-row justify-between items-start">
        <div>
          <CardTitle className="text-base">Tool Access</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Profile and per-tool overrides for this agent.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-mono border-border/50 bg-muted/40 h-6 text-xs">
            {enabled}/{total} enabled
          </Badge>
          <Button size="sm" className="h-8 text-xs">
            Save
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          {['minimal', 'balanced', 'full'].map((preset) => (
            <Button
              key={preset}
              variant={profile === preset ? 'default' : 'outline'}
              size="sm"
              onClick={() => setProfile(preset)}
              className={
                profile === preset
                  ? 'capitalize'
                  : 'capitalize border-border/50 bg-transparent hover:bg-muted/50'
              }
            >
              {preset}
            </Button>
          ))}
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {sections.map((section) => (
            <div
              key={section.id}
              className={`border border-border/50 rounded-lg p-4 bg-muted/20 space-y-3 ${
                section.id === 'registered' ? 'xl:col-span-2' : ''
              }`}
            >
              <p className="text-sm font-semibold">{section.label}</p>
              <div
                className={
                  section.id === 'registered'
                    ? 'grid grid-cols-1 md:grid-cols-2 gap-y-3 md:gap-x-8'
                    : 'space-y-3'
                }
              >
                {section.tools.map((tool) => (
                  <div key={tool.id} className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium flex items-center gap-2">
                        {tool.label}
                        <Badge
                          variant="outline"
                          className="text-[10px] uppercase border-border/50 bg-muted/40"
                        >
                          {tool.source}
                        </Badge>
                      </p>
                      <p className="text-xs text-muted-foreground">{tool.description}</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={tool.enabled}
                      onChange={(event) => toggleTool(section.id, tool.id, event.target.checked)}
                      className="h-4 w-4 mt-1"
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
