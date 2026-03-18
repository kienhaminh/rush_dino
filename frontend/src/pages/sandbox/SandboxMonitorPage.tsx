/**
 * SandboxMonitorPage — live dashboard for sandbox audit events.
 *
 * Shows:
 *  - List of sessions that have audit entries (unique session_ids)
 *  - Per-session audit log table with timestamp, category, decision, destination, reason
 *  - Approve / Deny buttons for "pending" entries
 *  - Inline network policy editor with hot-reload "Apply" button
 *
 * Auto-refreshes every 5 seconds while a session is selected.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  approveSessionRequest,
  denySessionRequest,
  getSessionAuditLog,
  patchSessionNetworkPolicy,
} from '@/lib/api';
import type { AuditEntry, NetworkRule, SandboxNetworkPolicy } from '@/lib/types';
import {
  CheckCircle,
  Loader2,
  Network,
  Plus,
  RefreshCw,
  Shield,
  Trash2,
  XCircle,
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const REFRESH_INTERVAL_MS = 5_000;

// ---------------------------------------------------------------------------
// Decision badge
// ---------------------------------------------------------------------------

function DecisionBadge({ decision }: { decision: AuditEntry['decision'] }) {
  const variants: Record<AuditEntry['decision'], string> = {
    allow: 'bg-success/15 text-success border-success/20',
    deny: 'bg-destructive/15 text-destructive border-destructive/20',
    pending: 'bg-warning/15 text-warning border-warning/20',
    route: 'bg-primary/15 text-primary border-primary/20',
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-1.5 py-0 text-[10px] font-medium ${variants[decision] ?? ''}`}
    >
      {decision}
    </span>
  );
}

function CategoryBadge({ category }: { category: AuditEntry['category'] }) {
  return (
    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
      {category}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Network policy inline editor (for hot-reload)
// ---------------------------------------------------------------------------

function NetworkPolicyEditor({
  sessionId,
  initialRules,
}: {
  sessionId: string;
  initialRules: NetworkRule[];
}) {
  const [rules, setRules] = useState<NetworkRule[]>(initialRules);
  const [defaultAction, setDefaultAction] = useState<'allow' | 'deny'>('deny');
  const [onBlock, setOnBlock] = useState<'prompt' | 'deny' | 'hard-stop'>('prompt');
  const [applying, setApplying] = useState(false);

  const addRule = () =>
    setRules((prev) => [...prev, { host: '', port: 443, methods: ['GET'], paths: ['/*'] }]);

  const updateRule = (i: number, patch: Partial<NetworkRule>) =>
    setRules((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const removeRule = (i: number) => setRules((prev) => prev.filter((_, idx) => idx !== i));

  const handleApply = async () => {
    setApplying(true);
    try {
      const policy: SandboxNetworkPolicy = {
        default: defaultAction,
        on_block: onBlock,
        allow: rules,
      };
      await patchSessionNetworkPolicy(sessionId, policy);
      toast.success('Network policy applied to session.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to apply network policy.');
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Default:</span>
          <Select value={defaultAction} onValueChange={(v) => setDefaultAction(v as 'allow' | 'deny')}>
            <SelectTrigger className="h-7 w-[80px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="allow">allow</SelectItem>
              <SelectItem value="deny">deny</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">On block:</span>
          <Select value={onBlock} onValueChange={(v) => setOnBlock(v as 'prompt' | 'deny' | 'hard-stop')}>
            <SelectTrigger className="h-7 w-[100px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="prompt">prompt</SelectItem>
              <SelectItem value="deny">deny</SelectItem>
              <SelectItem value="hard-stop">hard-stop</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Allow rules */}
      <div className="space-y-1.5">
        {rules.length === 0 && (
          <p className="text-xs text-muted-foreground italic">No allow rules.</p>
        )}
        {rules.map((rule, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <Input
              value={rule.host}
              onChange={(e) => updateRule(i, { host: e.target.value })}
              placeholder="api.example.com"
              className="w-[180px] h-7 text-xs font-mono"
            />
            <Input
              type="number"
              value={rule.port}
              onChange={(e) => updateRule(i, { port: Number(e.target.value) })}
              className="w-[60px] h-7 text-xs font-mono"
            />
            <Input
              value={rule.methods.join(',')}
              onChange={(e) =>
                updateRule(i, { methods: e.target.value.split(',').map((m) => m.trim()) })
              }
              placeholder="GET,POST"
              className="w-[100px] h-7 text-xs font-mono"
            />
            <Input
              value={rule.paths.join(',')}
              onChange={(e) =>
                updateRule(i, { paths: e.target.value.split(',').map((p) => p.trim()) })
              }
              placeholder="/*"
              className="flex-1 h-7 text-xs font-mono"
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
              onClick={() => removeRule(i)}
            >
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        ))}
        <Button variant="outline" size="sm" className="gap-1 h-7 text-xs" onClick={addRule}>
          <Plus className="w-3 h-3" /> Add Rule
        </Button>
      </div>

      <div className="flex justify-end">
        <Button size="sm" onClick={handleApply} disabled={applying} className="gap-1.5">
          {applying ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Network className="w-3.5 h-3.5" />
          )}
          Apply
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function SandboxMonitorPage() {
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  // Unique session IDs discovered from audit entries
  const [sessions, setSessions] = useState<string[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [actionInProgress, setActionInProgress] = useState<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch audit log for the currently selected session
  const fetchEntries = useCallback(async (sessionId: string) => {
    try {
      const entries = await getSessionAuditLog(sessionId);
      setAuditEntries(entries);
      setFetchError(null);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Failed to fetch audit log.');
    }
  }, []);

  // On session selection: load immediately + start auto-refresh interval
  useEffect(() => {
    if (!selectedSessionId) {
      setAuditEntries([]);
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    setLoadingEntries(true);
    void fetchEntries(selectedSessionId).finally(() => setLoadingEntries(false));

    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      void fetchEntries(selectedSessionId);
    }, REFRESH_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [selectedSessionId, fetchEntries]);

  // When we receive new entries, update the session list from unique session_ids
  useEffect(() => {
    if (auditEntries.length > 0) {
      const ids = [...new Set(auditEntries.map((e) => e.session_id))];
      setSessions((prev) => {
        const merged = [...new Set([...prev, ...ids])];
        return merged;
      });
    }
  }, [auditEntries]);

  const handleApprove = async (entry: AuditEntry) => {
    if (!selectedSessionId) return;
    setActionInProgress(entry.id);
    try {
      await approveSessionRequest(selectedSessionId, String(entry.id));
      toast.success('Request approved.');
      await fetchEntries(selectedSessionId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to approve request.');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleDeny = async (entry: AuditEntry) => {
    if (!selectedSessionId) return;
    setActionInProgress(entry.id);
    try {
      await denySessionRequest(selectedSessionId, String(entry.id));
      toast.success('Request denied.');
      await fetchEntries(selectedSessionId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to deny request.');
    } finally {
      setActionInProgress(null);
    }
  };

  const pendingCount = auditEntries.filter((e) => e.decision === 'pending').length;

  return (
    <div className="flex-1 w-full min-w-0 flex h-full bg-background overflow-hidden">
      {/* Session list sidebar */}
      <aside className="w-[260px] shrink-0 border-r border-border/50 p-4 space-y-4 overflow-y-auto">
        <div className="space-y-1">
          <p className="text-lg font-semibold flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Sandbox Monitor
          </p>
          <p className="text-xs text-muted-foreground">
            Active sandbox sessions and audit log.
          </p>
        </div>

        {sessions.length === 0 && (
          <p className="text-xs text-muted-foreground italic mt-4">
            No sessions with sandbox audit entries found.
          </p>
        )}

        <div className="space-y-1">
          {sessions.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setSelectedSessionId(id)}
              className={`w-full text-left rounded-md border p-2.5 transition-colors text-xs font-mono truncate ${
                selectedSessionId === id
                  ? 'border-border bg-muted/50'
                  : 'border-border/40 bg-background hover:bg-muted/30'
              }`}
            >
              {id}
            </button>
          ))}
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-w-0 p-6 overflow-y-auto space-y-6">
        {!selectedSessionId ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
            <Shield className="w-10 h-10 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">Select a session to view the audit log.</p>
          </div>
        ) : (
          <>
            {/* Audit log header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold">Audit Log</p>
                <Badge variant="secondary" className="text-[10px] font-mono">
                  {selectedSessionId.slice(0, 12)}…
                </Badge>
                {pendingCount > 0 && (
                  <Badge className="text-[10px] bg-warning/20 text-warning border-warning/20">
                    {pendingCount} pending
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                {loadingEntries && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 h-7 text-xs"
                  onClick={() => void fetchEntries(selectedSessionId)}
                  disabled={loadingEntries}
                >
                  <RefreshCw className="w-3 h-3" /> Refresh
                </Button>
              </div>
            </div>

            {fetchError && (
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
                {fetchError}
              </div>
            )}

            {/* Audit entries table */}
            {auditEntries.length === 0 && !loadingEntries && !fetchError && (
              <div className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                No audit entries yet.
              </div>
            )}

            {auditEntries.length > 0 && (
              <div className="rounded-lg border border-border/40 overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border/40 bg-muted/30">
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Time</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Category</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Decision</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Destination</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Reason</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditEntries.map((entry) => (
                      <tr
                        key={entry.id}
                        className={`border-b border-border/20 last:border-0 ${
                          entry.decision === 'pending' ? 'bg-warning/5' : ''
                        }`}
                      >
                        <td className="px-3 py-2 font-mono text-muted-foreground whitespace-nowrap">
                          {new Date(entry.ts).toLocaleTimeString()}
                        </td>
                        <td className="px-3 py-2">
                          <CategoryBadge category={entry.category} />
                        </td>
                        <td className="px-3 py-2">
                          <DecisionBadge decision={entry.decision} />
                        </td>
                        <td className="px-3 py-2 font-mono max-w-[200px] truncate text-muted-foreground">
                          {entry.destination ?? entry.path ?? entry.binary ?? '—'}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground max-w-[160px] truncate">
                          {entry.reason ?? '—'}
                        </td>
                        <td className="px-3 py-2">
                          {entry.decision === 'pending' && (
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-success hover:bg-success/10"
                                disabled={actionInProgress === entry.id}
                                onClick={() => void handleApprove(entry)}
                                title="Approve"
                              >
                                {actionInProgress === entry.id ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <CheckCircle className="w-3.5 h-3.5" />
                                )}
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-destructive hover:bg-destructive/10"
                                disabled={actionInProgress === entry.id}
                                onClick={() => void handleDeny(entry)}
                                title="Deny"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Network policy hot-reload editor */}
            <div className="rounded-lg border border-border/40 p-4 space-y-3">
              <p className="text-sm font-semibold flex items-center gap-2">
                <Network className="w-4 h-4 text-primary" />
                Hot-reload Network Policy
              </p>
              <p className="text-xs text-muted-foreground">
                Edit and apply network allow rules to this session without restarting the agent.
              </p>
              <NetworkPolicyEditor sessionId={selectedSessionId} initialRules={[]} />
            </div>
          </>
        )}
      </main>
    </div>
  );
}
