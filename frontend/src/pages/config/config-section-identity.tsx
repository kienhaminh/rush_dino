import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCwIcon } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { fetchSoulMemoryState } from '@/lib/api';
import type { SoulMemoryStateResponse } from '@/lib/types';

const EMPTY_STATE: SoulMemoryStateResponse = {
  dataDir: '',
  bootstrap: {
    name: 'bootstrap.md',
    path: '',
    exists: false,
    updatedAt: null,
    sizeBytes: 0,
    lineCount: 0,
    content: '',
  },
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
  injectedContext: [],
  truncationWarnings: [],
};

function formatTimestamp(value?: string | null) {
  if (!value) return 'n/a';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function ConfigSectionIdentity() {
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
      const next = await fetchSoulMemoryState();
      setState(next);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load identity context.');
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
      identityFiles: state.identityFiles.filter((file) => file.exists).length,
      dailyFiles: state.dailyFiles.length,
    }),
    [state],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-border/50 bg-background/50 p-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Shared identity context lives here now. This section monitors the soul and memory files
            that the runtime loads into long-lived agent behavior.
          </p>
          <div className="flex flex-wrap gap-3 text-xs uppercase tracking-[0.16em] text-muted-foreground">
            <span>{stats.soulLines} soul lines</span>
            <span>{stats.memoryLines} memory lines</span>
            <span>{stats.identityFiles} identity files</span>
            <span>{stats.dailyFiles} daily files</span>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void load('refresh')}
          disabled={loading || refreshing}
        >
          <RefreshCwIcon className={`mr-2 h-4 w-4 ${loading || refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-2xl border border-border/50 bg-background/50 px-4 py-8 text-sm text-muted-foreground">
          Loading identity context…
        </div>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            {[state.soul, state.memory].map((file) => (
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
                  <span>{file.sizeBytes} bytes</span>
                  <span>Updated {formatTimestamp(file.updatedAt)}</span>
                </div>
                <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-border/40 bg-card/70 p-3 text-xs leading-6">
                  {file.content || 'No content.'}
                </pre>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-border/50 bg-background/50 px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium">Identity context files</p>
              <span className="text-xs text-muted-foreground">
                {state.identityFiles.length} tracked files
              </span>
            </div>
            <div className="mt-3 space-y-3">
              {state.identityFiles.length === 0 ? (
                <p className="text-sm text-muted-foreground">No identity files were found.</p>
              ) : (
                state.identityFiles.map((file) => (
                  <div
                    key={file.name}
                    className="rounded-xl border border-border/40 bg-card/60 px-3 py-3"
                  >
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{file.name}</span>
                      <Badge variant={file.exists ? 'secondary' : 'outline'}>
                        {file.exists ? 'present' : 'missing'}
                      </Badge>
                      <span>{file.lineCount} lines</span>
                      <span>Updated {formatTimestamp(file.updatedAt)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
