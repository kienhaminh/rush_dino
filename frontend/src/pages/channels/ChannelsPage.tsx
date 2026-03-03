import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { NetworkIcon, SearchIcon, RefreshCwIcon, MessageCircleIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';

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

export type ChannelsProps = {
  connected: boolean;
  loading: boolean;
  snapshot: ChannelsStatusSnapshot | null;
  lastError: string | null;
  lastSuccessAt: number | null;
  whatsappMessage: string | null;
  whatsappQrDataUrl: string | null;
  whatsappConnected: boolean | null;
  whatsappBusy: boolean;
  configSchema: unknown;
  configSchemaLoading: boolean;
  configForm: Record<string, unknown> | null;
  configUiHints: Record<string, unknown>;
  configSaving: boolean;
  configFormDirty: boolean;
  nostrProfileFormState: 'loading' | 'error' | 'ready' | null;
  nostrProfileAccountId: string | null;
  onRefresh: (probe: boolean) => void;
  onWhatsAppStart: (force: boolean) => void;
  onWhatsAppWait: () => void;
  onWhatsAppLogout: () => void;
  onConfigPatch: (path: Array<string | number>, value: unknown) => void;
  onConfigSave: () => void;
  onConfigReload: () => void;
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

  const channelsMeta = props.snapshot?.channelMeta || [];
  const channelData = props.snapshot?.channels || {};
  const channelAccounts = props.snapshot?.channelAccounts || {};

  const orderedChannels = [
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
            <button className="flex items-center gap-2 bg-background border border-border hover:bg-secondary transition-colors h-9 px-4 rounded font-medium text-sm">
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
              (c) =>
                c.includes(search.toLowerCase()) &&
                (activeTab === 'all' ||
                  (activeTab === 'connected' && channelData[c]?.connected) ||
                  (activeTab === 'disconnected' && !channelData[c]?.connected)),
            )
            .map((key) => {
              const status = channelData[key] || {};
              const accounts = channelAccounts[key] || [];

              switch (key) {
                case 'whatsapp':
                  return <WhatsAppCard key={key} props={props} whatsapp={status} />;
                case 'telegram':
                  return (
                    <TelegramCard key={key} props={props} telegram={status} accounts={accounts} />
                  );
                case 'discord':
                  return <DiscordCard key={key} props={props} discord={status} />;
                case 'nostr':
                  return <NostrCard key={key} props={props} nostr={status} accounts={accounts} />;
                case 'googlechat':
                  return (
                    <GenericChannelCard
                      key={key}
                      channelKey={key}
                      props={props}
                      title="Google Chat"
                      description="Bot status and channel configuration."
                      status={status}
                    />
                  );
                case 'slack':
                  return (
                    <GenericChannelCard
                      key={key}
                      channelKey={key}
                      props={props}
                      title="Slack"
                      description="Socket mode status and channel configuration."
                      status={status}
                    />
                  );
                case 'signal':
                  return (
                    <GenericChannelCard
                      key={key}
                      channelKey={key}
                      props={props}
                      title="Signal"
                      description="Signal daemon status."
                      status={status}
                      hasProbe={false}
                    />
                  );
                case 'imessage':
                  return (
                    <GenericChannelCard
                      key={key}
                      channelKey={key}
                      props={props}
                      title="iMessage"
                      description="macOS Messages integration status."
                      status={status}
                      hasProbe={false}
                    />
                  );
                default:
                  return (
                    <GenericChannelCard
                      key={key}
                      channelKey={key}
                      props={props}
                      title={key}
                      description="Channel details"
                      status={status}
                      hasProbe={false}
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
