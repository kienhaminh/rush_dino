import { useCallback, useEffect, useState } from 'react';

import { fetchVersionCheck, skipVersion, triggerUpgrade, triggerRestart } from '@/lib/api';
import type { VersionCheckResponse, UpgradeResponse } from '@/lib/api';

type UpgradeState = 'idle' | 'upgrading' | 'upgraded' | 'restarting' | 'error';

export function useVersionCheck() {
  const [data, setData] = useState<VersionCheckResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [upgradeState, setUpgradeState] = useState<UpgradeState>('idle');
  const [upgradeResult, setUpgradeResult] = useState<UpgradeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const check = useCallback(async () => {
    try {
      setIsLoading(true);
      const result = await fetchVersionCheck();
      setData(result);
    } catch (err) {
      console.warn('Version check failed:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    check();
  }, [check]);

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
      setData((prev) => (prev ? { ...prev, skipped: true } : prev));
    } catch (err) {
      console.warn('Skip version failed:', err);
    }
  }, [data]);

  return {
    data,
    isLoading,
    upgradeState,
    upgradeResult,
    error,
    doUpgrade,
    doRestart,
    doSkip,
    refresh: check,
  };
}
