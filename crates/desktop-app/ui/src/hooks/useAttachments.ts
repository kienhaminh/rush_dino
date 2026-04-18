import { useCallback, useEffect, useState } from 'react'

/**
 * Composer attachments — local-only file references.
 *
 * We don't upload files to the server (there's no multipart route yet);
 * instead the paths are appended to the outgoing chat message as a
 * markdown block, and the agent's shell/fs tools read them on demand.
 * Sources:
 *   • Paperclip button → `@tauri-apps/plugin-dialog` `open()` picker
 *   • OS drag-drop onto the window → Tauri webview `onDragDropEvent`
 *
 * Outside of Tauri (pure web preview) both become no-ops.
 */
export function useAttachments() {
  const [paths, setPaths] = useState<string[]>([])
  const [dragActive, setDragActive] = useState(false)

  const add = useCallback((incoming: string[]) => {
    setPaths((prev) => {
      const seen = new Set(prev)
      const next = [...prev]
      for (const p of incoming) {
        if (!seen.has(p)) {
          next.push(p)
          seen.add(p)
        }
      }
      return next
    })
  }, [])

  const remove = useCallback((p: string) => {
    setPaths((prev) => prev.filter((x) => x !== p))
  }, [])

  const clear = useCallback(() => setPaths([]), [])

  const pick = useCallback(async () => {
    if (typeof (window as { __TAURI__?: unknown }).__TAURI__ === 'undefined') return
    try {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const result = (await open({ multiple: true })) as string[] | string | null
      if (!result) return
      const list = Array.isArray(result) ? result : [result]
      add(list.filter((x): x is string => typeof x === 'string'))
    } catch (e) {
      console.warn('[rushdino] attachment picker failed', e)
    }
  }, [add])

  useEffect(() => {
    if (typeof (window as { __TAURI__?: unknown }).__TAURI__ === 'undefined') return
    let cleanup: (() => void) | null = null
    void import('@tauri-apps/api/webview').then(async ({ getCurrentWebview }) => {
      const webview = getCurrentWebview()
      const unlisten = await webview.onDragDropEvent((event) => {
        const payload = event.payload as {
          type: 'enter' | 'over' | 'leave' | 'drop'
          paths?: string[]
        }
        if (payload.type === 'enter' || payload.type === 'over') {
          setDragActive(true)
        } else if (payload.type === 'leave') {
          setDragActive(false)
        } else if (payload.type === 'drop') {
          setDragActive(false)
          if (payload.paths && payload.paths.length > 0) add(payload.paths)
        }
      })
      cleanup = unlisten
    })
    return () => {
      if (cleanup) cleanup()
    }
  }, [add])

  return { paths, add, remove, clear, pick, dragActive } as const
}

/** Renders paths as a markdown block the agent can see in its context. */
export function formatAttachments(paths: string[]): string {
  if (paths.length === 0) return ''
  const list = paths.map((p) => `- \`${p}\``).join('\n')
  return `\n\n**Attachments:**\n${list}`
}

export function basename(path: string): string {
  const trimmed = path.replace(/\/+$/, '')
  const idx = trimmed.lastIndexOf('/')
  return idx >= 0 ? trimmed.slice(idx + 1) : trimmed
}
