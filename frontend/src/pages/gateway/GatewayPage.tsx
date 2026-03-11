import {
  AlertTriangle,
  ArrowRight,
  MessageCircle,
  Radio,
  RefreshCw,
  Send,
  Waypoints,
} from 'lucide-react';
import { Link as RouterLink } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { GatewaySummaryResponse } from '@/lib/types';
import type { GatewaySessionSummary } from '@/lib/types';
import type { ChannelKey, ChannelsStatusSnapshot } from '@/pages/channels/ChannelsPage';

type GatewayPageProps = {
  summary: GatewaySummaryResponse | null;
  gatewaySessions: GatewaySessionSummary[];
  channelSnapshot: ChannelsStatusSnapshot | null;
  loading: boolean;
  error: string | null;
  restartingChannelId: string | null;
  onRefresh: () => void;
  onRestart: (channelId: string) => void;
  onChannelToggle: (channel: ChannelKey, enabled: boolean) => void;
  onOpenChannelConfig: (channel: ChannelKey) => void;
  onResetGatewaySession: (sessionId: string) => void;
};

function channelLabel(channel: ChannelKey): string {
  switch (channel) {
    case 'googlechat':
      return 'Google Chat';
    case 'imessage':
      return 'iMessage';
    default:
      return channel.charAt(0).toUpperCase() + channel.slice(1);
  }
}

function channelDescription(channel: ChannelKey): string {
  switch (channel) {
    case 'telegram':
      return 'Bot runtime, pairing, and operator controls.';
    case 'discord':
      return 'Guild and DM runtime with pairing-aware control.';
    case 'slack':
      return 'Socket mode delivery, app auth, and workspace routing.';
    case 'whatsapp':
      return 'Linking status and inbound runtime overview.';
    case 'googlechat':
      return 'Workspace chat delivery and access posture.';
    case 'signal':
      return 'Signal daemon connectivity and messaging posture.';
    case 'imessage':
      return 'macOS Messages bridge status and control.';
    case 'nostr':
      return 'Relay-based DM runtime and account presence.';
    default:
      return 'Channel runtime and configuration controls.';
  }
}

function channelIcon(channel: ChannelKey) {
  switch (channel) {
    case 'telegram':
      return Send;
    case 'discord':
      return MessageCircle;
    default:
      return Waypoints;
  }
}

function toneForAdapter(status: string) {
  switch (status) {
    case 'connected':
      return 'border-success/30 text-success';
    case 'starting':
      return 'border-primary/30 text-primary';
    case 'degraded':
      return 'border-warning/30 text-warning';
    case 'disabled':
    case 'disconnected':
      return 'border-border/50 text-muted-foreground';
    default:
      return 'border-border/50 text-muted-foreground';
  }
}

function capabilityLabels(adapter: GatewaySummaryResponse['adapters'][number] | null | undefined) {
  if (!adapter) return [];
  const labels: string[] = [];
  if (adapter.capabilities.markdown) labels.push('Markdown');
  if (adapter.capabilities.codeBlocks) labels.push('Code blocks');
  if (adapter.capabilities.images !== 'unsupported') {
    labels.push(`Images: ${adapter.capabilities.images}`);
  }
  if (adapter.capabilities.linkButtons !== 'unsupported') {
    labels.push(`Buttons: ${adapter.capabilities.linkButtons}`);
  }
  if (!labels.length && adapter.capabilities.plainText) labels.push('Plain text');
  return labels;
}

function formatTime(value: number | string | null | undefined) {
  return value ? new Date(value).toLocaleString() : 'n/a';
}

