import { useEffect, useState } from 'react';
import { FileText, CheckCircle2, XCircle, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ConversationItem } from '@/lib/types';

type ToolItem = Extract<ConversationItem, { kind: 'tool_use' }>;

interface ToolUseBlockProps {
  item: ToolItem;
}

function formatToolName(name: string) {
  return name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Extract a short human-readable hint from the tool's args to show inline. */
function toolSummary(name: string, args: Record<string, unknown>): string | null {
  const str = (key: string) => {
    const v = args[key];
    return typeof v === 'string' ? v : null;
  };
  const truncate = (s: string, max = 60) =>
    s.length > max ? s.slice(0, max) + '\u2026' : s;

  switch (name) {
    case 'read_file': case 'read':
      return str('path') ? truncate(str('path')!, 50) : null;
    case 'write_file': case 'write':
      return str('path') ? truncate(str('path')!, 50) : null;
    case 'edit_file': case 'edit':
      return str('path') ? truncate(str('path')!, 50) : null;
    case 'shell_exec': case 'exec': case 'bash': {
      const cmd = str('command') ?? str('cmd');
      return cmd ? truncate(cmd) : null;
    }
    case 'web_search':
      return str('query') ? truncate(str('query')!) : null;
    case 'web_fetch': case 'fetch':
      return str('url') ? truncate(str('url')!) : null;
    case 'delegate': case 'delegate_to_agent': {
      const agent = str('agent_name');
      const task = str('task');
      return agent ? (task ? `${agent} \u2014 ${truncate(task, 40)}` : agent) : null;
    }
    default: {
      for (const v of Object.values(args)) {
        if (typeof v === 'string' && v.length > 0) return truncate(v);
      }
      return null;
    }
  }
}

/** Render a single arg value formatted by key name. */
function ArgValue({ argKey, value }: { argKey: string; value: unknown }) {
  const key = argKey.toLowerCase();

  if (key === 'path' || key === 'file_path' || key === 'file') {
    const str = String(value);
    return (
      <span className="flex items-center gap-1 font-mono text-[11px] text-foreground/70 break-all">
        <FileText size={10} className="shrink-0 text-muted-foreground/50" />
        {str}
      </span>
    );
  }
  if (key === 'command' || key === 'cmd') {
    const str = String(value);
    return (
      <code className="block font-mono text-[11px] text-foreground/70 bg-background/50 rounded px-1.5 py-0.5 whitespace-pre-wrap break-words">
        {str}
      </code>
    );
  }
  if (key === 'query' || key === 'search') {
    const str = String(value);
    return <span className="text-[11px] text-muted-foreground/70">{str}</span>;
  }
  return (
    <pre className="text-[11px] text-muted-foreground/70 bg-background/50 rounded px-1.5 py-0.5 whitespace-pre-wrap break-words max-h-32 overflow-y-auto scrollbar-thin">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export function ToolUseBlock({ item }: ToolUseBlockProps) {
  const isDone = item.status === 'done';
  const isError = item.status === 'error';
  const isRunning = item.status === 'running';

  // Smart collapse: auto-expanded while running, auto-collapsed when done/error.
  // User click overrides until next status change.
  const [userOverride, setUserOverride] = useState<boolean | null>(null);
  const isExpanded = userOverride !== null ? userOverride : isRunning;

  useEffect(() => {
    setUserOverride(null);
  }, [item.status]);

  const args = item.args as Record<string, unknown>;
  const summary = toolSummary(item.tool_name, args);

  return (
    <div className="py-1 animate-in fade-in duration-200" data-tool-name={item.tool_name}>
      <div
        className={[
          'rounded-xl border bg-muted/20 overflow-hidden border-l-4',
          isRunning ? 'border-amber-400/60 border-l-amber-400' : '',
          isDone ? 'border-emerald-400/30 border-l-emerald-400' : '',
          isError ? 'border-red-400/20 border-l-red-400' : '',
        ].filter(Boolean).join(' ')}
      >
        {/* Header — always visible, clickable */}
        <button
          type="button"
          onClick={() => setUserOverride(!isExpanded)}
          className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/20 transition-colors text-left min-w-0"
        >
          <span className="font-mono text-sm font-medium text-foreground/80 shrink-0">
            {formatToolName(item.tool_name)}
          </span>
          {summary && (
            <span className="text-[11px] text-muted-foreground/50 truncate font-mono flex-1">
              {summary}
            </span>
          )}
          <div className="ml-auto flex items-center gap-1.5 shrink-0">
            {isRunning && <Loader2 size={11} className="text-amber-400 animate-spin" />}
            {isDone && <CheckCircle2 size={11} className="text-emerald-400" />}
            {isError && <XCircle size={11} className="text-red-400" />}
            {isExpanded
              ? <ChevronDown size={11} className="text-muted-foreground/60" />
              : <ChevronRight size={11} className="text-muted-foreground/60" />}
          </div>
        </button>

        {/* Expanded content */}
        {isExpanded && (
          <div className="border-t border-border/20 px-3 pb-3 pt-2 space-y-2.5">
            {/* Input section */}
            {Object.keys(args).length > 0 && (
              <div>
                <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/40 mb-1.5">
                  INPUT
                </p>
                <div className="space-y-1.5">
                  {Object.entries(args).map(([key, value]) => (
                    <div key={key} className="flex flex-col gap-0.5">
                      <span className="text-[9px] uppercase tracking-widest text-muted-foreground/30">
                        {key}
                      </span>
                      <ArgValue argKey={key} value={value} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Output section */}
            {item.result !== undefined && (
              <div>
                <p className={cn(
                  'text-[9px] font-bold uppercase tracking-widest mb-1.5',
                  isError ? 'text-red-400/60' : 'text-muted-foreground/40',
                )}>
                  {isError ? 'Error' : 'Output'}
                </p>
                <pre className={cn(
                  'text-[11px] whitespace-pre-wrap break-words rounded-lg p-2 border max-h-48 overflow-y-auto scrollbar-thin',
                  isError
                    ? 'text-red-400/80 bg-red-500/5 border-red-500/20'
                    : 'text-muted-foreground/80 bg-background/50 border-border/20',
                )}>
                  {item.result}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
