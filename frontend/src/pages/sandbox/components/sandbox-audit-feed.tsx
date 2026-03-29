import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import type { AuditEntry } from '@/lib/types';

// Column definition for extending the audit feed with additional data fields
export interface AuditFeedColumn {
  key: string;
  label: string;
  render: (entry: AuditEntry) => ReactNode;
}

interface SandboxAuditFeedProps {
  entries: AuditEntry[];
  loading: boolean;
  extraColumns?: AuditFeedColumn[];
}

// Decision badge with color-coded styling per decision type
function DecisionChip({ decision }: { decision: AuditEntry['decision'] }) {
  const styles: Record<AuditEntry['decision'], string> = {
    allow: 'bg-green-500/15 text-green-400 border-green-500/20',
    deny: 'bg-red-500/15 text-red-400 border-red-500/20',
    pending: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/20',
    route: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-1.5 py-0 text-[10px] font-semibold uppercase ${styles[decision] ?? ''}`}
    >
      {decision}
    </span>
  );
}

export function SandboxAuditFeed({ entries, loading, extraColumns = [] }: SandboxAuditFeedProps) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading…
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">No events</div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {/* Optional extra column header row */}
      {extraColumns.length > 0 && (
        <div className="flex items-center gap-2.5 px-3 py-1">
          <span className="min-w-[58px]" />
          <span className="min-w-[58px]" />
          <span className="flex-1" />
          {extraColumns.map((col) => (
            <span key={col.key} className="text-[10px] font-semibold uppercase text-muted-foreground/60">
              {col.label}
            </span>
          ))}
        </div>
      )}
      {entries.map((entry) => (
        <div
          key={entry.id}
          className="flex items-center gap-2.5 rounded-md border border-border/60 bg-card/50 px-3 py-2"
        >
          <span className="min-w-[58px] text-[10px] text-muted-foreground">
            {new Date(entry.ts).toLocaleTimeString()}
          </span>
          <DecisionChip decision={entry.decision} />
          <span className="flex-1 truncate text-[12px] text-muted-foreground">
            {entry.destination ?? entry.binary ?? '—'}
          </span>
          {extraColumns.map((col) => (
            <span key={col.key} className="text-[11px] text-muted-foreground">
              {col.render(entry)}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}
