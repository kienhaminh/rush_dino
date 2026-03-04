import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SmartphoneIcon } from 'lucide-react';

export function WhatsAppCard({
  whatsapp,
  onConfigure,
  onToggleEnabled,
  enabled,
}: {
  whatsapp?: any;
  onConfigure: () => void;
  onToggleEnabled: () => void;
  enabled: boolean;
}) {
  const formatTime = (ts: number) => new Date(ts).toLocaleString();
  const formatDuration = (ms: number) => `${Math.floor(ms / 60000)}m`;

  return (
    <Card className="bg-card border-border flex flex-col h-full hover:border-border/80 transition-colors">
      <CardHeader className="pb-3 flex flex-row justify-between items-start space-y-0 border-b border-border/50">
        <div>
          <CardTitle className="text-lg font-semibold flex items-center gap-2 capitalize">
            <SmartphoneIcon className="w-5 h-5 text-muted-foreground" />
            WhatsApp
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Link WhatsApp Web and monitor connection health.
          </p>
        </div>
        <Badge
          variant={whatsapp?.connected ? 'default' : 'secondary'}
          className="capitalize text-[10px] h-5"
        >
          {whatsapp?.connected ? 'Connected' : 'Offline'}
        </Badge>
      </CardHeader>
      <CardContent className="flex-1 pt-4">
        <div className="grid grid-cols-2 gap-y-2 text-sm bg-muted/30 p-3 rounded-md">
          <div className="flex justify-between items-center text-muted-foreground">
            <span>Configured</span>
            <span className="font-medium text-foreground">
              {whatsapp?.configured ? 'Yes' : 'No'}
            </span>
          </div>
          <div className="flex justify-between items-center text-muted-foreground pl-4 border-l border-border/50">
            <span>Linked</span>
            <span className="font-medium text-foreground">{whatsapp?.linked ? 'Yes' : 'No'}</span>
          </div>
          <div className="flex justify-between items-center text-muted-foreground">
            <span>Running</span>
            <span className="font-medium text-foreground">{whatsapp?.running ? 'Yes' : 'No'}</span>
          </div>
          <div className="flex justify-between items-center text-muted-foreground pl-4 border-l border-border/50">
            <span>Auth age</span>
            <span className="font-medium text-foreground">
              {whatsapp?.authAgeMs != null ? formatDuration(whatsapp.authAgeMs) : 'n/a'}
            </span>
          </div>
          <div className="flex justify-between items-center text-muted-foreground col-span-2 mt-2 pt-2 border-t border-border/50">
            <span>Last connect</span>
            <span className="font-medium text-foreground">
              {whatsapp?.lastConnectedAt ? formatTime(whatsapp.lastConnectedAt) : 'n/a'}
            </span>
          </div>
          <div className="flex justify-between items-center text-muted-foreground col-span-2">
            <span>Last message</span>
            <span className="font-medium text-foreground">
              {whatsapp?.lastMessageAt ? formatTime(whatsapp.lastMessageAt) : 'n/a'}
            </span>
          </div>
        </div>

        {whatsapp?.lastError && (
          <div className="mt-4 p-3 bg-destructive/10 border border-destructive/20 text-destructive text-xs rounded-md">
            {whatsapp.lastError}
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
