import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import type {
  AppConfigView,
  ChannelPairingState,
  CredentialsView,
  IssuedMobileGatewayKey,
  MobileGatewayKeyRecord,
} from '@/lib/types';
import {
  useConfigQuery,
  useCredentialsQuery,
  usePatchConfigMutation,
  usePatchCredentialsMutation,
  useChannelPairingQuery,
  useMobileGatewayKeysQuery,
  useIssueMobileKeyMutation,
  useRevokeMobileKeyMutation,
  useResolveChannelPairingMutation,
  useRevokeChannelPairedUserMutation,
} from '@/lib/queries';
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

type ChannelSettingsState = Partial<Record<ChannelKey, ChannelUiSettings>>;
type PairingChannel = Extract<ChannelKey, 'telegram' | 'discord'>;

// Grouped localStorage-persisted channel config.
type LocalChannelState = {
  uiSettings: ChannelSettingsState;
};

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
  telegramPairing: ChannelPairingState | undefined,
  discordPairing: ChannelPairingState | undefined,
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

  const gateway = config.gateway;
  const telegramConfigured = hasCredential(credentials.telegram_bot_token);
  const discordConfigured = hasCredential(credentials.discord_bot_token);
  const mobileConfigured = hasCredential(gateway.mobile.publish_host);

  return {
    channelMeta: [],
    channelAccounts: {},
    channels: {
      telegram: {
        ...status(gateway.telegram.enabled, telegramConfigured),
        mode: 'polling',
        pairedCount: telegramPairing?.paired.length ?? 0,
        pendingPairingCount: telegramPairing?.pending.length ?? 0,
      },
      discord: {
        ...status(gateway.discord.enabled, discordConfigured),
        pairedCount: discordPairing?.paired.length ?? 0,
        pendingPairingCount: discordPairing?.pending.length ?? 0,
      },
      webchat: status(gateway.webchat.enabled, true),
      mobile: status(gateway.mobile.enabled, mobileConfigured),
    },
  };
}


function supportsPairing(channel: ChannelKey): channel is PairingChannel {
  return channel === 'telegram' || channel === 'discord';
}

function isChannelKey(value: string | undefined): value is ChannelKey {
  return (
    value === 'telegram' ||
    value === 'discord' ||
    value === 'webchat' ||
    value === 'mobile'
  );
}

type MobileGatewayState = {
  keys: MobileGatewayKeyRecord[];
  lastIssuedKey: IssuedMobileGatewayKey | null;
};

// ---------------------------------------------------------------------------
// ChannelsRoute component
// ---------------------------------------------------------------------------

