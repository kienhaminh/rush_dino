import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MessageSquareIcon } from 'lucide-react';

export function DiscordCard({
  discord,
  onConfigure,
  onToggleEnabled,
  enabled,
}: {
  discord?: any;
  onConfigure: () => void;
  onToggleEnabled: () => void;
  enabled: boolean;
}) {
  const formatTime = (ts: number) => new Date(ts).toLocaleString();

  return (
    <Card className="bg-card border-border flex flex-col h-full hover:border-border/80 transition-colors">
      <CardHeader className="pb-3 flex flex-row justify-between items-start space-y-0 border-b border-border/50">
        <div>
          <CardTitle className="text-lg font-semibold flex items-center gap-2 capitalize">
            <MessageSquareIcon className="w-5 h-5 text-muted-foreground" />
            Discord
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Bot status and channel configuration.
          </p>
        </div>
        <Badge
          variant={discord?.connected ? 'default' : 'secondary'}
          className="capitalize text-[10px] h-5"
        >
          {discord?.connected ? 'Connected' : 'Offline'}
        </Badge>
      </CardHeader>
      <CardContent className="flex-1 pt-4">
        <div className="grid grid-cols-2 gap-y-2 text-sm bg-muted/30 p-3 rounded-md">
          <div className="flex justify-between items-center text-muted-foreground">
            <span>Configured</span>
            <span className="font-medium text-foreground">
              {discord?.configured ? 'Yes' : 'No'}
            </span>
          </div>
          <div className="flex justify-between items-center text-muted-foreground pl-4 border-l border-border/50">
            <span>Running</span>
            <span className="font-medium text-foreground">{discord?.running ? 'Yes' : 'No'}</span>
          </div>
          <div className="flex justify-between items-center text-muted-foreground pt-2 border-t border-border/50 col-span-2">
            <span>Last start</span>
            <span className="font-medium text-foreground">
              {discord?.lastStartAt ? formatTime(discord.lastStartAt) : 'n/a'}
            </span>
          </div>
          <div className="flex justify-between items-center text-muted-foreground col-span-2 mt-1">
            <span>Last probe</span>
            <span className="font-medium text-foreground">
              {discord?.lastProbeAt ? formatTime(discord.lastProbeAt) : 'n/a'}
            </span>
          </div>
          <div className="flex justify-between items-center text-muted-foreground pt-2 border-t border-border/50 col-span-2">
            <span>Paired users</span>
            <span className="font-medium text-foreground">{discord?.pairedCount ?? 0}</span>
          </div>
          <div className="flex justify-between items-center text-muted-foreground col-span-2 mt-1">
            <span>Pending pairing</span>
            <span className="font-medium text-foreground">{discord?.pendingPairingCount ?? 0}</span>
          </div>
        </div>

        {discord?.lastError && (
          <div className="mt-4 p-3 bg-destructive/10 border border-destructive/20 text-destructive text-xs rounded-md">
            {discord.lastError}
          </div>
        )}
      </CardContent>

      <CardFooter className="flex gap-2 w-full pt-4 border-t border-border/50">
        <Button variant="secondary" size="sm" className="flex-1 text-xs" onClick={onConfigure}>
          Configure
        </Button>
        <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={onToggleEnabled}>
          {enabled ? 'Disable' : 'Enable'}
        </Button>
      </CardFooter>
    </Card>
  );
}
