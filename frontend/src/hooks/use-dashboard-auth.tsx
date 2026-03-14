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
  fetchDashboardAuthStatus,
  logoutDashboardAuthSession,
} from '@/lib/api';

interface DashboardAuthContextValue {
  loading: boolean;
  enabled: boolean;
  authenticated: boolean;
  expiresAt: string | null;
  readyForProtectedRoutes: boolean;
  refreshStatus: () => Promise<void>;
  exchangeCode: (code: string) => Promise<void>;
  logout: () => Promise<void>;
}

const DashboardAuthContext = createContext<DashboardAuthContextValue>({
  loading: true,
  enabled: false,
  authenticated: false,
  expiresAt: null,
  readyForProtectedRoutes: false,
  refreshStatus: async () => {},
  exchangeCode: async () => {},
  logout: async () => {},
});

export function DashboardAuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    const status = await fetchDashboardAuthStatus();
    setEnabled(status.enabled);
    setAuthenticated(status.enabled ? status.authenticated : true);
    setExpiresAt(status.expiresAt ?? null);
    setLoading(false);
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
    void refreshStatus();
  }, [refreshStatus]);

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

  useEffect(() => {
    if (!enabled || !authenticated) {
      return;
    }

    const interval = window.setInterval(() => {
      void refreshStatus();
    }, 30_000);

    return () => {
      window.clearInterval(interval);
    };
  }, [authenticated, enabled, refreshStatus]);

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
