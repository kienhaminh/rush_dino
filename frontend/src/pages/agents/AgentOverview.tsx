import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export function AgentOverview({ agent }: { agent: any }) {
  if (!agent) return null;

  return (
    <div className="grid grid-cols-1 gap-6">
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-lg">Agent Details</CardTitle>
          <p className="text-sm text-muted-foreground">Workspace paths and identity metadata.</p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-6 mb-8">
            <div>
              <div className="text-xs text-muted-foreground mb-1 font-medium uppercase tracking-wider">
                Workspace
              </div>
              <div className="font-mono text-sm">{agent.workspace || 'default'}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1 font-medium uppercase tracking-wider">
                Primary Model
              </div>
              <div className="font-mono text-sm">{agent.model || 'gpt-4o'}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1 font-medium uppercase tracking-wider">
                Identity Name
              </div>
              <div className="text-sm">{agent.name}</div>
            </div>
          </div>

          <div className="pt-6 border-t border-border/50">
            <h4 className="font-medium mb-4">Model Selection</h4>
            <div className="flex flex-col md:flex-row gap-4 mb-6">
              <div className="flex-1 space-y-2">
                <label className="text-xs font-medium text-muted-foreground">Primary model</label>
                <select className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">
                  <option value="gpt-4o">GPT-4o</option>
                  <option value="claude-3">Claude 3 Opus</option>
                  <option value="claude-3.5">Claude 3.5 Sonnet</option>
                </select>
              </div>
              <div className="flex-1 space-y-2">
                <label className="text-xs font-medium text-muted-foreground">
                  Fallbacks (comma-separated)
                </label>
                <Input
                  placeholder="provider/model"
                  defaultValue={agent.fallbacks?.join(', ')}
                  className="bg-background border-border"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm">
                Reload Config
              </Button>
              <Button size="sm">Save Changes</Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
