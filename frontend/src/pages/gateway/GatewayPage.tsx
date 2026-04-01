import { ArrowRight, MessageCircle, Send, Smartphone, Waypoints, Globe } from 'lucide-react';
import { Link as RouterLink } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ChannelKey } from '@/pages/channels/ChannelsPage';

export type GatewayPageChannel = {
  channel: ChannelKey;
  label: string;
  connected: boolean;
  configured: boolean;
  lastActivityAt: string | null;
  issue: string | null;
};

type GatewayPageProps = {
  channels: GatewayPageChannel[];
  loading: boolean;
  error: string | null;
};

function channelIcon(channel: ChannelKey) {
  switch (channel) {
    case 'telegram':
      return Send;
    case 'discord':
      return MessageCircle;
    case 'webchat':
      return Globe;
    default:
      return Waypoints;
  }
}

function formatTime(value: string | null) {
  return value ? new Date(value).toLocaleString() : 'No activity yet';
}

function GatewayChannelCard({
  channel,
  label,
  connected,
  configured,
  lastActivityAt,
  issue,
}: GatewayPageChannel) {
  const Icon = channelIcon(channel);

  return (
    <Card className="border-border/60 bg-card/85 shadow-[0_18px_42px_-36px_rgba(15,23,42,0.45)]">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="flex items-center gap-3 text-base">
            <span className="flex h-9 w-9 items-center justify-center rounded-2xl border border-border/50 bg-background/70">
              <Icon className="h-4.5 w-4.5 text-muted-foreground" />
            </span>
            <span>{label}</span>
          </CardTitle>
          <Badge
            variant={connected ? 'default' : 'secondary'}
            className="h-5 uppercase tracking-wider"
          >
            {connected ? 'Connected' : 'Offline'}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="rounded-2xl border border-border/50 bg-background/55 p-3.5">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3 border-b border-border/40 pb-2">
              <span className="text-xs text-muted-foreground">Configured</span>
              <span className="text-xs font-medium text-foreground">
                {configured ? 'Configured' : 'Not configured'}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">Last activity</span>
              <span className="text-right text-xs font-medium text-foreground">
                {formatTime(lastActivityAt)}
              </span>
            </div>
          </div>
        </div>

        {issue ? <p className="text-xs text-muted-foreground">{issue}</p> : null}
      </CardContent>
    </Card>
  );
}

export function GatewayPage({ channels, loading, error }: GatewayPageProps) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-6 overflow-y-auto bg-background px-6 py-6 md:px-8 md:py-8">
      {error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <section className="rounded-[18px] border border-border/60 bg-card/75 p-6 shadow-[0_22px_46px_-38px_rgba(15,23,42,0.55)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <p className="max-w-2xl text-sm text-muted-foreground">
            Channel status is shown here. To connect or change a channel, ask the agent in
            Workspace.
          </p>

          <div className="flex items-center gap-3">
            {loading ? (
              <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Updating…
              </span>
            ) : null}
            <Button asChild size="sm">
              <RouterLink to="/">
                Open Workspace
                <ArrowRight className="ml-2 h-3.5 w-3.5" />
              </RouterLink>
            </Button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {channels.map((channel) => (
          <GatewayChannelCard key={channel.channel} {...channel} />
        ))}

        {/* Mobile — coming soon */}
        <Card className="border-border/60 bg-card/85 opacity-60 shadow-[0_18px_42px_-36px_rgba(15,23,42,0.45)]">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              <CardTitle className="flex items-center gap-3 text-base">
                <span className="flex h-9 w-9 items-center justify-center rounded-2xl border border-border/50 bg-background/70">
                  <Smartphone className="h-4.5 w-4.5 text-muted-foreground" />
                </span>
                <span>Mobile</span>
              </CardTitle>
              <Badge variant="secondary" className="h-5 uppercase tracking-wider">
                Coming Soon
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Native iOS and Android app — under development.
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
