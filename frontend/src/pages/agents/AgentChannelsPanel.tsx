import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { AgentRuntimeData } from './agent-types';

type AgentChannelsPanelProps = {
  runtime: AgentRuntimeData;
};

export function AgentChannelsPanel({ runtime }: AgentChannelsPanelProps) {
  return (
    <Card className="bg-card border-border/50">
      <CardHeader className="flex flex-row justify-between items-start">
        <div>
          <CardTitle className="text-base">Channels</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Gateway-wide channel status snapshot scoped to this agent context.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs border-border/50 bg-transparent hover:bg-muted/50"
        >
          Refresh
        </Button>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {runtime.channels.map((channel) => (
            <div
              key={channel.id}
              className="border border-border/50 rounded-lg p-4 bg-muted/20 space-y-3"
            >
              <div className="flex items-center justify-between">
                <p className="font-semibold">{channel.label}</p>
                <p className="font-mono text-xs text-muted-foreground">{channel.id}</p>
              </div>
              <div className="space-y-2">
                {channel.accounts.map((account) => (
                  <div
                    key={account.accountId}
                    className="border border-border/50 rounded-md p-3 bg-muted/10 space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">{account.name}</p>
                      <div className="flex gap-1">
                        <Badge variant={account.connected ? 'default' : 'secondary'}>
                          {account.connected ? 'Connected' : 'Offline'}
                        </Badge>
                        {account.enabled ? (
                          <Badge variant="outline" className="border-border/50 bg-muted/40">
                            Enabled
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-border/50 bg-muted/40">
                            Disabled
                          </Badge>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground font-mono">{account.accountId}</p>
                    {account.lastError ? (
                      <p className="text-xs text-destructive">Last error: {account.lastError}</p>
                    ) : null}
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
