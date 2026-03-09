import React, { useState } from 'react';
import { SearchIcon, RefreshCwIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import type { AppConfigView, ChannelAccessConfig, CredentialsView } from '@/lib/types';
import { WhatsAppCard } from './whatsapp-card';
import { TelegramCard } from './telegram-card';
import { DiscordCard } from './discord-card';
import { NostrCard } from './nostr-card';
import { GenericChannelCard } from './generic-channel-card';

export type ChannelsStatusSnapshot = any;
export type ChannelKey =
  | 'whatsapp'
  | 'telegram'
  | 'discord'
  | 'googlechat'
  | 'slack'
  | 'signal'
  | 'imessage'
  | 'nostr';

export type ChannelConfigAction = 'save' | 'connect' | 'test';

export type ChannelUiSettings = {
  values?: Record<string, unknown>;
  // Legacy fields retained for backward-compatible local storage migration.
  allowList?: string;
  permissions?: {
    readMessages?: boolean;
    writeMessages?: boolean;
    updateMessages?: boolean;
    deleteMessages?: boolean;
  };
};

export type ChannelDetailConfigPatch = {
  enabled?: boolean;
  telegramNativeStreaming?: boolean;
  telegramBotToken?: string;
  discordBotToken?: string;
  slackBotToken?: string;
  slackAppToken?: string;
  gatewayAccess?: ChannelAccessConfig;
  uiSettings?: ChannelUiSettings;
};

export type ChannelsProps = {
  connected: boolean;
  loading: boolean;
  snapshot: ChannelsStatusSnapshot | null;
  lastError: string | null;
  lastSuccessAt: number | null;
  appConfig: AppConfigView | null;
  credentials: CredentialsView | null;
  channelConfigSaving: boolean;
  channelUiSettings: Partial<Record<ChannelKey, ChannelUiSettings>>;
  nostrProfileFormState: 'loading' | 'error' | 'ready' | null;
  nostrProfileAccountId: string | null;
  onRefresh: (probe: boolean) => void;
  onChannelToggle: (channel: ChannelKey, enabled: boolean) => void;
  onChannelConfigAction: (
    channel: ChannelKey,
    patch: ChannelDetailConfigPatch,
    action: ChannelConfigAction,
  ) => void;
  onOpenChannelConfig: (channel: ChannelKey) => void;
  onNostrProfileEdit: (accountId: string, profile: unknown) => void;
  onNostrProfileFieldChange: (field: string, value: string) => void;
  onNostrProfileSave: () => void;
  onNostrProfileImport: (pubkey?: string) => void;
  onNostrProfileCancel: () => void;
  onNostrProfileToggleAdvanced: () => void;
};

export function ChannelsPage(props: ChannelsProps) {
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('all');

  const channelData = props.snapshot?.channels || {};
  const channelAccounts = props.snapshot?.channelAccounts || {};

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
    <div className="flex flex-col h-full bg-background min-h-[calc(100vh-72px)] p-6 md:p-8 overflow-y-auto w-full">
      <div className="w-full space-y-8">
        <div className="flex justify-between items-center pb-2">
          <p className="text-muted-foreground mt-2 text-sm max-w-xl">
            Last success:{' '}
            {props.lastSuccessAt ? new Date(props.lastSuccessAt).toLocaleTimeString() : 'n/a'}
          </p>
          <div className="flex items-center gap-3">
            <button
              className="flex items-center gap-2 bg-background border border-border hover:bg-secondary transition-colors h-9 px-4 rounded font-medium text-sm disabled:opacity-60"
              onClick={() => props.onRefresh(false)}
              disabled={props.loading}
            >
              <RefreshCwIcon className="w-4 h-4" />
              Refresh
            </button>
          </div>
        </div>

        {props.lastError && (
          <div className="bg-destructive/10 text-destructive border border-destructive/20 p-4 rounded-md text-sm mb-6">
            {props.lastError}
          </div>
        )}

        <div className="flex gap-4 items-center mb-6">
          <div className="relative flex-1 max-w-md">
            <SearchIcon className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search channels..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-card border-border"
            />
          </div>
          <div className="flex bg-muted p-1 rounded-md">
            {['all', 'connected', 'disconnected'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-1.5 text-xs font-medium rounded capitalize transition-all ${activeTab === tab ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {orderedChannels
            .filter(
              (channel) =>
                channel.includes(search.toLowerCase()) &&
                (activeTab === 'all' ||
                  (activeTab === 'connected' && channelData[channel]?.connected) ||
                  (activeTab === 'disconnected' && !channelData[channel]?.connected)),
            )
            .map((channel) => {
              const status = channelData[channel] || {};
              const accounts = channelAccounts[channel] || [];
              const running = Boolean(status?.running);
              const handleToggle = () => props.onChannelToggle(channel, !running);

              switch (channel) {
                case 'whatsapp':
                  return (
                    <WhatsAppCard
                      key={channel}
                      whatsapp={status}
                      onConfigure={() => props.onOpenChannelConfig(channel)}
                      onToggleEnabled={handleToggle}
                      enabled={running}
                    />
                  );
                case 'telegram':
                  return (
                    <TelegramCard
                      key={channel}
                      telegram={status}
                      accounts={accounts}
                      onConfigure={() => props.onOpenChannelConfig(channel)}
                      onToggleEnabled={handleToggle}
                      enabled={running}
                    />
                  );
                case 'discord':
                  return (
                    <DiscordCard
                      key={channel}
                      discord={status}
                      onConfigure={() => props.onOpenChannelConfig(channel)}
                      onToggleEnabled={handleToggle}
                      enabled={running}
                    />
                  );
                case 'nostr':
                  return (
                    <NostrCard
                      key={channel}
                      nostr={status}
                      accounts={accounts}
                      onConfigure={() => props.onOpenChannelConfig(channel)}
                      onToggleEnabled={handleToggle}
                      enabled={running}
                    />
                  );
                case 'googlechat':
                  return (
                    <GenericChannelCard
                      key={channel}
                      title="Google Chat"
                      description="Bot status and channel configuration."
                      status={status}
                      onConfigure={() => props.onOpenChannelConfig(channel)}
                      onToggleEnabled={handleToggle}
                      enabled={running}
                    />
                  );
                case 'slack':
                  return (
                    <GenericChannelCard
                      key={channel}
                      title="Slack"
                      description="Socket mode status and channel configuration."
                      status={status}
                      onConfigure={() => props.onOpenChannelConfig(channel)}
                      onToggleEnabled={handleToggle}
                      enabled={running}
                    />
                  );
                case 'signal':
                  return (
                    <GenericChannelCard
                      key={channel}
                      title="Signal"
                      description="Signal daemon status."
                      status={status}
                      onConfigure={() => props.onOpenChannelConfig(channel)}
                      onToggleEnabled={handleToggle}
                      enabled={running}
                    />
                  );
                case 'imessage':
                  return (
                    <GenericChannelCard
                      key={channel}
                      title="iMessage"
                      description="macOS Messages integration status."
                      status={status}
                      onConfigure={() => props.onOpenChannelConfig(channel)}
                      onToggleEnabled={handleToggle}
                      enabled={running}
                    />
                  );
                default:
                  return (
                    <GenericChannelCard
                      key={channel}
                      title={channel}
                      description="Channel details"
                      status={status}
                      onConfigure={() => props.onOpenChannelConfig(channel)}
                      onToggleEnabled={handleToggle}
                      enabled={running}
                    />
                  );
              }
            })}
        </div>
      </div>
    </div>
  );
}

export default ChannelsPage;
