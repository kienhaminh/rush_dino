import { useCallback, useEffect, useState } from 'react'
import { checkForUpdates, installUpdate, type UpdateInfo } from '@/api/updater'

export type UpdaterStatus =
  | 'idle'
  | 'checking'
  | 'up-to-date'
  | 'available'
  | 'installing'
  | 'error'

type Options = {
  /** Check once shortly after mount. */
  autoCheck?: boolean
  /** Delay before the first auto-check (ms). */
  initialDelay?: number
  /** Interval between subsequent checks (ms). 0 to disable periodic polling. */
  interval?: number
}

const SIX_HOURS = 6 * 60 * 60 * 1000

/**
 * Drives the auto-update state machine: idle → checking → up-to-date |
 * available → installing → (app restarts). Callers can opt into a one-off
 * auto-check at mount or a lazy periodic poll.
 */
export function useUpdater(opts: Options = {}) {
  const { autoCheck = false, initialDelay = 5_000, interval = SIX_HOURS } = opts

  const [status, setStatus] = useState<UpdaterStatus>('idle')
  const [info, setInfo] = useState<UpdateInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastChecked, setLastChecked] = useState<Date | null>(null)

  const check = useCallback(async () => {
    setStatus('checking')
    setError(null)
    try {
      const update = await checkForUpdates()
      setLastChecked(new Date())
      if (update) {
        setInfo(update)
        setStatus('available')
      } else {
        setInfo(null)
        setStatus('up-to-date')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setStatus('error')
    }
  }, [])

  const install = useCallback(async () => {
    setStatus('installing')
    setError(null)
    try {
      await installUpdate()
      /* `installUpdate` restarts the app on success; this line only runs
         when Tauri isn't present (web dev preview) or if the call somehow
         returns without relaunching. Reset to idle so the UI isn't stuck. */
      setStatus('idle')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setStatus('error')
    }
  }, [])

  const dismiss = useCallback(() => {
    setInfo(null)
    setStatus('idle')
  }, [])

  useEffect(() => {
    if (!autoCheck) return
    const first = window.setTimeout(() => {
      void check()
    }, initialDelay)
    const recurring =
      interval > 0
        ? window.setInterval(() => {
            if (status !== 'installing') void check()
          }, interval)
        : 0
    return () => {
      window.clearTimeout(first)
      if (recurring) window.clearInterval(recurring)
    }
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [autoCheck, initialDelay, interval])

  return { status, info, error, lastChecked, check, install, dismiss } as const
}
