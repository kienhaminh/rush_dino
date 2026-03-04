import { ArrowLeftIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { AppConfigView, CredentialsView } from '@/lib/types';
import {
  type ChannelConfigAction,
  type ChannelDetailConfigPatch,
  type ChannelKey,
  type ChannelUiSettings,
} from './ChannelsPage';
import { ChannelConfigMenu } from './channel-config-menu';

type ChannelSettingsPageProps = {
  channel: ChannelKey;
  status: any;
  config: AppConfigView | null;
  credentials: CredentialsView | null;
  settings?: ChannelUiSettings;
  saving: boolean;
  loading?: boolean;
  lastError?: string | null;
  onAction: (
    channel: ChannelKey,
    patch: ChannelDetailConfigPatch,
    action: ChannelConfigAction,
  ) => void;
  onBack: () => void;
};

function channelLabel(channel: ChannelKey): string {
  return channel === 'googlechat'
    ? 'Google Chat'
    : channel.charAt(0).toUpperCase() + channel.slice(1);
}

export function ChannelSettingsPage({
  channel,
  status,
  config,
  credentials,
  settings,
  saving,
  loading,
  lastError,
  onAction,
  onBack,
}: ChannelSettingsPageProps) {
  return (
    <div className="flex flex-col h-full bg-background min-h-[calc(100vh-72px)] p-6 md:p-8 overflow-y-auto w-full">
      <div className="w-full space-y-6">
        <div className="flex items-center justify-between">
          <Button variant="outline" size="sm" onClick={onBack} className="text-xs gap-1">
            <ArrowLeftIcon className="w-3.5 h-3.5" />
            Back to Channels
          </Button>
          <Badge variant={status?.connected ? 'default' : 'secondary'} className="capitalize">
            {status?.connected ? 'Connected' : 'Offline'}
          </Badge>
        </div>

        <div>
          <h2 className="text-xl font-semibold">{channelLabel(channel)} Settings</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Configure channel options and connection behavior.
          </p>
        </div>

        {lastError && (
          <div className="bg-destructive/10 text-destructive border border-destructive/20 p-4 rounded-md text-sm">
            {lastError}
          </div>
        )}

        <ChannelConfigMenu
          channel={channel}
          config={config}
          credentials={credentials}
          currentEnabled={Boolean(status?.running)}
          settings={settings}
          saving={saving || Boolean(loading)}
          onAction={onAction}
          onClose={onBack}
        />
      </div>
    </div>
  );
}
