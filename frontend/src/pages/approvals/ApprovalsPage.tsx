import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { CheckCircle2, RefreshCw, ShieldAlert, XCircle } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { fetchApprovals, resolveApproval } from '@/lib/api';
import type { ApprovalsResponse } from '@/lib/types';

export function ApprovalsPage() {
  const [data, setData] = useState<ApprovalsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyRequestId, setBusyRequestId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const next = await fetchApprovals();
      setData(next);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load approvals.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleDecision = async (requestId: string, sessionId: string, approved: boolean) => {
    setBusyRequestId(requestId);
    try {
      await resolveApproval(requestId, { approved, sessionId });
      toast.success(approved ? 'Approval granted.' : 'Approval denied.');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to resolve approval.');
    } finally {
      setBusyRequestId(null);
    }
  };

  const pending = data?.pending ?? [];
  const recent = data?.recent ?? [];

  return (
    <div className="flex-1 min-w-0 h-full overflow-y-auto bg-background px-6 py-6 md:px-8 md:py-8 flex flex-col gap-6 w-full">
        <section className="rounded-[28px] border border-border/60 bg-card/70 p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="space-y-2">
              <Badge variant="outline" className="text-[10px] uppercase tracking-[0.24em]">
                Operator gate
              </Badge>
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                Every dangerous action should stop here before it reaches the host. Pending items
                are actionable. Recent items form the decision trail.
              </p>
            </div>
            <Button onClick={() => void load()} disabled={loading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </section>

        {error ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <Card className="border-border/60 bg-card/80">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Pending approvals</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {pending.length ? (
                pending.map((request) => {
                  const isBusy = busyRequestId === request.requestId;
                  return (
                    <div
                      key={request.requestId}
                      className="rounded-3xl border border-border/50 bg-background/50 p-4"
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                              pending
                            </Badge>
                            <p className="text-sm font-semibold">{request.tool}</p>
                          </div>
                          <p className="font-mono text-[11px] text-muted-foreground">
                            session {request.sessionId} · conversation {request.conversationId}
                          </p>
                          {request.runId ? (
                            <p className="text-xs text-muted-foreground">
                              <RouterLink className="text-primary underline-offset-4 hover:underline" to="/runs">
                                View run {request.runId}
                              </RouterLink>
                            </p>
                          ) : null}
                          <pre className="overflow-x-auto rounded-2xl border border-border/40 bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
                            {JSON.stringify(request.args ?? {}, null, 2)}
                          </pre>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            disabled={isBusy}
                            onClick={() =>
                              void handleDecision(request.requestId, request.sessionId, false)
                            }
                          >
                            <XCircle className="mr-2 h-4 w-4" />
                            Deny
                          </Button>
                          <Button
                            disabled={isBusy}
                            onClick={() =>
                              void handleDecision(request.requestId, request.sessionId, true)
                            }
                          >
                            <CheckCircle2 className="mr-2 h-4 w-4" />
                            Approve
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="rounded-3xl border border-dashed border-border/60 bg-background/40 px-4 py-10 text-sm text-muted-foreground">
                  No approvals are currently waiting for operator action.
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/80">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Decision trail</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {recent.length ? (
                recent.map((entry) => (
                  <div
                    key={entry.id}
                    className="rounded-2xl border border-border/50 bg-background/50 px-4 py-3"
                  >
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={`text-[10px] uppercase tracking-wider ${
                          entry.status === 'approved'
                            ? 'border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                            : entry.status === 'denied'
                              ? 'border-rose-500/30 text-rose-600 dark:text-rose-400'
                              : ''
                        }`}
                      >
                        {entry.status}
                      </Badge>
                      <p className="text-sm font-medium">{entry.tool ?? 'approval record'}</p>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {entry.requestId ? `request ${entry.requestId}` : 'request id unavailable'}
                    </p>
                    {entry.runId ? (
                      <p className="mt-1 text-xs text-muted-foreground">run {entry.runId}</p>
                    ) : null}
                    <p className="mt-2 text-xs text-muted-foreground">
                      {new Date(entry.createdAt).toLocaleString()}
                    </p>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-border/60 bg-background/40 px-4 py-8 text-sm text-muted-foreground">
                  No approval decisions have been recorded yet.
                </div>
              )}

              <div className="rounded-2xl border border-border/50 bg-muted/20 px-4 py-4 text-xs text-muted-foreground">
                <div className="flex items-start gap-2">
                  <ShieldAlert className="mt-0.5 h-4 w-4 text-primary" />
                  <p>
                    CLI remains available for offline recovery, but approval handling is now a
                    first-class operator workflow in the web control UI.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>
    </div>
  );
}
