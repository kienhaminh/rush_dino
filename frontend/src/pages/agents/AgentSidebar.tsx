import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { UserIcon, ActivityIcon, SettingsIcon, CpuIcon } from 'lucide-react';

interface AgentSidebarProps {
  agents: any[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRefresh: () => void;
  loading: boolean;
}

export function AgentSidebar({
  agents,
  selectedId,
  onSelect,
  onRefresh,
  loading,
}: AgentSidebarProps) {
  return (
    <Card className="h-full border-r border-border bg-card rounded-none flex flex-col">
      <CardHeader className="border-b border-border/50 pb-4 flex flex-row justify-between items-center">
        <div>
          <CardTitle className="text-xl font-semibold">Agent Directory</CardTitle>
          <p className="text-sm text-muted-foreground">{agents.length} configured</p>
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="px-3 py-1.5 text-xs font-medium bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 transition-colors"
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </CardHeader>
      <CardContent className="p-0 flex-1 overflow-y-auto">
        {agents.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">No agents found</div>
        ) : (
          <div className="flex flex-col">
            {agents.map((agent) => (
              <button
                key={agent.id}
                onClick={() => onSelect(agent.id)}
                className={`flex gap-3 items-center p-4 border-b border-border/50 text-left transition-colors hover:bg-muted/50 ${selectedId === agent.id ? 'bg-muted border-l-2 border-l-primary' : ''}`}
              >
                <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-lg shadow-sm border border-border">
                  {agent.emoji || '🤖'}
                </div>
                <div className="flex-1 overflow-hidden">
                  <div className="font-medium text-sm truncate flex items-center gap-2">
                    {agent.name}
                    {agent.isDefault && (
                      <Badge variant="secondary" className="text-[10px] h-4 px-1">
                        Default
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground truncate font-mono mt-0.5">
                    {agent.id}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
