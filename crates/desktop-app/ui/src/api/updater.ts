/**
 * Thin typed wrappers over the updater Tauri commands defined in
 * `src-tauri/src/commands.rs`. Safe no-ops outside Tauri so the UI
 * renders cleanly in pure web previews.
 */

import { invoke } from '@tauri-apps/api/core'

export type UpdateInfo = {
  version: string
  current_version: string
  body?: string | null
  date?: string | null
}

function isTauri(): boolean {
  return typeof (window as { __TAURI__?: unknown }).__TAURI__ !== 'undefined'
}

export async function checkForUpdates(): Promise<UpdateInfo | null> {
  if (!isTauri()) return null
  return await invoke<UpdateInfo | null>('check_for_updates')
}

/**
 * Downloads and applies the current update. Tauri restarts the app on
 * success, so the returned promise may never resolve — treat any non-error
 * outcome as "restarting".
 */
export async function installUpdate(): Promise<void> {
  if (!isTauri()) return
  await invoke('install_update')
}
