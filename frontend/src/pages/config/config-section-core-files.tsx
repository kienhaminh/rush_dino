import { useEffect, useState } from 'react';
import { fetchSoulMemoryState, patchSoulMemoryFile } from '@/lib/api';
import type { SoulMemoryFile, SoulMemoryStateResponse } from '@/lib/types';

// Core files that can be viewed and edited
const CORE_FILE_NAMES = [
  'BOOTSTRAP.md',
  'SOUL.md',
  'MEMORY.md',
  'IDENTITY.md',
  'USER.md',
  'AGENTS.md',
  'TOOLS.md',
  'HEARTBEAT.md',
] as const;

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

function CoreFileEditor({ file, onSaved }: { file: SoulMemoryFile; onSaved: (updated: SoulMemoryFile) => void }) {
  const [content, setContent] = useState(file.content);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const isDirty = content !== file.content;

  // Sync when file prop changes (e.g. after external refresh)
  useEffect(() => {
    setContent(file.content);
    setStatus('idle');
  }, [file.content]);

  async function handleSave() {
    setStatus('saving');
    setErrorMsg('');
    try {
      const updated = await patchSoulMemoryFile(file.name, content);
      onSaved(updated);
      setContent(updated.content);
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 2500);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save');
      setStatus('error');
    }
  }

  function handleDiscard() {
    setContent(file.content);
    setStatus('idle');
  }

  return (
    <div className={`border rounded-lg overflow-hidden ${file.exists ? 'border-border' : 'border-border/40'}`}>
      {/* File header */}
      <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b border-border/60">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-semibold text-foreground">{file.name}</span>
          {file.exists ? (
            <span className="text-[10px] text-muted-foreground">
              {file.lineCount} lines · {file.sizeBytes}B
            </span>
          ) : (
            <span className="text-[10px] text-muted-foreground italic">not created yet</span>
          )}
          {isDirty && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
              unsaved
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {status === 'saved' && (
            <span className="text-[10px] text-success font-semibold">Saved</span>
          )}
          {status === 'error' && (
            <span className="text-[10px] text-destructive font-semibold" title={errorMsg}>Error</span>
          )}
          {isDirty && (
            <button
              onClick={handleDiscard}
              className="text-[10px] px-2 py-1 border border-border rounded hover:bg-muted transition-colors text-muted-foreground"
            >
              Discard
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={!isDirty || status === 'saving'}
            className="text-[10px] px-2 py-1 border border-primary/40 text-primary rounded hover:bg-primary/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed font-semibold"
          >
            {status === 'saving' ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {/* Editable textarea */}
      <textarea
        value={content}
        onChange={(e) => { setContent(e.target.value); setStatus('idle'); }}
        className="w-full min-h-[160px] px-3 py-2 font-mono text-xs bg-background text-foreground resize-y focus:outline-none placeholder:text-muted-foreground/40"
        placeholder={`# ${file.name}\n\nStart writing here…`}
        spellCheck={false}
      />
    </div>
  );
}

export function ConfigSectionCoreFiles() {
  const [soulMemory, setSoulMemory] = useState<SoulMemoryStateResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSoulMemoryState()
      .then(setSoulMemory)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  function handleFileSaved(name: string, updated: SoulMemoryFile) {
    setSoulMemory((prev) => {
      if (!prev) return prev;
      // Update the matching file in the response
      const updateFile = (f: SoulMemoryFile) => f.name === name ? updated : f;
      return {
        ...prev,
        bootstrap: updateFile(prev.bootstrap),
        soul: updateFile(prev.soul),
        memory: updateFile(prev.memory),
        identityFiles: prev.identityFiles.map(updateFile),
      };
    });
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground animate-pulse">Loading core files…</p>;
  }

  if (error || !soulMemory) {
    return <p className="text-sm text-destructive">{error ?? 'Failed to load core files.'}</p>;
  }

  // Gather all core files in display order
  const fileMap = new Map<string, SoulMemoryFile>();
  [soulMemory.bootstrap, soulMemory.soul, soulMemory.memory, ...soulMemory.identityFiles].forEach((f) => {
    fileMap.set(f.name, f);
  });

  const files = CORE_FILE_NAMES.map((name) => fileMap.get(name)).filter((f): f is SoulMemoryFile => f != null);

  return (
    <div className="space-y-3">
      {soulMemory.dataDir && (
        <p className="text-[11px] text-muted-foreground font-mono">{soulMemory.dataDir}</p>
      )}
      {files.map((file) => (
        <CoreFileEditor
          key={file.name}
          file={file}
          onSaved={(updated) => handleFileSaved(file.name, updated)}
        />
      ))}
    </div>
  );
}
