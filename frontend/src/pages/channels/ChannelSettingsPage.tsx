import {
  AlertTriangle,
  ArrowLeftIcon,
  RadioTower,
  RefreshCw,
  Route,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { AppConfigView, ChannelPairingState, CredentialsView } from '@/lib/types';
import { cn } from '@/lib/utils';
import {
  type ChannelConfigAction,
  type ChannelDetailConfigPatch,
  type ChannelKey,
  type ChannelUiSettings,
} from './ChannelsPage';
import { ChannelPairingPanel } from './channel-pairing-panel';
import { ChannelConfigMenu } from './channel-config-menu';

type ChannelSettingsPageProps = {
  channel: ChannelKey;
  status: any;
  config: AppConfigView | null;
  credentials: CredentialsView | null;
  settings?: ChannelUiSettings;
  adapter?: any;
  activity?: any;
  saving: boolean;
  restarting?: boolean;
  loading?: boolean;
  lastError?: string | null;
  pairing?: ChannelPairingState | null;
  onAction: (
    channel: ChannelKey,
    patch: ChannelDetailConfigPatch,
    action: ChannelConfigAction,
  ) => void;
  onPairingRefresh?: (channel: 'telegram' | 'discord') => void;
  onPairingDecision?: (channel: 'telegram' | 'discord', requestId: string, approved: boolean) => void;
  onPairingRevoke?: (channel: 'telegram' | 'discord', senderId: string) => void;
  onToggleEnabled?: (channel: ChannelKey, enabled: boolean) => void;
  onRestart?: (channel: ChannelKey) => void;
  onBack: () => void;
};

function channelLabel(channel: ChannelKey): string {
  return channel === 'googlechat'
    ? 'Google Chat'
    : channel.charAt(0).toUpperCase() + channel.slice(1);
}

function detailStatusTone(status: string) {
  switch (status) {
    case 'connected':
      return 'border-success/30 bg-success/10 text-success';
    case 'starting':
      return 'border-info/30 bg-info/10 text-info';
    case 'degraded':
      return 'border-warning/30 bg-warning/10 text-warning';
    case 'disabled':
    case 'disconnected':
    default:
      return 'border-border/60 bg-muted text-muted-foreground';
  }
}

export function ChannelSettingsPage({
  channel,
  status,
  config,
  credentials,
  settings,
  adapter,
  activity,
  saving,
  restarting,
  loading,
  lastError,
  pairing,
  onPairingRefresh,
  onAction,
  onPairingDecision,
  onPairingRevoke,
  onToggleEnabled,
  onRestart,
  onBack,
}: ChannelSettingsPageProps) {
  const pairingChannel = channel === 'telegram' || channel === 'discord' ? channel : null;
  const formatTime = (value: number | string | null | undefined) =>
    value ? new Date(value).toLocaleString() : 'n/a';
  const connectionStatus =
    typeof adapter?.status === 'string'
      ? adapter.status
      : status?.connected
        ? 'connected'
        : status?.running
          ? 'degraded'
          : 'disconnected';
  const connectionLabel =
    connectionStatus === 'disconnected'
      ? 'Offline'
      : connectionStatus.charAt(0).toUpperCase() + connectionStatus.slice(1).replace('_', ' ');
  const capabilityLabels = adapter
    ? [
        adapter.capabilities?.markdown ? 'Markdown' : null,
        adapter.capabilities?.codeBlocks ? 'Code blocks' : null,
        adapter.capabilities?.images && adapter.capabilities.images !== 'unsupported'
          ? `Images: ${adapter.capabilities.images}`
          : null,
        adapter.capabilities?.linkButtons && adapter.capabilities.linkButtons !== 'unsupported'
          ? `Buttons: ${adapter.capabilities.linkButtons}`
          : null,
      ].filter(Boolean)
    : [];

  return (
    <div className="flex flex-col h-full bg-background min-h-[calc(100vh-72px)] p-6 md:p-8 overflow-y-auto w-full">
      <div className="w-full space-y-6">
        <div className="flex items-center justify-between">
          <Button variant="outline" size="sm" onClick={onBack} className="text-xs gap-1">
            <ArrowLeftIcon className="w-3.5 h-3.5" />
            Back to Gateway
          </Button>
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={cn(
                'h-8 rounded-md px-3 text-xs font-medium capitalize shadow-sm',
                detailStatusTone(connectionStatus),
              )}
            >
              {connectionLabel}
            </Badge>
            {onRestart ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onRestart(channel)}
                disabled={Boolean(restarting)}
                className="text-xs gap-1"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${restarting ? 'animate-spin' : ''}`} />
                Restart
              </Button>
            ) : null}
            {onToggleEnabled ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onToggleEnabled(channel, !Boolean(status?.running))}
                disabled={saving || Boolean(loading)}
                className="text-xs"
              >
                {status?.running ? 'Disable' : 'Enable'}
              </Button>
            ) : null}
          </div>
        </div>

        <div>
          <h2 className="text-xl font-semibold">{channelLabel(channel)} Settings</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Review runtime status, tracking, and configuration in one place.
          </p>
        </div>

        {lastError && (
          <div className="bg-destructive/10 text-destructive border border-destructive/20 p-4 rounded-md text-sm">
            {lastError}
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="border-border/60 bg-card/80 lg:col-span-1">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" />
                Status
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Configured</span>
                <span className="font-medium">{status?.configured ? 'Yes' : 'No'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Connected</span>
                <span className="font-medium">{status?.connected ? 'Yes' : 'No'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Running</span>
                <span className="font-medium">{status?.running ? 'Yes' : 'No'}</span>
              </div>
              {'mode' in (status ?? {}) && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Mode</span>
                  <span className="font-medium">{status?.mode ?? 'n/a'}</span>
                </div>
              )}
              {pairingChannel && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Paired users</span>
                    <span className="font-medium">{status?.pairedCount ?? 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Pending pairing</span>
                    <span className="font-medium">{status?.pendingPairingCount ?? 0}</span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/80 lg:col-span-1">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Route className="h-4 w-4 text-primary" />
                Tracking
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Last start</span>
                <span className="font-medium">{formatTime(status?.lastStartAt)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Last probe</span>
                <span className="font-medium">{formatTime(status?.lastProbeAt)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Recent runs</span>
                <span className="font-medium">{activity?.recentRunCount ?? 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Active runs</span>
                <span className="font-medium">{activity?.activeRunCount ?? 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Sessions</span>
                <span className="font-medium">{activity?.sessionCount ?? 0}</span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/80 lg:col-span-1">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <RadioTower className="h-4 w-4 text-primary" />
                Adapter
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">State</span>
                <span className="font-medium capitalize">
                  {adapter?.status ? adapter.status.replace('_', ' ') : 'n/a'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Reconnects</span>
                <span className="font-medium">{adapter?.reconnectCount ?? 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Last event</span>
                <span className="font-medium">{formatTime(adapter?.lastEventAt)}</span>
              </div>
              {capabilityLabels.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {capabilityLabels.map((label) => (
                    <Badge key={label} variant="outline" className="text-[10px] uppercase tracking-wider">
                      {label}
                    </Badge>
                  ))}
                </div>
              )}
              {adapter?.lastError && (
                <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>{adapter.lastError}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="border-border/60 bg-card/80">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Connection & Configuration</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="mb-4 text-sm text-muted-foreground">
              Edit the core setup, access rules, and reply behavior here. Detail pages now focus
              on the settings operators actually use.
            </p>
            <ChannelConfigMenu
              channel={channel}
              config={config}
              credentials={credentials}
              currentEnabled={Boolean(status?.running)}
              settings={settings}
              saving={saving || Boolean(loading)}
              onAction={onAction}
            />
          </CardContent>
        </Card>

        {pairingChannel && onPairingRefresh && onPairingDecision && onPairingRevoke ? (
          <ChannelPairingPanel
            channel={pairingChannel}
            pairing={pairing ?? null}
            busy={saving || Boolean(loading)}
            onRefresh={onPairingRefresh}
            onDecision={onPairingDecision}
            onRevoke={onPairingRevoke}
          />
        ) : null}
      </div>
    </div>
  );
}
