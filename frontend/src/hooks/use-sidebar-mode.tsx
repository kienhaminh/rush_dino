import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Storage key used to persist sidebar mode across reloads
// ---------------------------------------------------------------------------
const STORAGE_KEY = 'rushdino-sidebar-mode';

export type SidebarMode = 'light' | 'advanced';

// ---------------------------------------------------------------------------
// Context shape
// ---------------------------------------------------------------------------
interface SidebarModeContextValue {
  mode: SidebarMode;
  isAdvanced: boolean;
  setMode: (mode: SidebarMode) => void;
}

const SidebarModeContext = createContext<SidebarModeContextValue | null>(null);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function readStoredMode(): SidebarMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'advanced') return stored;
  } catch {
    // localStorage unavailable
  }
  return 'light';
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------
export function SidebarModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<SidebarMode>(readStoredMode);

  const setMode = useCallback((next: SidebarMode) => {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
    setModeState(next);
  }, []);

  return (
    <SidebarModeContext.Provider value={{ mode, isAdvanced: mode === 'advanced', setMode }}>
      {children}
    </SidebarModeContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
export function useSidebarMode(): SidebarModeContextValue {
  const ctx = useContext(SidebarModeContext);
  if (!ctx) {
    throw new Error('useSidebarMode must be used within a SidebarModeProvider');
  }
  return ctx;
}
