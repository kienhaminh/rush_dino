import { useCallback, useRef } from 'react';

import { useChannelPairingQuery } from '@/lib/queries';
import { usePairingRequestEvents } from './use-chat-ws';

interface UsePendingApprovalsCountResult {
  count: number;
  refetch: () => void;
}

/**
 * Tracks the number of pending channel pairing approvals.
 *
 * Fetches from both telegram and discord via React Query.
 * Increments by 1 for each pairing_request_created WS event received since
 * the last fetch, keeping the badge live without a round-trip per event.
 */
export function usePendingApprovalsCount(): UsePendingApprovalsCountResult {
  const { pairingRequestCount } = usePairingRequestEvents();
  const baselinePairingCountRef = useRef(pairingRequestCount);

  const telegramQuery = useChannelPairingQuery('telegram');
  const discordQuery = useChannelPairingQuery('discord');

  const telegramPending = telegramQuery.data?.pending.length ?? 0;
  const discordPending = discordQuery.data?.pending.length ?? 0;
  const baseCount = telegramPending + discordPending;

  // Reset baseline whenever a fresh fetch completes
  if (telegramQuery.isSuccess && discordQuery.isSuccess) {
    baselinePairingCountRef.current = pairingRequestCount;
  }

  const wsIncrement = pairingRequestCount - baselinePairingCountRef.current;
  const count = baseCount + Math.max(0, wsIncrement);

  const refetch = useCallback(() => {
    void telegramQuery.refetch();
    void discordQuery.refetch();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { count, refetch };
}
