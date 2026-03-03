export function formatDurationHuman(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) {
    return "n/a";
  }

  if (ms < 60_000) {
    const seconds = Math.max(1, Math.round(ms / 1_000));
    return `${seconds}s`;
  }

  if (ms < 3_600_000) {
    const minutes = Math.round(ms / 60_000);
    return `${minutes}m`;
  }

  if (ms < 86_400_000) {
    const hours = Math.round(ms / 3_600_000);
    return `${hours}h`;
  }

  const days = Math.round(ms / 86_400_000);
  return `${days}d`;
}
