/**
 * Fires a macOS native notification via the Tauri command registered in
 * `src-tauri/src/commands.rs`. Silently becomes a no-op when running
 * outside Tauri (e.g. a pure web dev preview). Errors are swallowed so a
 * missing permission or backend failure never breaks the chat flow.
 */
export async function notify(title: string, body: string): Promise<void> {
  if (typeof (window as { __TAURI__?: unknown }).__TAURI__ === 'undefined') return
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('notify', { title, body })
  } catch (e) {
    console.warn('[rushdino] notify failed', e)
  }
}

/**
 * Only notifies when the user is *not* looking at the window (no focus).
 * Used for chat turn completion so the agent can finish in the background
 * without pinging someone who's already watching it stream.
 */
export function notifyIfBlurred(title: string, body: string): void {
  if (typeof document === 'undefined') return
  if (document.hasFocus()) return
  void notify(title, body)
}
