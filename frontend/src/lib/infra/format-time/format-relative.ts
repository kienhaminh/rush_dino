export function formatRelativeTimestamp(ts?: number | null): string {
  if (ts == null) {
    return "n/a";
  }

  const diff = ts - Date.now();
  const abs = Math.abs(diff);

  if (diff >= 0) {
    if (abs < 60_000) {
      return "in <1m";
    }
    if (abs < 3_600_000) {
      return `in ${Math.round(abs / 60_000)}m`;
    }
    if (abs < 172_800_000) {
      return `in ${Math.round(abs / 3_600_000)}h`;
    }
    return `in ${Math.round(abs / 86_400_000)}d`;
  }

  if (abs < 30_000) {
    return "just now";
  }
  if (abs < 3_600_000) {
    return `${Math.round(abs / 60_000)}m ago`;
  }
  if (abs < 172_800_000) {
    return `${Math.round(abs / 3_600_000)}h ago`;
  }
  return `${Math.round(abs / 86_400_000)}d ago`;
}
