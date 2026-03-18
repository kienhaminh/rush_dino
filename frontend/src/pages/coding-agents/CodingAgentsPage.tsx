import React, { useEffect, useState } from 'react';
import { Terminal, Download, CheckCircle, XCircle, RefreshCw, Code2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AgentStatus {
  id: string;
  displayName: string;
  installed: boolean;
  binaryName: string;
  installCommand: string;
  slashCommand: string;
}

// ─── CodingAgentsPage ─────────────────────────────────────────────────────────

export function CodingAgentsPage() {
  const [agents, setAgents] = useState<AgentStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [installingIds, setInstallingIds] = useState<Set<string>>(new Set());

  const fetchAgents = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/acp/agents');
      if (res.ok) {
        const data = await res.json();
        setAgents(data.agents ?? []);
      }
    } catch (e) {
      console.error('Failed to fetch ACP agents', e);
    } finally {
      setLoading(false);
    }
  };

  const handleInstall = async (agentId: string) => {
    setInstallingIds((prev) => new Set(prev).add(agentId));
    try {
      await fetch(`/api/acp/agents/${agentId}/install`, { method: 'POST' });
      // Wait a bit then refresh status
      setTimeout(fetchAgents, 3000);
    } catch (e) {
      console.error('Install failed', e);
    } finally {
      setInstallingIds((prev) => {
        const next = new Set(prev);
        next.delete(agentId);
        return next;
      });
    }
  };

  useEffect(() => {
    fetchAgents();
  }, []);

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full bg-background overflow-hidden font-sans">
      {/* Header */}
      <div className="flex items-center justify-between px-6 h-[72px] border-b border-border/40 shrink-0">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 flex items-center justify-center rounded-lg bg-primary/10">
            <Code2 size={18} className="text-primary" />
          </div>
          <div>
            <h1 className="font-semibold text-sm">Coding Agents</h1>
            <p className="text-[11px] text-muted-foreground">ACP-enabled external coding agents</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={fetchAgents} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {agents.map((agent) => (
            <Card key={agent.id} className="relative">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <Terminal size={16} className="text-muted-foreground mt-0.5" />
                    <CardTitle className="text-sm">{agent.displayName}</CardTitle>
                  </div>
                  {agent.installed ? (
                    <Badge
                      variant="secondary"
                      className="text-[10px] bg-green-500/10 text-green-600 border-green-500/20"
                    >
                      <CheckCircle size={10} className="mr-1" />
                      Installed
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] text-muted-foreground">
                      <XCircle size={10} className="mr-1" />
                      Not installed
                    </Badge>
                  )}
                </div>
                <CardDescription className="text-[11px]">
                  Binary: <code className="font-mono">{agent.binaryName}</code>
                  {' · '}
                  Slash: <code className="font-mono">{agent.slashCommand}</code>
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="text-[10px] text-muted-foreground font-mono bg-muted/40 rounded px-2 py-1.5 mb-3 truncate">
                  {agent.installCommand}
                </div>
                {!agent.installed && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full text-xs h-7"
                    onClick={() => handleInstall(agent.id)}
                    disabled={installingIds.has(agent.id)}
                  >
                    {installingIds.has(agent.id) ? (
                      <>
                        <RefreshCw size={12} className="mr-1 animate-spin" />
                        Installing...
                      </>
                    ) : (
                      <>
                        <Download size={12} className="mr-1" />
                        Install
                      </>
                    )}
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}

          {!loading && agents.length === 0 && (
            <div className="col-span-full text-center text-sm text-muted-foreground py-12">
              ACP is not enabled. Set{' '}
              <code className="font-mono text-xs bg-muted px-1 rounded">acp.enabled = true</code>{' '}
              in your config to use coding agents.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default CodingAgentsPage;