export function ChannelsRoute() {
  const navigate = useNavigate();
  const params = useParams<{ channel?: string }>();
  const routeChannel = params.channel;

  // Server state via React Query
  const configQuery = useConfigQuery();
  const credentialsQuery = useCredentialsQuery();
  const telegramQuery = useChannelPairingQuery('telegram');
  const discordQuery = useChannelPairingQuery('discord');
  const mobileKeysQuery = useMobileGatewayKeysQuery();

  const patchConfigMutation = usePatchConfigMutation();
  const patchCredsMutation = usePatchCredentialsMutation();
  const issueMutation = useIssueMobileKeyMutation();
  const revokeMutation = useRevokeMobileKeyMutation();
  const resolvePairingMutation = useResolveChannelPairingMutation();
  const revokeUserMutation = useRevokeChannelPairedUserMutation();

  const config = configQuery.data ?? null;
  const credentials = credentialsQuery.data ?? null;
  const loading = configQuery.isPending || credentialsQuery.isPending;
  const lastError =
    (configQuery.error instanceof Error ? configQuery.error.message : null) ??
    (credentialsQuery.error instanceof Error ? credentialsQuery.error.message : null);
  const lastSuccessAt = configQuery.dataUpdatedAt || null;

  // lastIssuedKey is local UI state — not in the query cache
  const [lastIssuedKey, setLastIssuedKey] = useState<IssuedMobileGatewayKey | null>(null);

  // channelConfigSaving tracks in-flight mutations for UI busy state
  const channelConfigSaving =
    patchConfigMutation.isPending ||
    patchCredsMutation.isPending ||
    issueMutation.isPending ||
    revokeMutation.isPending ||
    resolvePairingMutation.isPending ||
    revokeUserMutation.isPending;

  const [localConfig, setLocalConfig] = useState<LocalChannelState>(() => ({
    uiSettings: loadJsonRecord<ChannelSettingsState>(CHANNEL_UI_SETTINGS_KEY),
  }));
  const { uiSettings: channelUiSettings } = localConfig;

  // Persist localStorage key whenever localConfig changes.
  useEffect(() => {
    saveJsonRecord(CHANNEL_UI_SETTINGS_KEY, localConfig.uiSettings);
  }, [localConfig]);

  const snapshot = useMemo(
    () => buildSnapshot(config, credentials, telegramQuery.data, discordQuery.data),
    [config, credentials, telegramQuery.data, discordQuery.data],
  );

  // Derive mobile gateway keys from query cache; keep lastIssuedKey as local state
  const mobileGateway: MobileGatewayState = {
    keys: mobileKeysQuery.data ?? [],
    lastIssuedKey,
  };

  const handleChannelToggle = useCallback(
    async (channel: ChannelKey, enabled: boolean) => {
      if (!config) return;

      try {
        await patchConfigMutation.mutateAsync({
          gateway: {
            ...config.gateway,
            [channel]: {
              ...config.gateway[channel],
              enabled,
            },
          },
        });
        toast.success(`${enabled ? 'Enabled' : 'Disabled'} ${channel} channel.`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : `Failed to toggle ${channel} channel.`);
      }
    },
    [config, patchConfigMutation],
  );

  const handleChannelConfigAction = useCallback(
    async (channel: ChannelKey, patch: ChannelDetailConfigPatch, action: ChannelConfigAction) => {
      if (!config) {
        toast.error('Configuration is still loading. Please wait and try again.');
        return;
      }

      if (patch.uiSettings) {
        setLocalConfig((prev) => ({
          ...prev,
          uiSettings: { ...prev.uiSettings, [channel]: patch.uiSettings },
        }));
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
          channel === 'mobile' &&
          !hasCredential(
            typeof patch.mobilePublishHost === 'string'
              ? patch.mobilePublishHost
              : config.gateway.mobile.publish_host,
          )
        ) {
          toast.error('Mobile Gateway test failed: publish host is missing.');
          return;
        }
        toast.info(
          `Connection test passed local validation for ${channel}. Use Save or Connect to apply.`,
        );
        return;
      }

      const requestedEnabled = action === 'connect' ? true : patch.enabled;

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
      if (channel === 'mobile' && typeof patch.mobilePublishHost === 'string') {
        const baseGateway = configPatch.gateway ?? config.gateway;
        configPatch.gateway = {
          ...baseGateway,
          mobile: {
            ...baseGateway.mobile,
            enabled:
              typeof requestedEnabled === 'boolean'
                ? requestedEnabled
                : baseGateway.mobile.enabled,
            publish_host: patch.mobilePublishHost,
          },
        };
      }
      if (patch.telegramBotToken != null) {
        credentialsPatch.telegram_bot_token = patch.telegramBotToken;
      }
      if (patch.discordBotToken != null) {
        credentialsPatch.discord_bot_token = patch.discordBotToken;
      }

      const hasConfigPatch = Object.keys(configPatch).length > 0;
      const hasCredentialsPatch = Object.keys(credentialsPatch).length > 0;
      const hasUiPatch = Boolean(patch.uiSettings);

      if (!hasConfigPatch && !hasCredentialsPatch) {
        if (hasUiPatch) {
          toast.success(`Saved ${channel} UI configuration.`);
        } else {
          toast.info('No fields were changed.');
        }
        return;
      }

      try {
        await Promise.all([
          hasConfigPatch ? patchConfigMutation.mutateAsync(configPatch) : Promise.resolve(),
          hasCredentialsPatch ? patchCredsMutation.mutateAsync(credentialsPatch) : Promise.resolve(),
        ]);
        if (action === 'connect') {
          toast.success(`${channel} configuration saved and channel connected.`);
        } else {
          toast.success(`${channel} configuration saved.`);
        }
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : `Failed to ${action} ${channel} configuration.`,
        );
      }
    },
    [config, credentials, patchConfigMutation, patchCredsMutation],
  );

  const handleIssueMobileGatewayKey = useCallback(async (label?: string) => {
    try {
      const issued = await issueMutation.mutateAsync({ label });
      setLastIssuedKey(issued);
      toast.success('Issued mobile gateway key.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to issue mobile gateway key.');
    }
  }, [issueMutation]);

  const handleRevokeMobileGatewayKey = useCallback(async (id: string) => {
    try {
      await revokeMutation.mutateAsync(id);
      setLastIssuedKey((prev) => (prev?.id === id ? null : prev));
      toast.success('Revoked mobile gateway key.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to revoke mobile gateway key.');
    }
  }, [revokeMutation]);

  const openChannelConfig = useCallback(
    (channel: ChannelKey) => {
      navigate(`/gateway/${channel}/settings`);
    },
    [navigate],
  );

  const closeChannelConfig = useCallback(() => {
    navigate('/gateway');
  }, [navigate]);

  const handlePairingDecision = useCallback(
    async (channel: PairingChannel, requestId: string, approved: boolean) => {
      try {
        await resolvePairingMutation.mutateAsync({ channel, requestId, approved });
        toast.success(approved ? 'Pairing approved.' : 'Pairing denied.');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to resolve pairing request.');
      }
    },
    [resolvePairingMutation],
  );

  const handlePairingRevoke = useCallback(
    async (channel: PairingChannel, senderId: string) => {
      try {
        await revokeUserMutation.mutateAsync({ channel, senderId });
        toast.success('Paired user revoked.');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to revoke paired user.');
      }
    },
    [revokeUserMutation],
  );

  const refreshPairingChannel = useCallback(
    (channel: PairingChannel) => {
      if (channel === 'telegram') void telegramQuery.refetch();
      else if (channel === 'discord') void discordQuery.refetch();
    },
    [telegramQuery, discordQuery],
  );

  const handleRefresh = useCallback(() => {
    void configQuery.refetch();
    void credentialsQuery.refetch();
    void telegramQuery.refetch();
    void discordQuery.refetch();
    void mobileKeysQuery.refetch();
  }, [configQuery, credentialsQuery, telegramQuery, discordQuery, mobileKeysQuery]);

  if (routeChannel && !isChannelKey(routeChannel)) {
    return <Navigate to="/gateway" replace />;
  }

  if (routeChannel && isChannelKey(routeChannel)) {
    const status = snapshot?.channels?.[routeChannel] ?? {};
    const pairingData = supportsPairing(routeChannel)
      ? (routeChannel === 'telegram' ? telegramQuery.data : discordQuery.data) ?? null
      : null;
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
        pairing={pairingData}
        mobileGateway={
          routeChannel === 'mobile'
            ? {
                keys: mobileGateway.keys,
                lastIssuedKey: mobileGateway.lastIssuedKey,
                onIssueKey: handleIssueMobileGatewayKey,
                onRevokeKey: handleRevokeMobileGatewayKey,
                onDismissIssuedKey: () => setLastIssuedKey(null),
              }
            : null
        }
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
      onRefresh={handleRefresh}
      onChannelToggle={handleChannelToggle}
      onChannelConfigAction={handleChannelConfigAction}
      onOpenChannelConfig={openChannelConfig}
    />
  );
}
