import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';

import { fetchGatewaySummary, fetchSystemSummary } from '@/lib/api';
import type { GatewaySummaryResponse, SystemSummaryResponse } from '@/lib/types';
import type { ChannelKey } from '@/pages/channels/ChannelsPage';
import { GatewayPage, type GatewayPageChannel } from './GatewayPage';

const ORDERED_CHANNELS: ChannelKey[] = ['telegram', 'discord', 'webchat'];

function channelLabel(channel: ChannelKey): string {
  switch (channel) {
    case 'webchat':
      return 'Web Chat';
    default:
      return channel.charAt(0).toUpperCase() + channel.slice(1);
  }
}

export function buildGatewayChannels(
  systemSummary: SystemSummaryResponse | null,
  gatewaySummary: GatewaySummaryResponse | null,
): GatewayPageChannel[] {
  const systemChannels = new Map(
    (systemSummary?.channels ?? []).map((channel) => [channel.id, channel] as const),
  );
  const gatewayAdapters = new Map(
    (gatewaySummary?.adapters ?? []).map((adapter) => [adapter.channelId, adapter] as const),
  );

  return ORDERED_CHANNELS.map((channel) => {
    const systemChannel = systemChannels.get(channel);
    const gatewayAdapter = gatewayAdapters.get(channel);

    return {
      channel,
      label: systemChannel?.label ?? channelLabel(channel),
      connected: gatewayAdapter?.status === 'connected',
      configured: systemChannel?.configured ?? false,
      lastActivityAt: gatewayAdapter?.lastEventAt ?? null,
      issue: systemChannel?.issue ?? null,
    };
  });
}

export function GatewayRoute() {
  const params = useParams<{ channel?: string }>();
  const routeChannel = params.channel;
  const shouldRedirectToLanding = Boolean(routeChannel);

  const [systemSummary, setSystemSummary] = useState<SystemSummaryResponse | null>(null);
  const [gatewaySummary, setGatewaySummary] = useState<GatewaySummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasLoadedInitialDataRef = useRef(false);

  const load = useCallback(async (showLoading = true) => {
    if (showLoading) {
      setLoading(true);
    }

    try {
      const [nextSystemSummary, nextGatewaySummary] = await Promise.all([
        fetchSystemSummary(),
        fetchGatewaySummary(),
      ]);
      setSystemSummary(nextSystemSummary);
      setGatewaySummary(nextGatewaySummary);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load gateway status.');
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (shouldRedirectToLanding || hasLoadedInitialDataRef.current) return;
    hasLoadedInitialDataRef.current = true;
    void load();
  }, [load, shouldRedirectToLanding]);

  useEffect(() => {
    if (shouldRedirectToLanding) return;

    const interval = window.setInterval(() => {
      void load(false);
    }, 5000);

    return () => window.clearInterval(interval);
  }, [load, shouldRedirectToLanding]);

  const channels = useMemo(
    () => buildGatewayChannels(systemSummary, gatewaySummary),
    [gatewaySummary, systemSummary],
  );

  if (shouldRedirectToLanding) {
    return <Navigate to="/gateway" replace />;
  }

  return <GatewayPage channels={channels} loading={loading} error={error} />;
}
