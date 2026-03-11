import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';

type DebugEventEntry = {
  ts: number;
  event: string;
  payload: unknown;
};

function formatPayload(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function formatScalar(value: unknown): string {
  if (value == null) return '-';
  if (typeof value === 'number') return Number.isFinite(value) ? value.toLocaleString() : String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') return value || '-';
  if (Array.isArray(value)) return `${value.length} items`;
  if (isRecord(value)) return `${Object.keys(value).length} fields`;
  return String(value);
}

function flattenForDisplay(input: Record<string, unknown>, maxPairs = 16): Array<[string, unknown]> {
  const pairs: Array<[string, unknown]> = [];
  for (const [key, value] of Object.entries(input)) {
    if (isRecord(value)) {
      for (const [nestedKey, nestedValue] of Object.entries(value)) {
        pairs.push([`${key}.${nestedKey}`, nestedValue]);
        if (pairs.length >= maxPairs) return pairs;
      }
    } else {
      pairs.push([key, value]);
      if (pairs.length >= maxPairs) return pairs;
    }
  }
  return pairs;
}

function DataGrid({ data }: { data: Record<string, unknown> | null }) {
  if (!data) {
    return <p className="text-sm text-muted-foreground">No data.</p>;
  }
  const rows = flattenForDisplay(data);
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No values.</p>;
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {rows.map(([key, value]) => (
        <div key={key} className="rounded-md border border-border/50 bg-muted/20 p-2.5">
          <p className="text-[11px] font-mono text-muted-foreground break-all">{key}</p>
          <p className="text-sm font-medium break-all mt-1">{formatScalar(value)}</p>
        </div>
      ))}
    </div>
  );
}

