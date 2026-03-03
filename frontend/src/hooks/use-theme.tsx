import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { resolveTheme, type ThemeMode, type ResolvedTheme } from '@/components/layout/theme';
import { startThemeTransition } from '@/components/layout/theme-transition';

// ---------------------------------------------------------------------------
// Storage key used to persist the user's preference across reloads
// ---------------------------------------------------------------------------
const STORAGE_KEY = 'rushdino-theme-mode';

// ---------------------------------------------------------------------------
// Context shape
// ---------------------------------------------------------------------------
interface ThemeContextValue {
  /** The user-selected preference: "light" | "dark" | "system" */
  mode: ThemeMode;
  /** The actual resolved theme being applied: "light" | "dark" */
  resolved: ResolvedTheme;
  /** Switch to one of the three options with a smooth view-transition animation */
  setMode: (mode: ThemeMode, event?: React.MouseEvent) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function readStoredMode(): ThemeMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      return stored;
    }
  } catch {
    // localStorage unavailable (e.g. SSR or private browsing restrictions)
  }
  return 'system';
}

function applyThemeToDocument(resolved: ResolvedTheme) {
  const root = document.documentElement;
  if (resolved === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(readStoredMode);
  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolveTheme(readStoredMode()));

  // Keep a ref so the media-query listener always sees the current mode
  const modeRef = useRef(mode);
  modeRef.current = mode;

  // Apply theme immediately on mount and whenever it changes
  useEffect(() => {
    const newResolved = resolveTheme(mode);
    setResolved(newResolved);
    applyThemeToDocument(newResolved);
  }, [mode]);

  // Listen for OS-level changes so "system" stays up-to-date
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const handleChange = () => {
      if (modeRef.current === 'system') {
        const newResolved = resolveTheme('system');
        setResolved(newResolved);
        applyThemeToDocument(newResolved);
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const setMode = useCallback((nextMode: ThemeMode, event?: React.MouseEvent) => {
    const currentMode = modeRef.current;

    const applyTheme = () => {
      try {
        localStorage.setItem(STORAGE_KEY, nextMode);
      } catch {
        /* ignore */
      }
      const nextResolved = resolveTheme(nextMode);
      applyThemeToDocument(nextResolved);
      setModeState(nextMode);
      setResolved(nextResolved);
    };

    // Build transition context from the click event if available
    const context = event
      ? { pointerClientX: event.clientX, pointerClientY: event.clientY }
      : undefined;

    startThemeTransition({
      nextTheme: nextMode,
      applyTheme,
      context,
      currentTheme: currentMode,
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ mode, resolved, setMode }}>{children}</ThemeContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return ctx;
}
