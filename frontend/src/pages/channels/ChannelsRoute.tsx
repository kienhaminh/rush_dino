import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { fetchConfig, fetchCredentials, patchConfig, patchCredentials } from '@/lib/api';
import type { AppConfigView, CredentialsView } from '@/lib/types';
import {
  ChannelsPage,
  type ChannelConfigAction,
  type ChannelDetailConfigPatch,
  type ChannelKey,
  type ChannelUiSettings,
  type ChannelsStatusSnapshot,
} from './ChannelsPage';
import { ChannelSettingsPage } from './ChannelSettingsPage';

const CHANNEL_UI_SETTINGS_KEY = 'rushdino.channels.ui-settings.v1';
const CHANNEL_ENABLED_OVERRIDES_KEY = 'rushdino.channels.enabled-overrides.v1';

type ChannelSettingsState = Partial<Record<ChannelKey, ChannelUiSettings>>;
type ChannelEnabledOverrides = Partial<Record<ChannelKey, boolean>>;

function hasCredential(value: string | undefined): boolean {
  return Boolean(value && value.trim().length > 0);
}

function loadJsonRecord<T extends object>(key: string): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {} as T;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed as T;
  } catch {
    // Ignore malformed storage values.
  }
  return {} as T;
}

function saveJsonRecord(key: string, value: object) {
  localStorage.setItem(key, JSON.stringify(value));
}

function buildSnapshot(
  config: AppConfigView | null,
  credentials: CredentialsView | null,
  overrides: ChannelEnabledOverrides,
): ChannelsStatusSnapshot | null {
  if (!config || !credentials) return null;

  const timestamp = Date.now();
  const status = (enabled: boolean, configured: boolean) => ({
    connected: enabled && configured,
    configured,
    running: enabled,
    lastStartAt: enabled ? timestamp : null,
    lastProbeAt: timestamp,
  });

  const virtualStatus = (channel: ChannelKey) => {
    const enabled = Boolean(overrides[channel]);
    return status(enabled, enabled);
  };

  const gateway = config.gateway;
  const telegramConfigured = hasCredential(credentials.telegram_bot_token);
  const discordConfigured = hasCredential(credentials.discord_bot_token);
  const slackConfigured =
    hasCredential(credentials.slack_bot_token) && hasCredential(credentials.slack_app_token);

  return {
    channelMeta: [],
    channelAccounts: {},
    channels: {
      telegram: {
        ...status(gateway.telegram.enabled, telegramConfigured),
        mode: 'polling',
      },
      discord: status(gateway.discord.enabled, discordConfigured),
      slack: status(gateway.slack.enabled, slackConfigured),
      whatsapp: virtualStatus('whatsapp'),
      googlechat: virtualStatus('googlechat'),
      signal: virtualStatus('signal'),
      imessage: virtualStatus('imessage'),
      nostr: virtualStatus('nostr'),
    },
  };
}

function isPersistedGatewayChannel(
  channel: ChannelKey,
): channel is 'telegram' | 'discord' | 'slack' {
  return channel === 'telegram' || channel === 'discord' || channel === 'slack';
}

function isChannelKey(value: string | undefined): value is ChannelKey {
  return (
    value === 'whatsapp' ||
    value === 'telegram' ||
    value === 'discord' ||
    value === 'googlechat' ||
    value === 'slack' ||
    value === 'signal' ||
    value === 'imessage' ||
    value === 'nostr'
  );
}

