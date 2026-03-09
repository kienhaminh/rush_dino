import { Trash2, RefreshCw } from 'lucide-react';
import { Link as RouterLink } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { SessionSummary } from '@/lib/types';

type SessionsPageProps = {
  sessions: SessionSummary[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onDelete: (sessionId: string) => void;
};

function toneForStatus(status: string) {
  switch (status) {
    case 'awaiting_approval':
      return 'border-amber-500/30 text-amber-600 dark:text-amber-400';
    case 'active':
      return 'border-emerald-500/30 text-emerald-600 dark:text-emerald-400';
    case 'blocked':
      return 'border-rose-500/30 text-rose-600 dark:text-rose-400';
    default:
      return 'border-border/50 text-muted-foreground';
  }
}

export function SessionsPage({ sessions, loading, error, onRefresh, onDelete }: SessionsPageProps) {
  return (
    <div className="flex-1 min-w-0 h-full overflow-y-auto bg-background px-6 py-6 md:px-8 md:py-8 flex flex-col gap-6 w-full">
      <section className="rounded-[28px] border border-border/60 bg-card/70 p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            Sessions are treated as active assistant workspaces. This view makes approvals,
            recent activity, and cleanup a normal UI workflow instead of a CLI chore.
          </p>
          <Button onClick={onRefresh} disabled={loading}>
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

      <Card className="border-border/60 bg-card/80">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Conversation sessions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {sessions.length ? (
            sessions.map((session) => (
              <div
                key={session.id}
                className="flex flex-col gap-4 rounded-3xl border border-border/50 bg-background/50 px-4 py-4 lg:flex-row lg:items-start lg:justify-between"
              >
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold">{session.title}</p>
                    <Badge variant="outline" className={`text-[10px] uppercase tracking-wider ${toneForStatus(session.status)}`}>
                      {session.status.replace('_', ' ')}
                    </Badge>
                    {session.pendingApprovalCount > 0 ? (
                      <Badge variant="outline" className="text-[10px] uppercase tracking-wider border-amber-500/30 text-amber-600 dark:text-amber-400">
                        {session.pendingApprovalCount} waiting
                      </Badge>
                    ) : null}
                  </div>
                  <p className="font-mono text-[11px] text-muted-foreground">{session.id}</p>
                  <p className="text-sm text-muted-foreground">
                    {session.lastMessagePreview ?? 'No messages recorded yet.'}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground lg:justify-end">
                  <div>
                    <p className="uppercase tracking-widest">Runs</p>
                    <p className="mt-1 text-sm text-foreground">
                      {session.activeRunCount} active / {session.queuedRunCount} queued
                    </p>
                  </div>
                  <div>
                    <p className="uppercase tracking-widest">Messages</p>
                    <p className="mt-1 text-sm text-foreground">{session.messageCount}</p>
                  </div>
                  <div>
                    <p className="uppercase tracking-widest">Updated</p>
                    <p className="mt-1 text-sm text-foreground">
                      {new Date(session.updatedAt).toLocaleString()}
                    </p>
                  </div>
                  {session.lastRunId ? (
                    <Button asChild variant="outline">
                      <RouterLink to="/runs">Open run</RouterLink>
                    </Button>
                  ) : null}
                  <Button
                    variant="outline"
                    className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => onDelete(session.id)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </Button>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-3xl border border-dashed border-border/60 bg-background/40 px-4 py-10 text-sm text-muted-foreground">
              No sessions exist yet.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default SessionsPage;
