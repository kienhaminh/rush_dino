import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  fetchChannelPairing,
  fetchConfig,
  fetchCredentials,
  fetchMobileGatewayKeys,
  issueMobileGatewayKey,
  patchConfig,
  patchCredentials,
  revokeMobileGatewayKey,
  resolveChannelPairingRequest,
  revokeChannelPairedUser,
} from '@/lib/api';
import type {
  AppConfigView,
  ChannelPairingState,
  CredentialsView,
  IssuedMobileGatewayKey,
  MobileGatewayKeyRecord,
} from '@/lib/types';
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

// Grouped localStorage-persisted channel config.
type LocalChannelState = {
  uiSettings: ChannelSettingsState;
  enabledOverrides: ChannelEnabledOverrides;
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
  const mobileConfigured = hasCredential(gateway.mobile.publish_host);

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
      mobile: status(gateway.mobile.enabled, mobileConfigured),
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
): channel is 'telegram' | 'discord' | 'mobile' | 'slack' {
  return (
    channel === 'telegram' ||
    channel === 'discord' ||
    channel === 'mobile' ||
    channel === 'slack'
  );
}

function supportsPairing(channel: ChannelKey): channel is PairingChannel {
  return channel === 'telegram' || channel === 'discord';
}

function isChannelKey(value: string | undefined): value is ChannelKey {
  return (
    value === 'whatsapp' ||
    value === 'telegram' ||
    value === 'discord' ||
    value === 'mobile' ||
    value === 'googlechat' ||
    value === 'slack' ||
    value === 'signal' ||
    value === 'imessage' ||
    value === 'nostr'
  );
}

// ---------------------------------------------------------------------------
// Fetch/server state reducer
// ---------------------------------------------------------------------------

type FetchState = {
  config: AppConfigView | null;
  credentials: CredentialsView | null;
  loading: boolean;
  lastError: string | null;
  lastSuccessAt: number | null;
};

type FetchAction =
  | { type: 'loading' }
  | { type: 'loaded'; config: AppConfigView; credentials: CredentialsView }
  | { type: 'error'; message: string }
  | { type: 'configUpdated'; config: AppConfigView }
  | { type: 'credentialsUpdated'; credentials: CredentialsView }
  | { type: 'success' };

function fetchReducer(state: FetchState, action: FetchAction): FetchState {
  switch (action.type) {
    case 'loading':
      return { ...state, loading: true };
    case 'loaded':
      return { loading: false, config: action.config, credentials: action.credentials, lastError: null, lastSuccessAt: Date.now() };
    case 'error':
      return { ...state, loading: false, lastError: action.message };
    case 'configUpdated':
      return { ...state, config: action.config, lastError: null, lastSuccessAt: Date.now() };
    case 'credentialsUpdated':
      return { ...state, credentials: action.credentials, lastError: null, lastSuccessAt: Date.now() };
    case 'success':
      return { ...state, lastError: null, lastSuccessAt: Date.now() };
  }
}

const INITIAL_FETCH_STATE: FetchState = {
  config: null,
  credentials: null,
  loading: true,
  lastError: null,
  lastSuccessAt: null,
};

// ---------------------------------------------------------------------------
// useChannelHandlers — extracts all callback handlers out of ChannelsRoute
// ---------------------------------------------------------------------------

type MobileGatewayState = {
  keys: MobileGatewayKeyRecord[];
  lastIssuedKey: IssuedMobileGatewayKey | null;
};

