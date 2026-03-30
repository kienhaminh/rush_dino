import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchChannelPairing } from '@/lib/api';
import { usePairingRequestEvents } from './use-chat-ws';

interface UsePendingApprovalsCountResult {
  count: number;
  refetch: () => void;
}

/**
 * Tracks the number of pending channel pairing approvals.
 *
 * Fetches from both telegram and discord on mount and on refetch.
 * Increments by 1 for each pairing_request_created WS event received since
 * the last fetch, keeping the badge live without a round-trip per event.
 */
export function usePendingApprovalsCount(): UsePendingApprovalsCountResult {
  const [baseCount, setBaseCount] = useState<number>(0);
  const [refetchKey, setRefetchKey] = useState(0);
  const { pairingRequestCount } = usePairingRequestEvents();
  const baselinePairingCountRef = useRef(pairingRequestCount);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      fetchChannelPairing('telegram'),
      fetchChannelPairing('discord'),
    ]).then(([telegramState, discordState]) => {
      if (!cancelled) {
        setBaseCount(telegramState.pending.length + discordState.pending.length);
        baselinePairingCountRef.current = pairingRequestCount;
      }
    });

    return () => {
      cancelled = true;
    };
    // pairingRequestCount intentionally excluded — only refetchKey drives re-fetches
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refetchKey]);

  const wsIncrement = pairingRequestCount - baselinePairingCountRef.current;
  const count = baseCount + Math.max(0, wsIncrement);

  const refetch = useCallback(() => {
    setRefetchKey((k) => k + 1);
  }, []);

  return { count, refetch };
}
