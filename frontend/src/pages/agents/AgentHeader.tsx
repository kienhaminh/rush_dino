import React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface AgentHeaderProps {
  agent: any;
}

export function AgentHeader({ agent }: AgentHeaderProps) {
  if (!agent) return null;

  return (
    <Card className="bg-card border-border mb-6">
      <div className="p-6 flex justify-between items-start">
        <div className="flex gap-4 items-center">
          <div className="text-4xl h-16 w-16 bg-secondary flex items-center justify-center rounded-xl shadow-inner border border-border">
            {agent.emoji || '🤖'}
          </div>
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-2">
              {agent.name}
              {agent.isDefault && <Badge className="ml-2">Default</Badge>}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {agent.description || 'Agent workspace and routing.'}
            </p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs font-mono text-muted-foreground bg-muted px-2 py-1 rounded-md">
            {agent.id}
          </div>
        </div>
      </div>
    </Card>
  );
}
