import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import type { AgentRuntimeData } from './agent-types';

type AgentFilesPanelProps = {
  runtime: AgentRuntimeData;
};

export function AgentFilesPanel({ runtime }: AgentFilesPanelProps) {
  const files = runtime.files;
  const [activeName, setActiveName] = useState<string>(files[0]?.name ?? '');
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    const nextName = runtime.files[0]?.name ?? '';
    setActiveName(nextName);
    setDrafts(
      Object.fromEntries(runtime.files.map((file) => [file.name, file.content])),
    );
  }, [runtime]);

  const activeFile = useMemo(
    () => files.find((file) => file.name === activeName) ?? null,
    [files, activeName],
  );

  const draft = activeFile ? (drafts[activeFile.name] ?? '') : '';
  const dirty = activeFile ? draft !== activeFile.content : false;

  return (
    <Card className="bg-card border-border/70">
      <CardHeader className="flex flex-row justify-between items-start">
        <div>
          <CardTitle className="text-lg">Core Files</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Edit agent bootstrap files and instruction artifacts.
          </p>
        </div>
        <Button variant="outline" size="sm" className="border-border/50 bg-transparent hover:bg-muted/50">
          Refresh
        </Button>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4">
          <div className="border border-border/50 rounded-lg divide-y divide-border/50 bg-muted/20">
            {files.map((file) => (
              <button
                key={file.name}
                onClick={() => setActiveName(file.name)}
                className={`w-full text-left p-3 hover:bg-muted/50 transition-colors ${
                  activeName === file.name ? 'bg-muted/70' : ''
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-mono text-xs text-foreground">{file.name}</p>
                  {file.missing ? (
                    <Badge variant="outline" className="text-[10px] border-border/50 bg-muted/40">
                      Missing
                    </Badge>
                  ) : null}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {file.size} • {file.updatedAt}
                </p>
              </button>
            ))}
          </div>

          <div className="border border-border/50 rounded-lg p-4 bg-muted/20">
            {!activeFile ? (
              <p className="text-sm text-muted-foreground">Select a file to edit.</p>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-mono text-xs">{activeFile.name}</p>
                    <p className="font-mono text-[11px] text-muted-foreground">{activeFile.path}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!dirty}
                      onClick={() =>
                        setDrafts((prev) => ({ ...prev, [activeFile.name]: activeFile.content }))
                      }
                    >
                      Reset
                    </Button>
                    <Button size="sm" disabled={!dirty}>
                      Save
                    </Button>
                  </div>
                </div>
                <Textarea
                  className="min-h-[320px] font-mono text-xs"
                  value={draft}
                  onChange={(event) =>
                    setDrafts((prev) => ({ ...prev, [activeFile.name]: event.target.value }))
                  }
                />
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
