/**
 * Resolves the embedded RushDino server's loopback origin once at app start.
 *
 * The Tauri Rust side picks a random free port at launch (see
 * `crates/desktop-app/src-tauri/src/server_runtime.rs`) and exposes it via
 * the `get_server_port` invoke command. This module caches the first resolve
 * so every API call reuses the same origin.
 */

import { invoke } from '@tauri-apps/api/core'

type ServerInfoPayload = { port: number }

let cached: Promise<string> | null = null

/** Returns a fully-qualified HTTP origin, e.g. `http://127.0.0.1:51234`. */
export function apiOrigin(): Promise<string> {
  if (!cached) {
    cached = resolveOrigin()
  }
  return cached
}

/** Returns the WebSocket origin, e.g. `ws://127.0.0.1:51234`. */
export async function wsOrigin(): Promise<string> {
  const http = await apiOrigin()
  return http.replace(/^http/i, 'ws')
}

async function resolveOrigin(): Promise<string> {
  // When running the UI outside of Tauri (e.g. `pnpm dev` for a pure web
  // preview of the shell), fall back to a static origin so the designer
  // workflow doesn't need the full desktop process.
  if (typeof (window as { __TAURI__?: unknown }).__TAURI__ === 'undefined') {
    const fallback =
      (import.meta.env.VITE_RUSHDINO_ORIGIN as string | undefined) ?? 'http://127.0.0.1:28847'
    console.warn(
      `[rushdino] running outside Tauri — using fallback origin ${fallback}. ` +
        `Set VITE_RUSHDINO_ORIGIN to override.`,
    )
    return fallback
  }

  const info = await invoke<ServerInfoPayload>('get_server_port')
  return `http://127.0.0.1:${info.port}`
}

/** Typed helper that prefixes every fetch with the resolved server origin. */
export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const origin = await apiOrigin()
  const url = path.startsWith('/') ? `${origin}${path}` : `${origin}/${path}`
  return fetch(url, init)
}
