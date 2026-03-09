import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  fetchChannelPairing,
  fetchConfig,
  fetchCredentials,
  patchConfig,
  patchCredentials,
  resolveChannelPairingRequest,
  revokeChannelPairedUser,
} from '@/lib/api';
import type { AppConfigView, ChannelPairingState, CredentialsView } from '@/lib/types';
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
type PairingChannel = Extract<ChannelKey, 'telegram' | 'discord'>;
type ChannelPairingStateMap = Partial<Record<PairingChannel, ChannelPairingState>>;

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
  pairing: ChannelPairingStateMap,
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
        pairedCount: pairing.telegram?.paired.length ?? 0,
        pendingPairingCount: pairing.telegram?.pending.length ?? 0,
      },
      discord: {
        ...status(gateway.discord.enabled, discordConfigured),
        pairedCount: pairing.discord?.paired.length ?? 0,
        pendingPairingCount: pairing.discord?.pending.length ?? 0,
      },
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

function supportsPairing(channel: ChannelKey): channel is PairingChannel {
  return channel === 'telegram' || channel === 'discord';
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
  const [channelPairing, setChannelPairing] = useState<ChannelPairingStateMap>({});
  const hasLoadedInitialDataRef = useRef(false);

  const snapshot = useMemo(
    () => buildSnapshot(config, credentials, channelEnabledOverrides, channelPairing),
    [config, credentials, channelEnabledOverrides, channelPairing],
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
      const [nextConfig, nextCredentials, telegramPairing, discordPairing] = await Promise.all([
        fetchConfig(),
        fetchCredentials(),
        fetchChannelPairing('telegram'),
        fetchChannelPairing('discord'),
      ]);
      setConfig(nextConfig);
      setCredentials(nextCredentials);
      setChannelPairing({
        telegram: telegramPairing,
        discord: discordPairing,
      });
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
            [channel]: {
              ...config.gateway[channel],
              enabled,
            },
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
          [channel]: {
            ...config.gateway[channel],
            enabled: requestedEnabled,
          },
        };
      }
      if (patch.gatewayAccess && (channel === 'telegram' || channel === 'discord')) {
        configPatch.gateway = {
          ...(configPatch.gateway ?? config.gateway),
          [channel]: {
            ...config.gateway[channel],
            enabled: typeof requestedEnabled === 'boolean' ? requestedEnabled : config.gateway[channel].enabled,
            access: patch.gatewayAccess,
          },
        };
      }
      if (channel === 'telegram' && typeof patch.telegramNativeStreaming === 'boolean') {
        const baseGateway = configPatch.gateway ?? config.gateway;
        configPatch.gateway = {
          ...baseGateway,
          telegram: {
            ...baseGateway.telegram,
            native_streaming: patch.telegramNativeStreaming,
          },
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

  const refreshPairingChannel = useCallback(async (channel: PairingChannel) => {
    const next = await fetchChannelPairing(channel);
    setChannelPairing((prev) => ({ ...prev, [channel]: next }));
  }, []);

  const handlePairingDecision = useCallback(
    async (channel: PairingChannel, requestId: string, approved: boolean) => {
      try {
        setChannelConfigSaving(true);
        await resolveChannelPairingRequest(channel, requestId, approved);
        await refreshPairingChannel(channel);
        toast.success(approved ? 'Pairing approved.' : 'Pairing denied.');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to resolve pairing request.');
      } finally {
        setChannelConfigSaving(false);
      }
    },
    [refreshPairingChannel],
  );

  const handlePairingRevoke = useCallback(
    async (channel: PairingChannel, senderId: string) => {
      try {
        setChannelConfigSaving(true);
        await revokeChannelPairedUser(channel, senderId);
        await refreshPairingChannel(channel);
        toast.success('Paired user revoked.');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to revoke paired user.');
      } finally {
        setChannelConfigSaving(false);
      }
    },
    [refreshPairingChannel],
  );

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
        pairing={supportsPairing(routeChannel) ? channelPairing[routeChannel] ?? null : null}
        onAction={handleChannelConfigAction}
        onPairingRefresh={supportsPairing(routeChannel) ? refreshPairingChannel : undefined}
        onPairingDecision={supportsPairing(routeChannel) ? handlePairingDecision : undefined}
        onPairingRevoke={supportsPairing(routeChannel) ? handlePairingRevoke : undefined}
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
