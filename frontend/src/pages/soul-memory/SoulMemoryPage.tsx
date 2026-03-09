import { useCallback, useEffect, useMemo, useState } from 'react';
import { DatabaseIcon, RefreshCwIcon, ScrollTextIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { fetchSoulMemoryState } from '@/lib/api';
import type { SoulMemoryFile, SoulMemoryStateResponse } from '@/lib/types';

const EMPTY_STATE: SoulMemoryStateResponse = {
  dataDir: '',
  soul: {
    name: 'SOUL.md',
    path: '',
    exists: false,
    updatedAt: null,
    sizeBytes: 0,
    lineCount: 0,
    content: '',
  },
  memory: {
    name: 'MEMORY.md',
    path: '',
    exists: false,
    updatedAt: null,
    sizeBytes: 0,
    lineCount: 0,
    content: '',
  },
  identityFiles: [],
  dailyFiles: [],
};

function formatTimestamp(value?: string | null) {
  if (!value) return 'n/a';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function FileSnapshotCard({
  title,
  description,
  file,
  icon,
}: {
  title: string;
  description: string;
  file: SoulMemoryFile;
  icon: React.ReactNode;
}) {
  return (
    <Card className="border-border/60 bg-card/80">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          {icon}
          {title}
        </CardTitle>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <Badge variant={file.exists ? 'secondary' : 'outline'}>
            {file.exists ? 'present' : 'missing'}
          </Badge>
          <span>{file.path || 'path unavailable'}</span>
          <span>{file.lineCount} lines</span>
          <span>{file.sizeBytes} bytes</span>
          <span>Updated {formatTimestamp(file.updatedAt)}</span>
        </div>
        <pre className="max-h-[420px] overflow-auto rounded-2xl border border-border/50 bg-background/60 p-4 text-xs leading-6 text-foreground whitespace-pre-wrap break-words">
          {file.content || 'No content.'}
        </pre>
      </CardContent>
    </Card>
  );
}

export function SoulMemoryPage() {
  const [state, setState] = useState<SoulMemoryStateResponse>(EMPTY_STATE);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'initial') {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    try {
      const nextState = await fetchSoulMemoryState();
      setState(nextState);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load shared soul and memory.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(
    () => ({
      soulLines: state.soul.lineCount,
      memoryLines: state.memory.lineCount,
      dailyFiles: state.dailyFiles.length,
      identityFiles: state.identityFiles.filter((file) => file.exists).length,
    }),
    [state],
  );

  return (
    <div className="flex-1 min-w-0 h-full overflow-y-auto bg-background px-6 py-6 md:px-8 md:py-8 flex flex-col gap-6 w-full">
      <section className="rounded-[28px] border border-border/60 bg-card/70 p-6 shadow-[0_20px_80px_-50px_rgba(0,0,0,0.7)] backdrop-blur-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-4">
            <Badge variant="outline" className="text-[10px] uppercase tracking-[0.28em]">
              Shared runtime state
            </Badge>
            <div className="space-y-2">
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                Monitor the live soul and memory files loaded from the current RushDino data
                directory. This view reflects the current on-disk state in `.rushdino`, not the old
                mock agent metadata.
              </p>
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span>Data dir: {state.dataDir || 'n/a'}</span>
                <span>Soul lines: {stats.soulLines}</span>
                <span>Memory lines: {stats.memoryLines}</span>
                <span>Identity files: {stats.identityFiles}</span>
                <span>Daily files: {stats.dailyFiles}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void load('refresh')} disabled={loading || refreshing}>
              <RefreshCwIcon className={`mr-2 h-4 w-4 ${(loading || refreshing) ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>
      </section>

      {error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {loading ? (
        <Card className="border-border/60 bg-card/80">
          <CardContent className="p-6 text-sm text-muted-foreground">
            Loading shared soul and memory…
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="border-border/60 bg-card/80">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Monitoring snapshot</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-4">
              <div className="rounded-2xl border border-border/50 bg-background/50 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Soul file</p>
                <p className="mt-2 text-sm text-foreground/80">{formatTimestamp(state.soul.updatedAt)}</p>
              </div>
              <div className="rounded-2xl border border-border/50 bg-background/50 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Memory file</p>
                <p className="mt-2 text-sm text-foreground/80">{formatTimestamp(state.memory.updatedAt)}</p>
              </div>
              <div className="rounded-2xl border border-border/50 bg-background/50 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Tools notes</p>
                <p className="mt-2 text-sm text-foreground/80">
                  {state.identityFiles.find((file) => file.name === 'TOOLS.md')?.exists
                    ? 'TOOLS.md present'
                    : 'TOOLS.md missing'}
                </p>
              </div>
              <div className="rounded-2xl border border-border/50 bg-background/50 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Daily memory files</p>
                <p className="mt-2 text-sm text-foreground/80">{state.dailyFiles.length}</p>
              </div>
            </CardContent>
          </Card>

          <FileSnapshotCard
            title="Soul"
            description="Current contents of `.rushdino/SOUL.md`, which the runtime loads as part of its identity context."
            file={state.soul}
            icon={<DatabaseIcon className="h-4 w-4 text-primary" />}
          />

          <FileSnapshotCard
            title="Memory"
            description="Current contents of canonical `.rushdino/MEMORY.md`, with fallback support for legacy `.rushdino/memory/MEMORY.md` during migration."
            file={state.memory}
            icon={<ScrollTextIcon className="h-4 w-4 text-primary" />}
          />

          <Card className="border-border/60 bg-card/80">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Identity Context Files</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {state.identityFiles.map((file) => (
                <div
                  key={file.name}
                  className="rounded-2xl border border-border/50 bg-background/50 px-4 py-4"
                >
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{file.name}</span>
                    <Badge variant={file.exists ? 'secondary' : 'outline'}>
                      {file.exists ? 'present' : 'missing'}
                    </Badge>
                    <span>{file.lineCount} lines</span>
                    <span>Updated {formatTimestamp(file.updatedAt)}</span>
                  </div>
                  {file.content ? (
                    <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-border/40 bg-background/60 p-3 text-xs leading-6">
                      {file.content}
                    </pre>
                  ) : null}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/80">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Recent Daily Memory</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {state.dailyFiles.length === 0 ? (
                <p className="text-sm text-muted-foreground">No daily memory files found.</p>
              ) : (
                state.dailyFiles.slice(0, 7).map((file) => (
                  <div
                    key={file.path}
                    className="rounded-2xl border border-border/50 bg-background/50 px-4 py-4"
                  >
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{file.name}</span>
                      <span>{file.lineCount} lines</span>
                      <span>Updated {formatTimestamp(file.updatedAt)}</span>
                    </div>
                    {file.content ? (
                      <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-border/40 bg-background/60 p-3 text-xs leading-6">
                        {file.content}
                      </pre>
                    ) : null}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
