import { useState } from 'react';
import type { InjectedContextFile, RegisteredTool, RunSnapshot, SoulMemoryFile, SoulMemoryStateResponse, ToolCall } from '@/lib/types';

function runStateBadge(state: string) {
  const styles: Record<string, string> = {
    completed: 'bg-success/10 text-success',
    failed: 'bg-destructive/10 text-destructive',
    running: 'bg-primary/10 text-primary',
    queued: 'bg-muted text-muted-foreground',
    aborted: 'bg-warning/10 text-warning',
    blocked: 'bg-destructive/10 text-destructive',
    awaiting_approval: 'bg-warning/10 text-warning',
  };
  return styles[state] ?? 'bg-gray-100 text-gray-700';
}

export function ToolCallSummaryPanel({ toolCalls }: { toolCalls: { msgIndex: number, call: ToolCall }[] }) {
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        Tool Calls ({toolCalls.length})
      </div>
      {toolCalls.length === 0 ? (
        <div className="text-xs text-muted-foreground">No tool calls yet</div>
      ) : (
        toolCalls.map(({ msgIndex, call }, idx) => (
          <div
            key={`${call.id}-${idx}`}
            className="border border-border rounded px-2 py-1.5 text-xs space-y-0.5 bg-card"
          >
            <div className="flex items-center justify-between">
              <span className="font-mono font-semibold text-warning">
                {call.name}
              </span>
              <span className="text-muted-foreground font-mono">msg #{msgIndex + 1}</span>
            </div>
            <pre className="text-muted-foreground whitespace-pre-wrap break-all font-sans">
              {JSON.stringify(call.arguments, null, 2).slice(0, 200)}
            </pre>
          </div>
        ))
      )}
    </div>
  );
}

