import { useCallback, useEffect, useState } from 'react'

export type Theme = 'auto' | 'light' | 'dark'

const STORAGE_KEY = 'rd:theme'

function readStored(): Theme {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'light' || v === 'dark' || v === 'auto') return v
  } catch {
    /* localStorage unavailable (private mode, etc.) — fall through */
  }
  return 'auto'
}

function apply(theme: Theme) {
  const html = document.documentElement
  if (theme === 'auto') {
    html.removeAttribute('data-theme')
  } else {
    html.setAttribute('data-theme', theme)
  }
}

/**
 * Reads, persists, and applies the current theme preference. "auto" removes
 * the override so the OS `prefers-color-scheme` media query wins; "light" /
 * "dark" set `data-theme` on the root element, which the CSS in
 * `theme-light.css` keys off of.
 *
 * An inline script in `index.html` applies the stored value before React
 * mounts, so there's no flash-of-wrong-theme on cold start.
 */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(readStored)

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next)
    apply(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* ignore */
    }
  }, [])

  /* Ensure React's state agrees with the DOM on mount (handles the case
   * where the inline bootstrap script set a value we might not have
   * observed yet). */
  useEffect(() => {
    apply(theme)
  }, [theme])

  return { theme, setTheme } as const
}
