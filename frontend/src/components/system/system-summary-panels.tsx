import type { ReactNode } from 'react';
import { ArrowRight, ChevronDown } from 'lucide-react';
import { Link as RouterLink } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { SystemSummaryResponse } from '@/lib/types';

function compactCount(parts: Array<[number, string]>) {
  return parts
    .filter(([count]) => count > 0)
    .map(([count, label]) => `${count} ${label}`)
    .join(', ');
}

function pluralize(count: number, singular: string, plural: string = `${singular}s`) {
  return count === 1 ? singular : plural;
}

export function formatUptime(uptimeSecs: number) {
  const hours = Math.floor(uptimeSecs / 3600);
  const minutes = Math.floor((uptimeSecs % 3600) / 60);
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

export function toneForStatus(status: string) {
  switch (status) {
    case 'healthy':
      return 'bg-success/10 text-success border-success/20';
    case 'degraded':
      return 'bg-warning/10 text-warning border-warning/20';
    default:
      return 'bg-muted/40 text-muted-foreground border-border/50';
  }
}

export function summarizeChannels(summary: SystemSummaryResponse | null) {
  const channels = summary?.channels ?? [];
  if (channels.length === 0) return 'No channel status available';

  const healthy = channels.filter((channel) => channel.status === 'healthy').length;
  const needsAttention = channels.filter((channel) => channel.status === 'needs_attention').length;
  const disabled = channels.filter((channel) => !channel.enabled || channel.status === 'disabled').length;

  return (
    compactCount([
      [needsAttention, pluralize(needsAttention, 'needs attention', 'need attention')],
      [healthy, 'healthy'],
      [disabled, 'disabled'],
    ]) || 'No active channels'
  );
}

export function summarizeRuntime(summary: SystemSummaryResponse | null) {
  if (!summary) return 'Loading runtime state';

  return (
    compactCount([
      [summary.runs.activeCount, 'active'],
      [summary.runs.queuedCount, 'queued'],
      [summary.runs.blockedCount, 'blocked'],
    ]) || 'No active or queued runs'
  );
}

function SummaryChip({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-full border border-border/60 bg-background/70 px-3 py-1.5 text-sm text-muted-foreground">
      <span className="text-foreground">{value}</span> {label}
    </div>
  );
}

function DisclosureRow({
  title,
  summary,
  defaultOpen = false,
  action,
  children,
}: {
  title: string;
  summary: string;
  defaultOpen?: boolean;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <details
      open={defaultOpen}
      className="group rounded-2xl border border-border/50 bg-background/40 open:bg-background/60"
    >
      <summary className="flex cursor-pointer list-none items-start justify-between gap-4 px-4 py-3">
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">{title}</p>
          <p className="text-sm text-muted-foreground">{summary}</p>
        </div>
        <div className="flex items-center gap-3">
          {action}
          <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
        </div>
      </summary>
      <div className="border-t border-border/40 px-4 py-3">{children}</div>
    </details>
  );
}

export function OperationsSummaryStrip({
  summary,
}: {
  summary: SystemSummaryResponse | null;
}) {
  const needsAttention =
    summary?.channels.filter((channel) => channel.status === 'needs_attention').length ?? 0;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge
        className={`border h-6 px-2 text-[10px] uppercase tracking-[0.2em] ${toneForStatus(summary?.status ?? 'healthy')}`}
      >
        {summary?.status ?? 'loading'}
      </Badge>
      <SummaryChip label="pending approvals" value={summary?.approvals.pendingCount ?? 0} />
      <SummaryChip label="active runs" value={summary?.runs.activeCount ?? 0} />
      <SummaryChip label="channels need attention" value={needsAttention} />
      <SummaryChip label="recent incidents" value={summary?.incidents.length ?? 0} />
    </div>
  );
}

export function OperationalStatusCard({
  summary,
}: {
  summary: SystemSummaryResponse | null;
}) {
  const channels = summary?.channels ?? [];
  const pendingApprovals = summary?.approvals.pending ?? [];
  const channelAttentionCount =
    summary?.channels.filter((channel) => channel.status === 'needs_attention').length ?? 0;
  const runtimeNeedsAttention = (summary?.runs.blockedCount ?? 0) > 0 || pendingApprovals.length > 0;

  return (
    <Card className="border-border/60 bg-card/80">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Operational status</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <DisclosureRow
          title="Channels"
          summary={summarizeChannels(summary)}
          defaultOpen={channelAttentionCount > 0}
          action={
            <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-xs">
              <RouterLink to="/gateway">
                Open channels
                <ArrowRight className="ml-1 h-3 w-3" />
              </RouterLink>
            </Button>
          }
        >
          {channels.length === 0 ? (
            <p className="text-sm text-muted-foreground">No channel status available.</p>
          ) : (
            <div className="space-y-2">
              {channels.map((channel) => (
                <div
                  key={channel.id}
                  className="flex items-start justify-between gap-4 rounded-xl border border-border/40 bg-background/50 px-3 py-2"
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
                        (channel.enabled ? 'Configured and available.' : 'Disabled in config.')}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {channel.configured ? 'Configured' : 'Missing credentials'}
                  </p>
                </div>
              ))}
            </div>
          )}
        </DisclosureRow>

        <DisclosureRow
          title="Runtime"
          summary={summarizeRuntime(summary)}
          defaultOpen={runtimeNeedsAttention}
          action={
            <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-xs">
              <RouterLink to="/sessions">
                Open sessions
                <ArrowRight className="ml-1 h-3 w-3" />
              </RouterLink>
            </Button>
          }
        >
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-xl border border-border/40 bg-background/50 px-3 py-3">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Active</p>
              <p className="mt-1 text-2xl font-semibold">{summary?.runs.activeCount ?? 0}</p>
            </div>
            <div className="rounded-xl border border-border/40 bg-background/50 px-3 py-3">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Queued</p>
              <p className="mt-1 text-2xl font-semibold">{summary?.runs.queuedCount ?? 0}</p>
            </div>
            <div className="rounded-xl border border-border/40 bg-background/50 px-3 py-3">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Blocked</p>
              <p className="mt-1 text-2xl font-semibold">{summary?.runs.blockedCount ?? 0}</p>
            </div>
          </div>

          {pendingApprovals.length ? (
            <div className="mt-3 space-y-2">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Pending approvals
              </p>
              {pendingApprovals.slice(0, 3).map((request) => (
                <div
                  key={request.requestId}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border/40 bg-background/50 px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-medium">{request.tool}</p>
                    <p className="font-mono text-[11px] text-muted-foreground">
                      session {request.sessionId}
                    </p>
                  </div>
                  <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-xs">
                    <RouterLink to="/approvals">
                      Review
                      <ArrowRight className="ml-1 h-3 w-3" />
                    </RouterLink>
                  </Button>
                </div>
              ))}
            </div>
          ) : null}
        </DisclosureRow>

        <div className="rounded-2xl border border-border/50 bg-background/40 px-4 py-3 text-sm text-muted-foreground">
          Sandbox {summary?.security.sandboxEnabled ? 'enabled' : 'disabled'} · network{' '}
          {summary?.security.sandboxAllowNetwork ? 'allowed' : 'blocked'} · HMAC auth{' '}
          {summary?.security.hmacAuthEnabled ? 'enabled' : 'disabled'} · allowed origins{' '}
          {summary?.security.allowedOriginsCount ?? 0}
        </div>
      </CardContent>
    </Card>
  );
}
