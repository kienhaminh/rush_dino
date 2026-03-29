import { Link as RouterLink } from 'react-router-dom';
import { Clock3, RefreshCw, SquareSlash } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatProviderLabel } from '@/lib/provider-display';
import type { RunDetail, RunKind, RunSnapshot, RunState } from '@/lib/types';

type RunsPageProps = {
  runs: RunSnapshot[];
  detail: RunDetail | null;
  loading: boolean;
  detailLoading: boolean;
  error: string | null;
  selectedRunId: string | null;
  kindFilter: RunKind | 'all';
  stateFilter: RunState | 'all';
  onSelectRun: (runId: string) => void;
  onRefresh: () => void;
  onAbort: (runId: string) => void;
  onKindFilterChange: (next: RunKind | 'all') => void;
  onStateFilterChange: (next: RunState | 'all') => void;
};

function toneForState(state: string) {
  switch (state) {
    case 'running':
      return 'border-primary/30 text-primary';
    case 'queued':
      return 'border-warning/30 text-warning';
    case 'awaiting_approval':
    case 'awaiting_input':
      return 'border-warning/30 text-warning';
    case 'blocked':
    case 'failed':
      return 'border-destructive/30 text-destructive';
    case 'completed':
      return 'border-success/30 text-success';
    default:
      return 'border-border/50 text-muted-foreground';
  }
}

function isTerminal(state: RunState) {
  return state === 'completed' || state === 'failed' || state === 'aborted';
}

const RUN_KIND_FILTERS = [
  { value: 'all', label: 'Any kind' },
  { value: 'assistant', label: 'Assistant' },
  { value: 'workflow', label: 'Workflow' },
] as const;

const RUN_STATE_FILTERS = [
  { value: 'all', label: 'Any state' },
  { value: 'running', label: 'Running' },
  { value: 'queued', label: 'Queued' },
  { value: 'awaiting_approval', label: 'Awaiting approval' },
  { value: 'awaiting_input', label: 'Awaiting input' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'failed', label: 'Failed' },
  { value: 'completed', label: 'Completed' },
] as const;

