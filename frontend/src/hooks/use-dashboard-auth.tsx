import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import {
  DASHBOARD_AUTH_REQUIRED_EVENT,
  exchangeDashboardAuthCode,
  logoutDashboardAuthSession,
} from '@/lib/api';
import { useDashboardAuthStatusQuery } from '@/lib/queries';

interface DashboardAuthContextValue {
  loading: boolean;
  enabled: boolean;
  authenticated: boolean;
  expiresAt: string | null;
  readyForProtectedRoutes: boolean;
  refreshStatus: () => void;
  exchangeCode: (code: string) => Promise<void>;
  logout: () => Promise<void>;
}

const DashboardAuthContext = createContext<DashboardAuthContextValue>({
  loading: true,
  enabled: false,
  authenticated: false,
  expiresAt: null,
  readyForProtectedRoutes: false,
  refreshStatus: () => {},
  exchangeCode: async () => {},
  logout: async () => {},
});

export function DashboardAuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);

  // Poll auth status every 30s when enabled and authenticated — React Query handles the interval
  const { data: authStatus, refetch: refetchAuthStatus } = useDashboardAuthStatusQuery(
    enabled && authenticated,
  );

  // Sync query result into local state
  useEffect(() => {
    if (!authStatus) return;
    setEnabled(authStatus.enabled);
    setAuthenticated(authStatus.enabled ? authStatus.authenticated : true);
    setExpiresAt(authStatus.expiresAt ?? null);
    setLoading(false);
  // enabled/authenticated intentionally excluded to avoid sync loops
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authStatus]);

  // Initial fetch on mount (query won't auto-run until enabled+authenticated are true)
  useEffect(() => {
    void refetchAuthStatus();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exchangeCode = useCallback(async (code: string) => {
    const status = await exchangeDashboardAuthCode(code);
    setEnabled(status.enabled);
    setAuthenticated(status.authenticated);
    setExpiresAt(status.expiresAt ?? null);
    setLoading(false);
  }, []);

  const logout = useCallback(async () => {
    await logoutDashboardAuthSession();
    setAuthenticated(false);
    setExpiresAt(null);
  }, []);

  useEffect(() => {
    const onAuthRequired = () => {
      setAuthenticated(false);
      setExpiresAt(null);
      setLoading(false);
    };

    window.addEventListener(DASHBOARD_AUTH_REQUIRED_EVENT, onAuthRequired);
    return () => {
      window.removeEventListener(DASHBOARD_AUTH_REQUIRED_EVENT, onAuthRequired);
    };
  }, []);

  const refreshStatus = useCallback(() => void refetchAuthStatus(), [refetchAuthStatus]);

  const value = useMemo(
    () => ({
      loading,
      enabled,
      authenticated,
      expiresAt,
      readyForProtectedRoutes: !enabled || authenticated,
      refreshStatus,
      exchangeCode,
      logout,
    }),
    [authenticated, enabled, exchangeCode, expiresAt, loading, logout, refreshStatus],
  );

  return <DashboardAuthContext.Provider value={value}>{children}</DashboardAuthContext.Provider>;
}

export function useDashboardAuth() {
  return useContext(DashboardAuthContext);
}
