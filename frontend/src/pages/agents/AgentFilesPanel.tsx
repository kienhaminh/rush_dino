import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import type { AgentRuntimeData } from './agent-types';
import { patchAgentFile } from '@/lib/api';

type AgentFilesPanelProps = {
  agentId: string;
  runtime: AgentRuntimeData;
};

export function AgentFilesPanel({ agentId, runtime }: AgentFilesPanelProps) {
  const files = runtime.files;
  const [activeName, setActiveName] = useState<string>(files[0]?.name ?? '');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const nextName = runtime.files[0]?.name ?? '';
    setActiveName(nextName);
    setDrafts(Object.fromEntries(runtime.files.map((file) => [file.name, file.content])));
  }, [runtime]);

  const activeFile = useMemo(
    () => files.find((file) => file.name === activeName) ?? null,
    [files, activeName],
  );

  const draft = activeFile ? (drafts[activeFile.name] ?? '') : '';
  const dirty = activeFile ? draft !== activeFile.content : false;

  const handleSave = async () => {
    if (!activeFile || !dirty) return;
    setSaving(true);
    try {
      await patchAgentFile(agentId, activeFile.name, draft);
      // Optimistically update the local file object inside the runtime state passed down via props
      // (a real app might mutate or trigger a full refresh. We'll simulate a local update)
      activeFile.content = draft;
      activeFile.missing = false;
      // Force a re-render by touching activeName slightly or relying on activeFile mutation
      setDrafts({ ...drafts, [activeFile.name]: draft });
    } catch (e) {
      console.error(e);
      alert('Failed to save file: ' + (e instanceof Error ? e.message : 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="bg-card border-border/50">
      <CardHeader className="flex flex-row justify-between items-start pb-4">
        <div>
          <CardTitle className="text-base">Core Files</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Edit agent bootstrap files and instruction artifacts.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs border-border/50 bg-transparent hover:bg-muted/50"
        >
          Refresh
        </Button>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4">
          <div className="border border-border/50 rounded-lg divide-y divide-border/50 bg-background/50">
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

          <div className="border border-border/50 rounded-lg p-4 bg-background/50">
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
                      className="h-8 text-xs"
                      disabled={!dirty}
                      onClick={() =>
                        setDrafts((prev) => ({ ...prev, [activeFile.name]: activeFile.content }))
                      }
                    >
                      Reset
                    </Button>
                    <Button
                      size="sm"
                      className="h-8 text-xs"
                      disabled={!dirty || saving}
                      onClick={handleSave}
                    >
                      {saving ? 'Saving...' : 'Save'}
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
