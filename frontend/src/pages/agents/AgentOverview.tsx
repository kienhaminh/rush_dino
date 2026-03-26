import React from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BrainIcon, FolderIcon, UserIcon } from 'lucide-react';

export function AgentOverview({ agent }: { agent: any }) {
  if (!agent) return null;

  return (
    <div className="space-y-6">
      {/* Identity Info Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-lg border border-border/50 bg-card p-4 space-y-1.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2">
            <FolderIcon className="w-3 h-3" />
            Workspace
          </div>
          <div className="font-mono text-sm break-all">{agent.workspace || 'default'}</div>
        </div>

        <div className="rounded-lg border border-border/50 bg-card p-4 space-y-1.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2">
            <BrainIcon className="w-3 h-3" />
            Model Routing
          </div>
          <div className="font-mono text-sm">Runtime-selected</div>
          <p className="text-xs text-muted-foreground">
            Selected at runtime by the general agent.
          </p>
        </div>

        <div className="rounded-lg border border-border/50 bg-card p-4 space-y-1.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2">
            <UserIcon className="w-3 h-3" />
            Identity
          </div>
          <div className="text-sm font-medium">{agent.name}</div>
          {agent.isDefault && (
            <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
              Default Agent
            </Badge>
          )}
        </div>
      </div>

      {/* Description */}
      {agent.description && (
        <div className="rounded-lg border border-border/50 bg-card p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2">
            Description
          </p>
          <p className="text-sm text-foreground/80">{agent.description}</p>
        </div>
      )}

      <Card className="bg-card border-border/50">
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Model Selection</CardTitle>
          <p className="text-sm text-muted-foreground">
            Agents no longer store a primary model or fallback chain.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-border/50 bg-background/60 p-4">
            <p className="text-sm text-foreground/85">
              The general agent chooses the suitable model at run time based on the task,
              available tools, and current provider configuration.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
