import { useCallback, useState } from 'react';

import { skipVersion, triggerUpgrade, triggerRestart } from '@/lib/api';
import type { UpgradeResponse } from '@/lib/api';
import { useVersionCheckQuery } from '@/lib/queries';

type UpgradeState = 'idle' | 'upgrading' | 'upgraded' | 'restarting' | 'error';

export function useVersionCheck() {
  const { data, isPending: isLoading, refetch } = useVersionCheckQuery();
  const [upgradeState, setUpgradeState] = useState<UpgradeState>('idle');
  const [upgradeResult, setUpgradeResult] = useState<UpgradeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const doUpgrade = useCallback(async () => {
    try {
      setUpgradeState('upgrading');
      setError(null);
      const result = await triggerUpgrade();
      setUpgradeResult(result);
      setUpgradeState('upgraded');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upgrade failed');
      setUpgradeState('error');
    }
  }, []);

  const doRestart = useCallback(async () => {
    try {
      setUpgradeState('restarting');
      await triggerRestart();
      setTimeout(() => { window.location.reload(); }, 3000);
    } catch {
      setTimeout(() => { window.location.reload(); }, 3000);
    }
  }, []);

  const doSkip = useCallback(async () => {
    if (!data) return;
    try {
      await skipVersion(data.latest_version);
      // Invalidate query to re-fetch with updated skipped flag
      await refetch();
    } catch (err) {
      console.warn('Skip version failed:', err);
    }
  }, [data, refetch]);

  return {
    data: data ?? null,
    isLoading,
    upgradeState,
    upgradeResult,
    error,
    doUpgrade,
    doRestart,
    doSkip,
    refresh: () => void refetch(),
  };
}