function UnifiedChannelCard({
  channel,
  status,
  adapter,
  activity,
  restarting,
  onRestart,
  onToggle,
  onOpenDetail,
}: {
  channel: ChannelKey;
  status: any;
  adapter: GatewaySummaryResponse['adapters'][number] | null;
  activity: GatewaySummaryResponse['channelActivity'][number] | null;
  restarting: boolean;
  onRestart: (channelId: string) => void;
  onToggle: () => void;
  onOpenDetail: () => void;
}) {
  const Icon = channelIcon(channel);
  const adapterLabels = capabilityLabels(adapter);
  const runtimeTone = adapter ? toneForAdapter(adapter.status) : 'border-border/50 text-muted-foreground';
  const summaryPairs = [
    { label: 'Configured', value: status?.configured ? 'Yes' : 'No' },
    { label: 'Running', value: status?.running ? 'Yes' : 'No' },
    { label: 'Connected', value: status?.connected ? 'Yes' : 'No' },
    { label: 'Mode', value: status?.mode ?? 'n/a' },
    { label: 'Sessions', value: String(activity?.sessionCount ?? 0) },
    { label: 'Recent runs', value: String(activity?.recentRunCount ?? 0) },
  ];
  if (channel === 'telegram' || channel === 'discord') {
    summaryPairs.push(
      { label: 'Paired users', value: String(status?.pairedCount ?? 0) },
      { label: 'Pending pairing', value: String(status?.pendingPairingCount ?? 0) },
    );
  }

  return (
    <Card className="border-border/60 bg-card/85 shadow-[0_18px_42px_-36px_rgba(15,23,42,0.45)]">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-3 text-base">
              <span className="flex h-9 w-9 items-center justify-center rounded-2xl border border-border/50 bg-background/70">
                <Icon className="h-4.5 w-4.5 text-muted-foreground" />
              </span>
              <span>{channelLabel(channel)}</span>
            </CardTitle>
            <p className="max-w-xl text-xs text-muted-foreground">{channelDescription(channel)}</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Badge
              variant={status?.connected ? 'default' : 'secondary'}
              className="h-5 capitalize text-[10px]"
            >
              {status?.connected ? 'Connected' : 'Offline'}
            </Badge>
            <Badge
              variant="outline"
              className={`text-[10px] uppercase tracking-wider ${runtimeTone}`}
            >
              {adapter?.status ? adapter.status.replace('_', ' ') : 'no adapter'}
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-3">
          <div className="rounded-2xl border border-border/50 bg-background/55 p-3.5">
            <div className="grid gap-2">
              {summaryPairs.map((item) => (
                <div
                  key={`${channel}-${item.label}`}
                  className="flex items-center justify-between gap-3 border-b border-border/40 pb-1.5 last:border-b-0 last:pb-0"
                >
                  <span className="text-xs text-muted-foreground">{item.label}</span>
                  <span className="text-xs font-medium text-foreground">{item.value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-border/50 bg-background/55 p-3.5">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-muted-foreground">Reconnects</span>
                <span className="text-xs font-medium text-foreground">
                  {adapter?.reconnectCount ?? 0}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-muted-foreground">Last event</span>
                <span className="text-right text-xs font-medium text-foreground">
                  {formatTime(adapter?.lastEventAt)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-muted-foreground">Last start</span>
                <span className="text-right text-xs font-medium text-foreground">
                  {formatTime(status?.lastStartAt)}
                </span>
              </div>
              {adapterLabels.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {adapterLabels.map((label) => (
                    <Badge key={`${channel}-${label}`} variant="outline" className="text-[10px] uppercase tracking-wider">
                      {label}
                    </Badge>
                  ))}
                </div>
              )}
              {adapter?.lastError && (
                <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
                  {adapter.lastError}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/50 pt-3">
          <div className="text-xs text-muted-foreground">
            Setup and configuration are in the detail page.
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={onOpenDetail}>
              Open detail
              <ArrowRight className="ml-2 h-3.5 w-3.5" />
            </Button>
            {adapter ? (
              <Button
                variant="outline"
                size="sm"
                disabled={adapter.status === 'disabled' || restarting}
                onClick={() => onRestart(channel)}
              >
                <RefreshCw className={`mr-2 h-3.5 w-3.5 ${restarting ? 'animate-spin' : ''}`} />
                Restart
              </Button>
            ) : null}
            <Button variant="outline" size="sm" onClick={onToggle}>
              {status?.running ? 'Disable' : 'Enable'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function GatewayPage({
  summary,
  gatewaySessions,
  channelSnapshot,
  loading,
  error,
  restartingChannelId,
  onRefresh,
  onRestart,
  onChannelToggle,
  onOpenChannelConfig,
  onResetGatewaySession,
}: GatewayPageProps) {
  const adapters = summary?.adapters ?? [];
  const channelActivity = summary?.channelActivity ?? [];
  const recentFailures = summary?.recentFailures ?? [];
  const channelData = channelSnapshot?.channels || {};
  const orderedChannels: ChannelKey[] = [
    'whatsapp',
    'telegram',
    'discord',
    'googlechat',
    'slack',
    'signal',
    'imessage',
    'nostr',
  ];

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-6 overflow-y-auto bg-background px-6 py-6 md:px-8 md:py-8">
      {error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <Tabs defaultValue="overview" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList className="h-auto bg-transparent p-0">
            <TabsTrigger value="overview" className="rounded-lg px-4">
              Overview
            </TabsTrigger>
            <TabsTrigger value="channels" className="rounded-lg px-4">
              Channels
            </TabsTrigger>
          </TabsList>
          <Button onClick={onRefresh} disabled={loading} size="sm">
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        <TabsContent value="overview" className="mt-0 space-y-4">
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card className="border-border/60 bg-card/80">
              <CardContent className="flex items-center gap-4 p-5">
                <div className="rounded-2xl bg-success/10 p-3 text-success">
                  <Radio className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Connected adapters</p>
                  <p className="mt-1 text-3xl font-semibold">
                    {adapters.filter((adapter) => adapter.status === 'connected').length}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/60 bg-card/80">
              <CardContent className="flex items-center gap-4 p-5">
                <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                  <Waypoints className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Active gateway runs</p>
                  <p className="mt-1 text-3xl font-semibold">{summary?.runs.activeCount ?? 0}</p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/60 bg-card/80">
              <CardContent className="flex items-center gap-4 p-5">
                <div className="rounded-2xl bg-warning/10 p-3 text-warning">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Blocked or failed runs</p>
                  <p className="mt-1 text-3xl font-semibold">
                    {(summary?.runs.blockedCount ?? 0) + (summary?.runs.failedCount ?? 0)}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/60 bg-card/80">
              <CardContent className="flex items-center gap-4 p-5">
                <div className="rounded-2xl bg-success/10 p-3 text-success">
                  <Waypoints className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Active last hour</p>
                  <p className="mt-1 text-3xl font-semibold">{summary?.sessions.activeLastHour ?? 0}</p>
                </div>
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-4 xl:grid-cols-[1fr_1fr]">
            <Card className="border-border/60 bg-card/80">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Per-channel load</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {channelActivity.length ? (
                  channelActivity.map((activity) => (
                    <div
                      key={activity.channelId}
                      className="rounded-2xl border border-border/50 bg-background/50 px-4 py-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium uppercase tracking-[0.18em]">
                          {activity.channelId}
                        </p>
                        <span className="text-xs text-muted-foreground">
                          {activity.sessionCount} sessions
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
                        <span>{activity.recentRunCount} recent runs</span>
                        <span>{activity.activeRunCount} active</span>
                        <span>{activity.blockedRunCount} blocked</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-border/60 bg-background/40 px-4 py-10 text-sm text-muted-foreground">
                    No channel activity has been recorded yet.
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-border/60 bg-card/80">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Recent failure signals</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {recentFailures.length ? (
                  recentFailures.map((failure) => (
                    <div
                      key={`${failure.kind}-${failure.createdAt}-${failure.runId ?? failure.sessionId ?? failure.channelId ?? 'signal'}`}
                      className="rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <Badge variant="outline" className="border-destructive/30 text-[10px] uppercase tracking-wider text-destructive">
                          {failure.kind}
                        </Badge>
                        <span className="text-[11px] text-muted-foreground">
                          {new Date(failure.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-foreground">{failure.message}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {failure.runId ? (
                          <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-xs">
                            <RouterLink to="/runs">
                              Review run
                              <ArrowRight className="ml-1 h-3 w-3" />
                            </RouterLink>
                          </Button>
                        ) : null}
                        {failure.sessionId ? (
                          <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-xs">
                            <RouterLink to="/gateway">Open gateway</RouterLink>
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-border/60 bg-background/40 px-4 py-10 text-sm text-muted-foreground">
                    No gateway failures are waiting on operator attention.
                  </div>
                )}
              </CardContent>
            </Card>
          </section>

          <Card className="border-border/60 bg-card/80">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Gateway sessions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {gatewaySessions.length ? (
                gatewaySessions.map((session) => (
                  <div
                    key={session.id}
                    className="rounded-3xl border border-border/50 bg-background/50 px-4 py-4"
                  >
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold uppercase tracking-[0.18em]">
                            {session.channelId}
                          </p>
                          <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                            {session.status.replace('_', ' ')}
                          </Badge>
                          {session.pendingApprovalCount > 0 ? (
                            <Badge variant="outline" className="border-warning/30 text-[10px] uppercase tracking-wider text-warning">
                              {session.pendingApprovalCount} waiting
                            </Badge>
                          ) : null}
                        </div>
                        <div className="grid gap-1 text-sm text-muted-foreground">
                          <p className="font-mono text-[11px]">{session.id}</p>
                          <p>Sender: {session.senderId}</p>
                          <p>Conversation: {session.conversationId}</p>
                        </div>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-2xl border border-border/40 bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
                          <p className="uppercase tracking-widest">Runs</p>
                          <p className="mt-1 text-sm text-foreground">
                            {session.activeRunCount} active / {session.queuedRunCount} queued
                          </p>
                        </div>
                        <div className="rounded-2xl border border-border/40 bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
                          <p className="uppercase tracking-widest">Last active</p>
                          <p className="mt-1 text-sm text-foreground">
                            {new Date(session.lastActive).toLocaleString()}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-border/40 bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
                          <p className="uppercase tracking-widest">Delivery</p>
                          <p className="mt-1 text-sm text-foreground">
                            {session.lastDeliveryAt
                              ? new Date(session.lastDeliveryAt).toLocaleString()
                              : 'No delivery yet'}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-border/40 bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
                          <p className="uppercase tracking-widest">Last run state</p>
                          <p className="mt-1 text-sm text-foreground">
                            {session.lastRunState?.replace('_', ' ') ?? 'n/a'}
                          </p>
                        </div>
                      </div>
                    </div>

                    {session.lastError ? (
                      <div className="mt-4 rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                        {session.lastError}
                      </div>
                    ) : null}

                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button asChild variant="outline">
                        <RouterLink to="/runs">
                          <Waypoints className="mr-2 h-4 w-4" />
                          Open runs
                        </RouterLink>
                      </Button>
                      <Button
                        variant="outline"
                        className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => onResetGatewaySession(session.id)}
                      >
                        Reset session
                      </Button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-3xl border border-dashed border-border/60 bg-background/40 px-4 py-10 text-sm text-muted-foreground">
                  No gateway sessions have been created yet.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="channels" className="mt-0">
          <Card className="border-border/60 bg-card/80">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Channels</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {orderedChannels.map((channel) => {
                const status = channelData[channel] || {};
                const adapter = adapters.find((item) => item.channelId === channel) ?? null;
                const activity = channelActivity.find((item) => item.channelId === channel) ?? null;
                return (
                  <UnifiedChannelCard
                    key={channel}
                    channel={channel}
                    status={status}
                    adapter={adapter}
                    activity={activity}
                    restarting={restartingChannelId === channel}
                    onRestart={onRestart}
                    onToggle={() => onChannelToggle(channel, !Boolean(status?.running))}
                    onOpenDetail={() => onOpenChannelConfig(channel)}
                  />
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
