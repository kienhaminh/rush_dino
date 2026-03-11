import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  Clock3,
  KeyRound,
  Link2,
  RefreshCw,
  ShieldCheck,
  TerminalSquare,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { fetchSystemSummary } from '@/lib/api';
import { formatProviderLabel } from '@/lib/provider-display';
import type { SystemSummaryResponse } from '@/lib/types';

function formatUptime(uptimeSecs: number) {
  const hours = Math.floor(uptimeSecs / 3600);
  const minutes = Math.floor((uptimeSecs % 3600) / 60);
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

function toneForStatus(status: string) {
  switch (status) {
    case 'healthy':
      return 'bg-success/10 text-success border-success/20';
    case 'degraded':
      return 'bg-warning/10 text-warning border-warning/20';
    default:
      return 'bg-muted/40 text-muted-foreground border-border/50';
  }
}

export function OverviewPage() {
  const [summary, setSummary] = useState<SystemSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSummary = async () => {
    setLoading(true);
    try {
      const next = await fetchSystemSummary();
      setSummary(next);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load operations summary.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSummary();
  }, []);

  const channels = summary?.channels ?? [];
  const needsAttention = channels.filter((channel) => channel.status === 'needs_attention');

  return (
    <div className="flex-1 min-w-0 h-full overflow-y-auto bg-background px-6 py-6 md:px-8 md:py-8 flex flex-col gap-6 w-full">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <Badge
            className={`border text-[10px] uppercase tracking-[0.2em] px-2 h-6 ${toneForStatus(summary?.status ?? 'healthy')}`}
          >
            {summary?.status ?? 'loading'}
          </Badge>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] uppercase tracking-wider text-muted-foreground/60">
            <div className="flex items-center gap-1.5">
              <span className="font-medium text-muted-foreground">
                {summary ? formatProviderLabel(summary.activeProvider) : '...'}
              </span>
              <span>Provider</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-medium text-muted-foreground">
                {summary ? formatUptime(summary.uptimeSecs) : '...'}
              </span>
              <span>Uptime</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-medium text-muted-foreground">
                {summary?.profilesCount ?? 0}
              </span>
              <span>Profiles</span>
            </div>
          </div>
        </div>

        <Button onClick={() => void loadSummary()} disabled={loading} variant="outline" size="sm">
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Card className="border-border/60 bg-card/80">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="rounded-2xl bg-primary/10 p-3 text-primary">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Pending approvals
              </p>
              <p className="mt-1 text-3xl font-semibold">{summary?.approvals.pendingCount ?? 0}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/80">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="rounded-2xl bg-info/10 p-3 text-info">
              <Link2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Channels needing attention
              </p>
              <p className="mt-1 text-3xl font-semibold">{needsAttention.length}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/80">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="rounded-2xl bg-warning/10 p-3 text-warning">
              <Clock3 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Active runs
              </p>
              <p className="mt-1 text-3xl font-semibold">{summary?.runs.activeCount ?? 0}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/80">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="rounded-2xl bg-destructive/10 p-3 text-destructive">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Recent incidents
              </p>
              <p className="mt-1 text-3xl font-semibold">{summary?.incidents.length ?? 0}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/80">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="rounded-2xl bg-muted p-3 text-muted-foreground">
              <Clock3 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Queued runs
              </p>
              <p className="mt-1 text-3xl font-semibold">{summary?.runs.queuedCount ?? 0}</p>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="border-border/60 bg-card/80">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Connectivity posture</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {channels.length === 0 ? (
              <p className="text-sm text-muted-foreground">No channel status available.</p>
            ) : (
              channels.map((channel) => (
                <div
                  key={channel.id}
                  className="flex items-center justify-between gap-4 rounded-2xl border border-border/50 bg-background/50 px-4 py-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{channel.label}</p>
                      <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                        {channel.enabled ? channel.status.replace('_', ' ') : 'disabled'}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {channel.issue ??
                        (channel.enabled
                          ? 'Configured and available for UI-managed operations.'
                          : 'Disabled in config.')}
                    </p>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    <p>{channel.enabled ? 'Enabled' : 'Off'}</p>
                    <p>{channel.configured ? 'Configured' : 'Missing creds'}</p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4">
          <Card className="border-border/60 bg-card/80">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Runtime queue preview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {summary?.runs.mostRecentId ? (
                <div className="rounded-2xl border border-border/50 bg-background/50 px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">Live runtime activity</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {summary.runs.activeCount} active · {summary.runs.queuedCount} queued ·{' '}
                        {summary.runs.blockedCount} blocked
                      </p>
                    </div>
                    <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-xs">
                      <RouterLink to="/runs">
                        Review
                        <ArrowRight className="ml-1 h-3 w-3" />
                      </RouterLink>
                    </Button>
                  </div>
                </div>
              ) : summary?.approvals.pending.length ? (
                summary.approvals.pending.slice(0, 4).map((request) => (
                  <div
                    key={request.requestId}
                    className="rounded-2xl border border-border/50 bg-background/50 px-4 py-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium">{request.tool}</p>
                      <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-xs">
                        <RouterLink to="/approvals">
                          Review
                          <ArrowRight className="ml-1 h-3 w-3" />
                        </RouterLink>
                      </Button>
                    </div>
                    <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                      session {request.sessionId}
                    </p>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-border/60 bg-background/40 px-4 py-8 text-sm text-muted-foreground">
                  No runs or approvals are waiting on operator action.
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/80">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Policy and recovery signals</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <div className="rounded-2xl border border-border/50 bg-background/50 px-4 py-3">
                <div className="flex items-center gap-2 text-foreground">
                  <TerminalSquare className="h-4 w-4 text-primary" />
                  <span className="font-medium">Shell sandbox</span>
                </div>
                <p className="mt-1">
                  {summary?.security.sandboxEnabled ? 'Enabled' : 'Disabled'} · network{' '}
                  {summary?.security.sandboxAllowNetwork ? 'allowed' : 'blocked'}
                </p>
                <p className="mt-1 font-mono text-[11px]">
                  {summary?.security.sandboxWorkspaceRoot}
                </p>
              </div>
              <div className="rounded-2xl border border-border/50 bg-background/50 px-4 py-3">
                <div className="flex items-center gap-2 text-foreground">
                  <KeyRound className="h-4 w-4 text-primary" />
                  <span className="font-medium">API auth posture</span>
                </div>
                <p className="mt-1">
                  HMAC auth {summary?.security.hmacAuthEnabled ? 'enabled' : 'disabled'} · allowed
                  origins {summary?.security.allowedOriginsCount ?? 0}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <Card className="border-border/60 bg-card/80">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Recent incidents</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {summary?.incidents.length ? (
            summary.incidents.map((incident) => (
              <div
                key={incident.id}
                className="flex flex-col gap-2 rounded-2xl border border-border/50 bg-background/50 px-4 py-3 md:flex-row md:items-start md:justify-between"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                      {incident.level}
                    </Badge>
                    <p className="text-sm font-medium">{incident.target}</p>
                  </div>
                  <p className="text-sm text-muted-foreground">{incident.message}</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  {new Date(incident.createdAt).toLocaleString()}
                </p>
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-border/60 bg-background/40 px-4 py-8 text-sm text-muted-foreground">
              No recent warnings or errors recorded in the runtime log.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
