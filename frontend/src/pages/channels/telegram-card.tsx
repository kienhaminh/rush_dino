import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MessageCircleIcon, SendIcon } from 'lucide-react';
import type { ChannelsProps } from './ChannelsPage';

export function TelegramCard({
  props,
  telegram,
  accounts,
}: {
  props: ChannelsProps;
  telegram?: any;
  accounts: any[];
}) {
  const formatTime = (ts: number) => new Date(ts).toLocaleString();
  const hasMultipleAccounts = accounts.length > 1;

  return (
    <Card className="bg-card border-border flex flex-col h-full hover:border-border/80 transition-colors">
      <CardHeader className="pb-3 flex flex-row justify-between items-start space-y-0 border-b border-border/50">
        <div>
          <CardTitle className="text-lg font-semibold flex items-center gap-2 capitalize">
            <SendIcon className="w-5 h-5 text-muted-foreground" />
            Telegram
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Bot status and channel configuration.
          </p>
        </div>
        <Badge
          variant={telegram?.connected ? 'default' : 'secondary'}
          className="capitalize text-[10px] h-5"
        >
          {telegram?.connected ? 'Connected' : 'Offline'}
        </Badge>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col justify-start pt-4 space-y-4">
        {hasMultipleAccounts ? (
          <div className="space-y-4 max-h-[250px] overflow-y-auto pr-2">
            {accounts.map((account, idx) => {
              const probe = account.probe as { bot?: { username?: string } } | undefined;
              const botUsername = probe?.bot?.username;
              const label = account.name || account.accountId;
              return (
                <div
                  key={idx}
                  className="bg-muted p-3 text-sm rounded-md space-y-2 border border-border/50"
                >
                  <div className="flex justify-between font-semibold border-b border-border/50 pb-2">
                    <span>{botUsername ? `@${botUsername}` : label}</span>
                    <span className="text-xs font-mono text-muted-foreground">
                      {account.accountId}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-muted-foreground">
                    <span>Configured</span>
                    <span className="font-medium text-foreground">
                      {account.configured ? 'Yes' : 'No'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-muted-foreground text-xs">
                    <span>Running</span>
                    <span className="font-medium text-foreground">
                      {account.running ? 'Yes' : 'No'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-muted-foreground text-xs">
                    <span>Last inbound</span>
                    <span className="font-medium text-foreground">
                      {account.lastInboundAt ? formatTime(account.lastInboundAt) : 'n/a'}
                    </span>
                  </div>
                  {account.lastError && (
                    <div className="text-destructive text-[10px] mt-1 p-2 bg-destructive/10 rounded">
                      {account.lastError}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-y-2 text-sm bg-muted/30 p-3 rounded-md">
            <div className="flex justify-between items-center text-muted-foreground">
              <span>Configured</span>
              <span className="font-medium text-foreground">
                {telegram?.configured ? 'Yes' : 'No'}
              </span>
            </div>
            <div className="flex justify-between items-center text-muted-foreground pl-4 border-l border-border/50">
              <span>Running</span>
              <span className="font-medium text-foreground">
                {telegram?.running ? 'Yes' : 'No'}
              </span>
            </div>
            <div className="flex justify-between items-center text-muted-foreground pt-2 border-t border-border/50 col-span-2">
              <span>Mode</span>
              <span className="font-medium text-foreground">{telegram?.mode ?? 'n/a'}</span>
            </div>
            <div className="flex justify-between items-center text-muted-foreground col-span-2 mt-1">
              <span>Last start</span>
              <span className="font-medium text-foreground">
                {telegram?.lastStartAt ? formatTime(telegram.lastStartAt) : 'n/a'}
              </span>
            </div>
            <div className="flex justify-between items-center text-muted-foreground col-span-2 mt-1">
              <span>Last probe</span>
              <span className="font-medium text-foreground">
                {telegram?.lastProbeAt ? formatTime(telegram.lastProbeAt) : 'n/a'}
              </span>
            </div>
          </div>
        )}

        {telegram?.lastError && (
          <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive text-xs rounded-md">
            {telegram.lastError}
          </div>
        )}

        {telegram?.probe && (
          <div className="p-3 bg-primary/10 border border-primary/20 text-primary text-xs rounded-md font-medium">
            Probe {telegram.probe.ok ? 'ok' : 'failed'} • {telegram.probe.status ?? ''}{' '}
            {telegram.probe.error ?? ''}
          </div>
        )}

        <div className="flex flex-wrap gap-2 w-full mt-auto pt-4">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 text-xs"
            onClick={() => props.onRefresh(true)}
          >
            Probe
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
