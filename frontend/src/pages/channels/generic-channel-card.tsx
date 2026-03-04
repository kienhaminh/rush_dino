import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MessageCircleIcon } from 'lucide-react';

export function GenericChannelCard({
  title,
  description,
  status,
  onConfigure,
  onToggleEnabled,
  enabled,
}: {
  title: string;
  description: string;
  status: any;
  onConfigure: () => void;
  onToggleEnabled: () => void;
  enabled: boolean;
}) {
  const formatTime = (ts: number | null | undefined) =>
    ts ? new Date(ts).toLocaleString() : 'n/a';

  return (
    <Card className="bg-card border-border flex flex-col h-full hover:border-border/80 transition-colors">
      <CardHeader className="pb-3 flex flex-row justify-between items-start space-y-0 border-b border-border/50">
        <div>
          <CardTitle className="text-lg font-semibold flex items-center gap-2 capitalize">
            <MessageCircleIcon className="w-5 h-5 text-muted-foreground" />
            {title}
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        </div>
        <Badge
          variant={status?.connected ? 'default' : 'secondary'}
          className="capitalize text-[10px] h-5"
        >
          {status?.connected ? 'Connected' : 'Offline'}
        </Badge>
      </CardHeader>

      <CardContent className="flex-1 pt-4">
        <div className="grid grid-cols-2 gap-y-2 text-sm bg-muted/30 p-3 rounded-md">
          <div className="flex justify-between items-center text-muted-foreground">
            <span>Configured</span>
            <span className="font-medium text-foreground">{status?.configured ? 'Yes' : 'No'}</span>
          </div>
          <div className="flex justify-between items-center text-muted-foreground pl-4 border-l border-border/50">
            <span>Running</span>
            <span className="font-medium text-foreground">{status?.running ? 'Yes' : 'No'}</span>
          </div>
          <div className="flex justify-between items-center text-muted-foreground pt-2 border-t border-border/50 col-span-2">
            <span>Last start</span>
            <span className="font-medium text-foreground">{formatTime(status?.lastStartAt)}</span>
          </div>
          <div className="flex justify-between items-center text-muted-foreground col-span-2 mt-1">
            <span>Last probe</span>
            <span className="font-medium text-foreground">{formatTime(status?.lastProbeAt)}</span>
          </div>
        </div>

        {status?.lastError && (
          <div className="mt-4 p-3 bg-destructive/10 border border-destructive/20 text-destructive text-xs rounded-md">
            {status.lastError}
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