export function ChannelsRoute() {
  const navigate = useNavigate();
  const params = useParams<{ channel?: string }>();
  const routeChannel = params.channel;

  const [config, setConfig] = useState<AppConfigView | null>(null);
  const [credentials, setCredentials] = useState<CredentialsView | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastSuccessAt, setLastSuccessAt] = useState<number | null>(null);

  const [channelConfigSaving, setChannelConfigSaving] = useState(false);
  const [channelUiSettings, setChannelUiSettings] = useState<ChannelSettingsState>(() =>
    loadJsonRecord<ChannelSettingsState>(CHANNEL_UI_SETTINGS_KEY),
  );
  const [channelEnabledOverrides, setChannelEnabledOverrides] = useState<ChannelEnabledOverrides>(
    () => loadJsonRecord<ChannelEnabledOverrides>(CHANNEL_ENABLED_OVERRIDES_KEY),
  );
  const hasLoadedInitialDataRef = useRef(false);

  const snapshot = useMemo(
    () => buildSnapshot(config, credentials, channelEnabledOverrides),
    [config, credentials, channelEnabledOverrides],
  );

  useEffect(() => {
    saveJsonRecord(CHANNEL_UI_SETTINGS_KEY, channelUiSettings);
  }, [channelUiSettings]);

  useEffect(() => {
    saveJsonRecord(CHANNEL_ENABLED_OVERRIDES_KEY, channelEnabledOverrides);
  }, [channelEnabledOverrides]);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const [nextConfig, nextCredentials] = await Promise.all([fetchConfig(), fetchCredentials()]);
      setConfig(nextConfig);
      setCredentials(nextCredentials);
      setLastError(null);
      setLastSuccessAt(Date.now());
    } catch (err) {
      setLastError(err instanceof Error ? err.message : 'Failed to load channels state.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (hasLoadedInitialDataRef.current) return;
    hasLoadedInitialDataRef.current = true;
    void refresh();
  }, [refresh]);

  const handleChannelToggle = useCallback(
    async (channel: ChannelKey, enabled: boolean) => {
      if (!config) return;

      if (!isPersistedGatewayChannel(channel)) {
        setChannelEnabledOverrides((prev) => ({ ...prev, [channel]: enabled }));
        toast.success(`${enabled ? 'Enabled' : 'Disabled'} ${channel} for this UI session.`);
        return;
      }

      try {
        setChannelConfigSaving(true);
        const nextConfig = await patchConfig({
          gateway: {
            ...config.gateway,
            [channel]: { enabled },
          },
        });
        setConfig(nextConfig);
        setLastSuccessAt(Date.now());
        setLastError(null);
        toast.success(`${enabled ? 'Enabled' : 'Disabled'} ${channel} channel.`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : `Failed to toggle ${channel} channel.`);
      } finally {
        setChannelConfigSaving(false);
      }
    },
    [config],
  );

  const handleChannelConfigAction = useCallback(
    async (channel: ChannelKey, patch: ChannelDetailConfigPatch, action: ChannelConfigAction) => {
      if (!config) {
        toast.error('Configuration is still loading. Please wait and try again.');
        return;
      }

      if (patch.uiSettings) {
        setChannelUiSettings((prev) => ({ ...prev, [channel]: patch.uiSettings }));
      }

      if (action === 'test') {
        if (
          channel === 'telegram' &&
          !hasCredential(patch.telegramBotToken ?? credentials?.telegram_bot_token)
        ) {
          toast.error('Telegram test failed: bot token is missing.');
          return;
        }
        if (
          channel === 'discord' &&
          !hasCredential(patch.discordBotToken ?? credentials?.discord_bot_token)
        ) {
          toast.error('Discord test failed: bot token is missing.');
          return;
        }
        if (
          channel === 'slack' &&
          (!hasCredential(patch.slackBotToken ?? credentials?.slack_bot_token) ||
            !hasCredential(patch.slackAppToken ?? credentials?.slack_app_token))
        ) {
          toast.error('Slack test failed: both bot and app tokens are required.');
          return;
        }
        toast.info(
          `Connection test passed local validation for ${channel}. Use Save or Connect to apply.`,
        );
        return;
      }

      const requestedEnabled = action === 'connect' ? true : patch.enabled;

      if (!isPersistedGatewayChannel(channel)) {
        if (typeof requestedEnabled === 'boolean') {
          setChannelEnabledOverrides((prev) => ({ ...prev, [channel]: requestedEnabled }));
        }
        setLastSuccessAt(Date.now());
        toast.success(`Saved ${channel} detail configuration.`);
        return;
      }

      const configPatch: Partial<AppConfigView> = {};
      const credentialsPatch: Partial<CredentialsView> = {};

      if (typeof requestedEnabled === 'boolean') {
        configPatch.gateway = {
          ...config.gateway,
          [channel]: { enabled: requestedEnabled },
        };
      }
      if (patch.telegramBotToken != null) {
        credentialsPatch.telegram_bot_token = patch.telegramBotToken;
      }
      if (patch.discordBotToken != null) {
        credentialsPatch.discord_bot_token = patch.discordBotToken;
      }
      if (patch.slackBotToken != null) {
        credentialsPatch.slack_bot_token = patch.slackBotToken;
      }
      if (patch.slackAppToken != null) {
        credentialsPatch.slack_app_token = patch.slackAppToken;
      }

      const hasConfigPatch = Object.keys(configPatch).length > 0;
      const hasCredentialsPatch = Object.keys(credentialsPatch).length > 0;
      const hasUiPatch = Boolean(patch.uiSettings);

      if (!hasConfigPatch && !hasCredentialsPatch) {
        setLastSuccessAt(Date.now());
        if (hasUiPatch) {
          toast.success(`Saved ${channel} UI configuration.`);
        } else {
          toast.info('No fields were changed.');
        }
        return;
      }

      try {
        setChannelConfigSaving(true);
        const [nextConfig, nextCredentials] = await Promise.all([
          hasConfigPatch ? patchConfig(configPatch) : Promise.resolve(config),
          hasCredentialsPatch ? patchCredentials(credentialsPatch) : Promise.resolve(credentials),
        ]);
        if (nextConfig) setConfig(nextConfig);
        if (nextCredentials) setCredentials(nextCredentials);
        setLastSuccessAt(Date.now());
        setLastError(null);
        if (action === 'connect') {
          toast.success(`${channel} configuration saved and channel connected.`);
        } else {
          toast.success(`${channel} configuration saved.`);
        }
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : `Failed to ${action} ${channel} configuration.`,
        );
      } finally {
        setChannelConfigSaving(false);
      }
    },
    [config, credentials],
  );

  const openChannelConfig = useCallback(
    (channel: ChannelKey) => {
      navigate(`/channels/${channel}/settings`);
    },
    [navigate],
  );

  const closeChannelConfig = useCallback(() => {
    navigate('/channels');
  }, [navigate]);

  if (routeChannel && !isChannelKey(routeChannel)) {
    return <Navigate to="/channels" replace />;
  }

  if (routeChannel && isChannelKey(routeChannel)) {
    const status = snapshot?.channels?.[routeChannel] ?? {};
    return (
      <ChannelSettingsPage
        key={routeChannel}
        channel={routeChannel}
        status={status}
        config={config}
        credentials={credentials}
        settings={channelUiSettings[routeChannel]}
        saving={channelConfigSaving}
        loading={loading}
        lastError={lastError}
        onAction={handleChannelConfigAction}
        onBack={closeChannelConfig}
      />
    );
  }

  return (
    <ChannelsPage
      connected={!lastError}
      loading={loading}
      snapshot={snapshot}
      lastError={lastError}
      lastSuccessAt={lastSuccessAt}
      appConfig={config}
      credentials={credentials}
      channelConfigSaving={channelConfigSaving}
      channelUiSettings={channelUiSettings}
      nostrProfileFormState={null}
      nostrProfileAccountId={null}
      onRefresh={refresh}
      onChannelToggle={handleChannelToggle}
      onChannelConfigAction={handleChannelConfigAction}
      onOpenChannelConfig={openChannelConfig}
      onNostrProfileEdit={() => {}}
      onNostrProfileFieldChange={() => {}}
      onNostrProfileSave={() => {}}
      onNostrProfileImport={() => {}}
      onNostrProfileCancel={() => {}}
      onNostrProfileToggleAdvanced={() => {}}
    />
  );
}
