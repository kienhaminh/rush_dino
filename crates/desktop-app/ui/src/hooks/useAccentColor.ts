import { useCallback, useEffect, useState } from 'react'

export type AccentColor = 'teal' | 'violet' | 'amber' | 'mint'

const STORAGE_KEY = 'rd:accent'

function readStored(): AccentColor {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'teal' || v === 'violet' || v === 'amber' || v === 'mint') return v
  } catch { /* ignore */ }
  return 'teal'
}

function apply(accent: AccentColor) {
  document.documentElement.setAttribute('data-accent', accent)
}

export function useAccentColor() {
  const [accent, setAccentState] = useState<AccentColor>(readStored)

  const setAccent = useCallback((next: AccentColor) => {
    setAccentState(next)
    apply(next)
    try { localStorage.setItem(STORAGE_KEY, next) } catch { /* ignore */ }
  }, [])

  useEffect(() => { apply(accent) }, [accent])

  return { accent, setAccent } as const
}