export function DebugPage() {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<Record<string, unknown>>({
    connected: true,
    uptimeMs: 1863390,
    securityAudit: {
      summary: { critical: 0, warn: 1, info: 3 },
    },
  });
  const [health, setHealth] = useState<Record<string, unknown>>({
    ok: true,
    cpu: { load: 0.32, cores: 8 },
    memory: { usedMb: 912, totalMb: 16384 },
  });
  const [heartbeat, setHeartbeat] = useState<Record<string, unknown>>({
    ts: Date.now(),
    source: 'gateway',
    seq: 12873,
  });
  const [models] = useState<Array<Record<string, unknown>>>([
    { id: 'gpt-4o', provider: 'openai', vision: true },
    { id: 'claude-3.7-sonnet', provider: 'anthropic', vision: true },
    { id: 'o3-mini', provider: 'openai', reasoning: true },
  ]);
  const [eventLog, setEventLog] = useState<DebugEventEntry[]>([
    { ts: Date.now() - 14_000, event: 'presence.updated', payload: { online: 3 } },
    { ts: Date.now() - 8_000, event: 'channels.snapshot', payload: { channels: 5 } },
    { ts: Date.now() - 3_000, event: 'cron.tick', payload: { jobs: 3 } },
  ]);
  const [callMethod, setCallMethod] = useState('system-presence');
  const [callParams, setCallParams] = useState('{}');
  const [callResult, setCallResult] = useState<Record<string, unknown> | null>(null);
  const [callError, setCallError] = useState<string | null>(null);

  const securitySummary = useMemo(() => {
    const audit = (status.securityAudit as { summary?: Record<string, number> } | undefined)?.summary;
    return {
      critical: audit?.critical ?? 0,
      warn: audit?.warn ?? 0,
      info: audit?.info ?? 0,
    };
  }, [status]);

  async function handleRefresh() {
    setLoading(true);
    await new Promise((resolve) => window.setTimeout(resolve, 350));
    const nextTs = Date.now();
    setHeartbeat((current) => ({ ...current, ts: nextTs, seq: ((current.seq as number) ?? 0) + 1 }));
    setEventLog((current) => [
      { ts: nextTs, event: 'debug.refresh', payload: { source: 'ui' } },
      ...current,
    ].slice(0, 40));
    setLoading(false);
  }

  function handleCall() {
    setCallError(null);
    setCallResult(null);
    let parsed: unknown;
    try {
      parsed = callParams.trim() ? JSON.parse(callParams) : {};
    } catch (error) {
      setCallError(`Invalid JSON params: ${String(error)}`);
      return;
    }

    const result = {
      ok: true,
      method: callMethod.trim() || 'unknown',
      params: parsed,
      ts: Date.now(),
      mocked: true,
    };
    setCallResult(result);
    setEventLog((current) => [
      { ts: Date.now(), event: 'debug.call', payload: { method: callMethod.trim() || 'unknown' } },
      ...current,
    ].slice(0, 40));
  }

  const securityToneClass =
    securitySummary.critical > 0
      ? 'bg-destructive/10 text-destructive border-destructive/30'
      : securitySummary.warn > 0
        ? 'bg-warning/10 text-warning border-warning/30'
        : 'bg-success/10 text-success border-success/30';

  return (
    <div className="flex-1 w-full min-w-0 flex flex-col h-full bg-background p-6 md:p-8 overflow-y-auto space-y-6">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </Button>
      </div>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card className="bg-card border-border/70">
          <CardHeader>
            <CardTitle className="text-lg">Snapshots</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className={`rounded-md border px-3 py-2 text-sm ${securityToneClass}`}>
              Security audit: {securitySummary.critical} critical · {securitySummary.warn} warn ·{' '}
              {securitySummary.info} info
            </div>
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Status</p>
              <DataGrid data={status} />
              <details className="rounded-md border border-border/50 bg-muted/10 p-2">
                <summary className="text-xs text-muted-foreground cursor-pointer">Raw JSON</summary>
                <pre className="mt-2 text-xs overflow-auto">{JSON.stringify(status, null, 2)}</pre>
              </details>
            </div>
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Health</p>
              <DataGrid data={health} />
              <details className="rounded-md border border-border/50 bg-muted/10 p-2">
                <summary className="text-xs text-muted-foreground cursor-pointer">Raw JSON</summary>
                <pre className="mt-2 text-xs overflow-auto">{JSON.stringify(health, null, 2)}</pre>
              </details>
            </div>
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Heartbeat</p>
              <DataGrid data={heartbeat} />
              <details className="rounded-md border border-border/50 bg-muted/10 p-2">
                <summary className="text-xs text-muted-foreground cursor-pointer">Raw JSON</summary>
                <pre className="mt-2 text-xs overflow-auto">{JSON.stringify(heartbeat, null, 2)}</pre>
              </details>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border/70">
          <CardHeader>
            <CardTitle className="text-lg">Manual RPC</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <label className="block space-y-1">
              <span className="text-xs text-muted-foreground">Method</span>
              <Input
                value={callMethod}
                onChange={(event) => setCallMethod(event.target.value)}
                placeholder="system-presence"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-muted-foreground">Params (JSON)</span>
              <Textarea
                value={callParams}
                onChange={(event) => setCallParams(event.target.value)}
                className="min-h-[140px] font-mono text-xs"
              />
            </label>
            <div className="flex justify-end">
              <Button size="sm" onClick={handleCall}>
                Call
              </Button>
            </div>
            {callError ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {callError}
              </div>
            ) : null}
            {callResult ? (
              <div className="space-y-2">
                <DataGrid data={callResult} />
                <details className="rounded-md border border-border/50 bg-muted/10 p-2">
                  <summary className="text-xs text-muted-foreground cursor-pointer">Raw response</summary>
                  <pre className="mt-2 text-xs overflow-auto">{JSON.stringify(callResult, null, 2)}</pre>
                </details>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </section>

      <Card className="bg-card border-border/70">
        <CardHeader>
          <CardTitle className="text-lg">Models</CardTitle>
        </CardHeader>
        <CardContent>
          {models.length === 0 ? (
            <p className="text-sm text-muted-foreground">No models available.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {models.map((model, index) => (
                <div key={`${String(model.id ?? 'model')}-${index}`} className="rounded-md border border-border/50 bg-muted/20 p-3">
                  <p className="font-medium text-sm">{String(model.id ?? `model-${index + 1}`)}</p>
                  <p className="text-xs text-muted-foreground mt-1">provider: {String(model.provider ?? '-')}</p>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {Object.entries(model)
                      .filter(([key, value]) => key !== 'id' && key !== 'provider' && typeof value === 'boolean')
                      .map(([key, value]) => (
                        <Badge key={key} variant={value ? 'secondary' : 'outline'} className="text-[10px] capitalize">
                          {key}
                        </Badge>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-card border-border/70">
        <CardHeader className="flex flex-row justify-between items-center">
          <CardTitle className="text-lg">Event Log</CardTitle>
          <Badge variant="outline" className="border-border/50 bg-muted/30">
            {eventLog.length} events
          </Badge>
        </CardHeader>
        <CardContent>
          {eventLog.length === 0 ? (
            <p className="text-sm text-muted-foreground">No events yet.</p>
          ) : (
            <div className="space-y-3">
              {eventLog.map((entry, index) => (
                <div key={`${entry.ts}-${index}`} className="rounded-md border border-border/50 bg-muted/20 p-3">
                  <div className="flex items-center justify-between mb-2 gap-2">
                    <p className="font-medium text-sm">{entry.event}</p>
                    <p className="text-xs text-muted-foreground">{new Date(entry.ts).toLocaleTimeString()}</p>
                  </div>
                  {isRecord(entry.payload) ? (
                    <DataGrid data={entry.payload} />
                  ) : (
                    <p className="text-xs">{formatScalar(entry.payload)}</p>
                  )}
                  <details className="mt-2 rounded-md border border-border/50 bg-muted/10 p-2">
                    <summary className="text-xs text-muted-foreground cursor-pointer">Raw payload</summary>
                    <pre className="mt-2 text-xs overflow-auto">{formatPayload(entry.payload)}</pre>
                  </details>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default DebugPage;
