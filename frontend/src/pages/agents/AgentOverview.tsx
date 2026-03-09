import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
            Primary Model
          </div>
          <div className="font-mono text-sm">{agent.model || 'gpt-4o'}</div>
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

      <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
        <p className="text-xs font-semibold text-primary uppercase tracking-widest mb-2">
          Shared Runtime State
        </p>
        <p className="text-sm text-foreground/80">
          Soul and memory are shared across every agent. Selecting an agent changes its identity,
          tools, and workspace context, but these two panels reflect the same shared state for the
          whole runtime.
        </p>
        <div className="mt-3">
          <Button asChild size="sm" variant="outline" className="h-8 text-xs">
            <RouterLink to="/soul-memory">Open soul and memory</RouterLink>
          </Button>
        </div>
      </div>

      {/* Model Configuration */}
      <Card className="bg-card border-border/50">
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Model Configuration</CardTitle>
          <p className="text-sm text-muted-foreground">
            Primary model and fallback chain for this agent.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                Primary Model
              </label>
              <Select defaultValue="gpt-4o">
                <SelectTrigger className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">
                  <SelectValue placeholder="Select primary model" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                  <SelectItem value="claude-3">Claude 3 Opus</SelectItem>
                  <SelectItem value="claude-3.5">Claude 3.5 Sonnet</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                Fallbacks (comma-separated)
              </label>
              <Input
                placeholder="provider/model"
                defaultValue={agent.fallbacks?.join(', ')}
                className="bg-background border-border h-9"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-border/50">
            <Button variant="outline" size="sm" className="h-8 text-xs">
              Reload Config
            </Button>
            <Button size="sm" className="h-8 text-xs">
              Save Changes
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
