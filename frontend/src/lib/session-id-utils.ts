/**
 * Utilities for working with structured session IDs.
 *
 * Session ID naming convention:
 *   main                       → primary workspace session
 *   main::{channel}            → e.g. main::telegram, main::webchat
 *   main::mobile::{device_id}  → e.g. main::mobile::842UGSWI
 *   {agent_name}               → e.g. writer, code-reviewer
 */

/** Derive a human-readable label from a structured session ID. */
export function sessionLabel(id: string): string {
  if (id === 'main') return 'Main';

  if (id.startsWith('main::')) {
    const parts = id.slice('main::'.length).split('::');
    const channel = capitalize(parts[0]);
    if (parts.length > 1) return `${channel} · ${parts.slice(1).join(' · ')}`;
    return channel;
  }

  // Agent name: "code-reviewer" → "Code Reviewer"
  return id.split('-').map(capitalize).join(' ');
}

/** Returns true for system-managed sessions that should not be user-deletable. */
export function isSystemSession(id: string): boolean {
  return id === 'main' || id.startsWith('main::');
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