function useChannelHandlers({
  fetchState,
  dispatch,
  localConfig,
  setLocalConfig,
  channelPairing,
  setChannelPairing,
  setMobileGateway,
  setChannelConfigSaving,
  navigate,
}: {
  fetchState: FetchState;
  dispatch: React.Dispatch<FetchAction>;
  localConfig: LocalChannelState;
  setLocalConfig: React.Dispatch<React.SetStateAction<LocalChannelState>>;
  channelPairing: ChannelPairingStateMap;
  setChannelPairing: React.Dispatch<React.SetStateAction<ChannelPairingStateMap>>;
  setMobileGateway: React.Dispatch<React.SetStateAction<MobileGatewayState>>;
  setChannelConfigSaving: React.Dispatch<React.SetStateAction<boolean>>;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const { config, credentials } = fetchState;

  const handleChannelToggle = useCallback(
    async (channel: ChannelKey, enabled: boolean) => {
      if (!config) return;

      if (!isPersistedGatewayChannel(channel)) {
        setLocalConfig((prev) => ({
          ...prev,
          enabledOverrides: { ...prev.enabledOverrides, [channel]: enabled },
        }));
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
        dispatch({ type: 'configUpdated', config: nextConfig });
        toast.success(`${enabled ? 'Enabled' : 'Disabled'} ${channel} channel.`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : `Failed to toggle ${channel} channel.`);
      } finally {
        setChannelConfigSaving(false);
      }
    },
    [config, dispatch, setChannelConfigSaving, setLocalConfig],
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
          channel === 'slack' &&
          (!hasCredential(patch.slackBotToken ?? credentials?.slack_bot_token) ||
            !hasCredential(patch.slackAppToken ?? credentials?.slack_app_token))
        ) {
          toast.error('Slack test failed: both bot and app tokens are required.');
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

      if (!isPersistedGatewayChannel(channel)) {
        if (typeof requestedEnabled === 'boolean') {
          setLocalConfig((prev) => ({
            ...prev,
            enabledOverrides: { ...prev.enabledOverrides, [channel]: requestedEnabled },
          }));
        }
        dispatch({ type: 'success' });
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
        dispatch({ type: 'success' });
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
        if (nextConfig) dispatch({ type: 'configUpdated', config: nextConfig });
        if (nextCredentials) dispatch({ type: 'credentialsUpdated', credentials: nextCredentials });
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
    [config, credentials, dispatch, setChannelConfigSaving, setLocalConfig],
  );

  const handleIssueMobileGatewayKey = useCallback(async (label?: string) => {
    try {
      setChannelConfigSaving(true);
      const issued = await issueMobileGatewayKey({ label });
      const refreshedKeys = await fetchMobileGatewayKeys();
      setMobileGateway({ keys: refreshedKeys, lastIssuedKey: issued });
      dispatch({ type: 'success' });
      toast.success('Issued mobile gateway key.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to issue mobile gateway key.');
    } finally {
      setChannelConfigSaving(false);
    }
  }, [dispatch, setChannelConfigSaving, setMobileGateway]);

  const handleRevokeMobileGatewayKey = useCallback(async (id: string) => {
    try {
      setChannelConfigSaving(true);
      await revokeMobileGatewayKey(id);
      const refreshedKeys = await fetchMobileGatewayKeys();
      setMobileGateway((prev) => ({
        keys: refreshedKeys,
        lastIssuedKey: prev.lastIssuedKey?.id === id ? null : prev.lastIssuedKey,
      }));
      dispatch({ type: 'success' });
      toast.success('Revoked mobile gateway key.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to revoke mobile gateway key.');
    } finally {
      setChannelConfigSaving(false);
    }
  }, [dispatch, setChannelConfigSaving, setMobileGateway]);

  const openChannelConfig = useCallback(
    (channel: ChannelKey) => {
      navigate(`/gateway/${channel}/settings`);
    },
    [navigate],
  );

  const closeChannelConfig = useCallback(() => {
    navigate('/gateway');
  }, [navigate]);

  const refreshPairingChannel = useCallback(async (channel: PairingChannel) => {
    const next = await fetchChannelPairing(channel);
    setChannelPairing((prev) => ({ ...prev, [channel]: next }));
  }, [setChannelPairing]);

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
    [refreshPairingChannel, setChannelConfigSaving],
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
    [refreshPairingChannel, setChannelConfigSaving],
  );

  return {
    handleChannelToggle,
    handleChannelConfigAction,
    handleIssueMobileGatewayKey,
    handleRevokeMobileGatewayKey,
    openChannelConfig,
    closeChannelConfig,
    refreshPairingChannel,
    handlePairingDecision,
    handlePairingRevoke,
  };
}

// ---------------------------------------------------------------------------
// ChannelsRoute component
// ---------------------------------------------------------------------------

export function ChannelsRoute() {
  const navigate = useNavigate();
  const params = useParams<{ channel?: string }>();
  const routeChannel = params.channel;

  const [fetchState, dispatch] = useReducer(fetchReducer, INITIAL_FETCH_STATE);
  const { config, credentials, loading, lastError, lastSuccessAt } = fetchState;

  const [channelConfigSaving, setChannelConfigSaving] = useState(false);
  const [localConfig, setLocalConfig] = useState<LocalChannelState>(() => ({
    uiSettings: loadJsonRecord<ChannelSettingsState>(CHANNEL_UI_SETTINGS_KEY),
    enabledOverrides: loadJsonRecord<ChannelEnabledOverrides>(CHANNEL_ENABLED_OVERRIDES_KEY),
  }));
  const { uiSettings: channelUiSettings, enabledOverrides: channelEnabledOverrides } = localConfig;

  const [channelPairing, setChannelPairing] = useState<ChannelPairingStateMap>({});
  const [mobileGateway, setMobileGateway] = useState<MobileGatewayState>({
    keys: [],
    lastIssuedKey: null,
  });
  const hasLoadedInitialDataRef = useRef(false);

  const snapshot = useMemo(
    () => buildSnapshot(config, credentials, channelEnabledOverrides, channelPairing),
    [config, credentials, channelEnabledOverrides, channelPairing],
  );

  // Persist both localStorage keys whenever localConfig changes.
  useEffect(() => {
    saveJsonRecord(CHANNEL_UI_SETTINGS_KEY, localConfig.uiSettings);
    saveJsonRecord(CHANNEL_ENABLED_OVERRIDES_KEY, localConfig.enabledOverrides);
  }, [localConfig]);

  const refresh = useCallback(async () => {
    try {
      dispatch({ type: 'loading' });
      const [nextConfig, nextCredentials, telegramPairing, discordPairing, nextMobileKeys] =
        await Promise.all([
          fetchConfig(),
          fetchCredentials(),
          fetchChannelPairing('telegram'),
          fetchChannelPairing('discord'),
          fetchMobileGatewayKeys(),
        ]);
      setChannelPairing({
        telegram: telegramPairing,
        discord: discordPairing,
      });
      setMobileGateway((prev) => ({ ...prev, keys: nextMobileKeys }));
      dispatch({ type: 'loaded', config: nextConfig, credentials: nextCredentials });
    } catch (err) {
      dispatch({ type: 'error', message: err instanceof Error ? err.message : 'Failed to load channels state.' });
    }
  }, []);

  useEffect(() => {
    if (hasLoadedInitialDataRef.current) return;
    hasLoadedInitialDataRef.current = true;
    void refresh();
  }, [refresh]);

  const {
    handleChannelToggle,
    handleChannelConfigAction,
    handleIssueMobileGatewayKey,
    handleRevokeMobileGatewayKey,
    openChannelConfig,
    closeChannelConfig,
    refreshPairingChannel,
    handlePairingDecision,
    handlePairingRevoke,
  } = useChannelHandlers({
    fetchState,
    dispatch,
    localConfig,
    setLocalConfig,
    channelPairing,
    setChannelPairing,
    setMobileGateway,
    setChannelConfigSaving,
    navigate,
  });

  if (routeChannel && !isChannelKey(routeChannel)) {
    return <Navigate to="/gateway" replace />;
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
        mobileGateway={
          routeChannel === 'mobile'
            ? {
                keys: mobileGateway.keys,
                lastIssuedKey: mobileGateway.lastIssuedKey,
                onIssueKey: handleIssueMobileGatewayKey,
                onRevokeKey: handleRevokeMobileGatewayKey,
                onDismissIssuedKey: () => setMobileGateway((prev) => ({ ...prev, lastIssuedKey: null })),
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