export function RunHistoryPanel({ runs }: { runs: RunSnapshot[] }) {
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        Runs ({runs.length})
      </div>
      {runs.length === 0 ? (
        <div className="text-xs text-muted-foreground">No runs</div>
      ) : (
        runs.map((run) => (
          <div
            key={run.id}
            className="border border-border rounded px-2 py-1.5 text-xs bg-card space-y-1"
          >
            <div className="flex items-center justify-between gap-1">
              <span
                className={`text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide ${runStateBadge(run.state)}`}
              >
                {run.state}
              </span>
              <span className="font-mono text-muted-foreground">
                {run.provider} / {run.model}
              </span>
            </div>
            <div className="text-muted-foreground truncate">
              {run.title || run.id.slice(0, 20)}
            </div>
            {run.activeTool && (
              <div className="text-warning font-mono">
                ⚙ {run.activeTool}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}

export function RegisteredToolsPanel({ tools }: { tools: RegisteredTool[] }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? tools : tools.slice(0, 8);
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        Registered Tools ({tools.length})
      </div>
      {tools.length === 0 ? (
        <div className="text-xs text-muted-foreground">No tools registered</div>
      ) : (
        <>
          {visible.map((tool) => (
            <div
              key={tool.name}
              className="border border-border rounded px-2 py-1.5 text-xs bg-card space-y-0.5"
            >
              <div className="font-mono font-semibold text-primary">{tool.name}</div>
              <div className="text-muted-foreground leading-snug">{tool.description}</div>
            </div>
          ))}
          {tools.length > 8 && (
            <button
              onClick={() => setExpanded((e) => !e)}
              className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              {expanded ? 'Show less' : `+${tools.length - 8} more`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

const PREVIEW_CHARS = 400;

function InjectedFileRow({ file }: { file: InjectedContextFile }) {
  const [expanded, setExpanded] = useState(false);
  const isMissing = file.content.startsWith('[MISSING:');
  const showExpand = !isMissing && file.content.length > PREVIEW_CHARS && !expanded;
  const displayContent = (!expanded && file.content.length > PREVIEW_CHARS)
    ? file.content.slice(0, PREVIEW_CHARS) + '…'
    : file.content;

  return (
    <div className={`border rounded text-xs overflow-hidden ${file.truncated ? 'border-warning/40' : 'border-border'} bg-card`}>
      <div className="flex items-center justify-between px-2 py-1.5 border-b border-border/60">
        <span className={`font-mono font-semibold ${isMissing ? 'text-muted-foreground' : 'text-foreground'}`}>
          {file.label}
        </span>
        <div className="flex items-center gap-2">
          {file.truncated && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-warning/20 text-warning uppercase tracking-wide">truncated</span>
          )}
          {!isMissing && (
            <span className="text-muted-foreground">
              {file.truncated
                ? `${file.content.length.toLocaleString()} / ${file.originalLen.toLocaleString()} chars`
                : `${file.content.length.toLocaleString()} chars`}
            </span>
          )}
        </div>
      </div>
      <div className="px-2 py-1.5">
        <pre className="whitespace-pre-wrap break-words text-muted-foreground font-sans leading-relaxed">
          {displayContent}
        </pre>
        {showExpand && (
          <button
            onClick={() => setExpanded(true)}
            className="mt-1 text-[10px] text-primary hover:underline"
          >
            +{(file.content.length - PREVIEW_CHARS).toLocaleString()} more chars
          </button>
        )}
        {expanded && (
          <button
            onClick={() => setExpanded(false)}
            className="mt-1 text-[10px] text-primary hover:underline"
          >
            Show less
          </button>
        )}
      </div>
    </div>
  );
}

export function BootstrapFilesPanel({ soulMemory }: { soulMemory: SoulMemoryStateResponse | null }) {
  if (!soulMemory) return null;

  const {
    injectedContext = [],
    truncationWarnings = [],
    bootstrap,
  } = soulMemory as SoulMemoryStateResponse & {
    injectedContext?: InjectedContextFile[];
    truncationWarnings?: string[];
  };
  const totalInjected = injectedContext.reduce((sum, f) => sum + f.content.length, 0);
  const truncatedCount = injectedContext.filter((f) => f.truncated).length;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Injected Context ({injectedContext.length} files)
        </div>
        {totalInjected > 0 && (
          <div className="text-[10px] text-muted-foreground">
            {totalInjected.toLocaleString()} chars injected
          </div>
        )}
      </div>

      {/* BOOTSTRAP.md active banner */}
      {bootstrap.exists && (
        <div className="border border-warning rounded px-2 py-1.5 text-xs bg-warning/5 flex items-center justify-between">
          <span className="font-mono font-semibold text-foreground">BOOTSTRAP.md</span>
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-warning/20 text-warning uppercase tracking-wide">
            active · overrides agent prompt
          </span>
        </div>
      )}

      {/* Truncation warnings */}
      {truncationWarnings.length > 0 && (
        <div className="border border-warning/40 rounded px-2 py-1.5 text-[10px] text-warning space-y-0.5 bg-warning/5">
          <div className="font-semibold">⚠ Truncation</div>
          {truncationWarnings.map((w, i) => <div key={i}>{w}</div>)}
        </div>
      )}

      {/* Injected files (actual content from context window) */}
      {injectedContext.length === 0 ? (
        <div className="text-xs text-muted-foreground">No files injected</div>
      ) : (
        injectedContext.map(f => <InjectedFileRow key={f.label} file={f} />)
      )}

      {truncatedCount > 0 && (
        <div className="text-[10px] text-muted-foreground">
          {truncatedCount} file{truncatedCount > 1 ? 's' : ''} truncated · raise bootstrap.max_chars_per_file in config.toml
        </div>
      )}
    </div>
  );
}

export function SoulMemoryPanel({ soulMemory }: { soulMemory: SoulMemoryStateResponse | null }) {
  if (!soulMemory) return null;
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        Soul Memory Files
      </div>
      {[soulMemory.soul, ...soulMemory.identityFiles, soulMemory.memory].map((f) => (
        <div
          key={f.name}
          className="border border-border rounded px-2 py-1.5 text-xs bg-card"
        >
          <div className="flex items-center justify-between">
            <span
              className={`font-mono ${f.exists ? 'text-foreground' : 'text-muted-foreground line-through'}`}
            >
              {f.name}
            </span>
            <span className={f.exists ? 'text-success' : 'text-destructive'}>
              {f.exists ? '✓' : '✗'}
            </span>
          </div>
          {f.exists && (
            <div className="text-muted-foreground mt-0.5">
              {f.lineCount} lines · {f.sizeBytes}B
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