export function RunsPage({
  runs,
  detail,
  loading,
  detailLoading,
  error,
  selectedRunId,
  kindFilter,
  stateFilter,
  onSelectRun,
  onRefresh,
  onAbort,
  onKindFilterChange,
  onStateFilterChange,
}: RunsPageProps) {
  return (
    <div className="flex-1 min-w-0 h-full overflow-y-auto bg-background px-6 py-6 md:px-8 md:py-8 flex flex-col gap-6 w-full">
        <section className="rounded-[28px] border border-border/60 bg-card/70 p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <Badge variant="outline" className="text-[10px] uppercase tracking-[0.24em]">
                Runtime control
              </Badge>
              <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                Runs are now the operational source of truth for assistant and workflow activity.
                Use this surface to inspect queue position, tool timeline, approval posture, and
                terminal failures without dropping to CLI.
              </p>
            </div>
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

        <section className="flex flex-col gap-3 rounded-2xl border border-border/50 bg-card/50 p-4">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <p className="min-w-20 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Kind
            </p>
            <div className="flex flex-wrap gap-2">
              {RUN_KIND_FILTERS.map((kind) => (
                <Button
                  key={kind.value}
                  variant={kindFilter === kind.value ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => onKindFilterChange(kind.value)}
                >
                  {kind.label}
                </Button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <p className="min-w-20 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              State
            </p>
            <div className="flex flex-wrap gap-2">
              {RUN_STATE_FILTERS.map((state) => (
                <Button
                  key={state.value}
                  variant={stateFilter === state.value ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => onStateFilterChange(state.value)}
                >
                  {state.label}
                </Button>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <Card className="border-border/60 bg-card/80">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Run queue</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {runs.length ? (
                runs.map((run) => (
                  <button
                    key={run.id}
                    type="button"
                    onClick={() => onSelectRun(run.id)}
                    className={`w-full rounded-3xl border px-4 py-4 text-left transition-colors ${
                      selectedRunId === run.id
                        ? 'border-primary/40 bg-primary/5'
                        : 'border-border/50 bg-background/50 hover:bg-muted/20'
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold">{run.title}</p>
                      <Badge variant="outline" className={`text-[10px] uppercase tracking-wider ${toneForState(run.state)}`}>
                        {run.state.replace('_', ' ')}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                        {run.kind}
                      </Badge>
                      {run.source ? (
                        <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                          {run.source}
                        </Badge>
                      ) : null}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                      <span>{run.provider}</span>
                      <span>{run.model}</span>
                      {run.channelId ? <span>Channel: {run.channelId}</span> : null}
                      {run.queuePosition != null ? <span>Queue #{run.queuePosition}</span> : null}
                      {run.activeTool ? <span>Tool: {run.activeTool}</span> : null}
                    </div>
                    <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">
                      {run.error ?? run.outputText ?? run.inputText ?? 'No run content recorded yet.'}
                    </p>
                  </button>
                ))
              ) : (
                <div className="rounded-3xl border border-dashed border-border/60 bg-background/40 px-4 py-10 text-sm text-muted-foreground">
                  No runs match the current filters.
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/80">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Run detail</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {detailLoading ? (
                <div className="rounded-3xl border border-dashed border-border/60 bg-background/40 px-4 py-10 text-sm text-muted-foreground">
                  Loading run detail…
                </div>
              ) : detail ? (
                <>
                  <div className="rounded-3xl border border-border/50 bg-background/50 p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold">{detail.snapshot.title}</p>
                          <Badge variant="outline" className={`text-[10px] uppercase tracking-wider ${toneForState(detail.snapshot.state)}`}>
                            {detail.snapshot.state.replace('_', ' ')}
                          </Badge>
                        </div>
                        <p className="font-mono text-[11px] text-muted-foreground">{detail.snapshot.id}</p>
                        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                          <span>Kind: {detail.snapshot.kind}</span>
                          {detail.snapshot.source ? <span>Source: {detail.snapshot.source}</span> : null}
                          {detail.snapshot.channelId ? <span>Channel: {detail.snapshot.channelId}</span> : null}
                          {detail.snapshot.senderId ? <span>Sender: {detail.snapshot.senderId}</span> : null}
                          <span>Provider: {formatProviderLabel(detail.snapshot.provider)}</span>
                          <span>Model: {detail.snapshot.model}</span>
                          {detail.snapshot.queuePosition != null ? <span>Queue #{detail.snapshot.queuePosition}</span> : null}
                        </div>
                      </div>
                      {!isTerminal(detail.snapshot.state) ? (
                        <Button
                          variant="outline"
                          className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => onAbort(detail.snapshot.id)}
                        >
                          <SquareSlash className="mr-2 h-4 w-4" />
                          Abort run
                        </Button>
                      ) : null}
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <div className="rounded-2xl border border-border/40 bg-muted/20 px-4 py-3 text-sm">
                        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Policy</p>
                        <p className="mt-2">Decision: {detail.snapshot.policy.decision}</p>
                        <p>Approval: {detail.snapshot.policy.approvalState}</p>
                        <p>Sandbox: {detail.snapshot.policy.sandboxState}</p>
                        <p>Scope: {detail.snapshot.policy.effectiveScope}</p>
                        {detail.snapshot.policy.reason ? (
                          <p className="mt-2 text-muted-foreground">{detail.snapshot.policy.reason}</p>
                        ) : null}
                      </div>
                      <div className="rounded-2xl border border-border/40 bg-muted/20 px-4 py-3 text-sm">
                        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Timing</p>
                        <p className="mt-2">Created: {new Date(detail.snapshot.createdAt).toLocaleString()}</p>
                        <p>Started: {detail.snapshot.startedAt ? new Date(detail.snapshot.startedAt).toLocaleString() : 'n/a'}</p>
                        <p>Completed: {detail.snapshot.completedAt ? new Date(detail.snapshot.completedAt).toLocaleString() : 'n/a'}</p>
                        {detail.snapshot.conversationId ? (
                          <p className="mt-2">
                            Conversation:{' '}
                            <RouterLink className="text-primary underline-offset-4 hover:underline" to={`/sessions`}>
                              {detail.snapshot.conversationId}
                            </RouterLink>
                          </p>
                        ) : null}
                        {detail.snapshot.gatewaySessionId ? (
                          <p className="mt-2">
                            Gateway session:{' '}
                            <RouterLink className="text-primary underline-offset-4 hover:underline" to={`/gateway`}>
                              {detail.snapshot.gatewaySessionId}
                            </RouterLink>
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  {detail.snapshot.inputText ? (
                    <div className="rounded-3xl border border-border/50 bg-background/50 p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Input</p>
                      <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-sm text-muted-foreground">
                        {detail.snapshot.inputText}
                      </pre>
                    </div>
                  ) : null}

                  {detail.snapshot.outputText || detail.snapshot.error ? (
                    <div className="rounded-3xl border border-border/50 bg-background/50 p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Result</p>
                      <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-sm text-muted-foreground">
                        {detail.snapshot.error ?? detail.snapshot.outputText}
                      </pre>
                    </div>
                  ) : null}

                  <div className="rounded-3xl border border-border/50 bg-background/50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Timeline</p>
                      {detail.snapshot.state === 'awaiting_input' ? (
                        <Badge variant="outline" className="text-[10px] uppercase tracking-wider border-warning/30 text-warning">
                          Waiting for user input
                        </Badge>
                      ) : null}
                    </div>
                    <div className="mt-3 space-y-3">
                      {detail.events.length ? (
                        detail.events.map((event) => (
                          <div key={event.id} className="rounded-2xl border border-border/40 bg-muted/20 px-4 py-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                                {event.eventType.replace(/_/g, ' ')}
                              </Badge>
                              {event.state ? (
                                <Badge variant="outline" className={`text-[10px] uppercase tracking-wider ${toneForState(event.state)}`}>
                                  {event.state.replace('_', ' ')}
                                </Badge>
                              ) : null}
                              {event.toolName ? <span className="text-sm font-medium">{event.toolName}</span> : null}
                            </div>
                            <p className="mt-2 text-sm text-muted-foreground">{event.message ?? 'No detail recorded.'}</p>
                            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                              <Clock3 className="h-3 w-3" />
                              <span>{new Date(event.createdAt).toLocaleString()}</span>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="rounded-2xl border border-dashed border-border/60 bg-background/40 px-4 py-8 text-sm text-muted-foreground">
                          No runtime events have been recorded yet.
                        </div>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div className="rounded-3xl border border-dashed border-border/60 bg-background/40 px-4 py-10 text-sm text-muted-foreground">
                  Select a run to inspect its runtime state and timeline.
                </div>
              )}
            </CardContent>
          </Card>
        </section>
    </div>
  );
}
