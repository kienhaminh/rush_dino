import { useState } from 'react';
import { Terminal, CheckCircle2, XCircle, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ConversationItem } from '@/lib/types';

type ToolItem = Extract<ConversationItem, { kind: 'tool_use' }>;

interface ToolUseBlockProps {
  item: ToolItem;
}

function formatToolName(name: string) {
  return name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Extract a short, human-readable hint from the tool's args to show inline. */
function toolSummary(name: string, args: Record<string, unknown>): string | null {
  const str = (key: string) => {
    const v = args[key];
    return typeof v === 'string' ? v : null;
  };
  const truncate = (s: string, max = 60) =>
    s.length > max ? s.slice(0, max) + '…' : s;

  switch (name) {
    case 'read_file':
    case 'read':
      return str('path') ? truncate(str('path')!, 50) : null;
    case 'write_file':
    case 'write':
      return str('path') ? truncate(str('path')!, 50) : null;
    case 'edit_file':
    case 'edit':
      return str('path') ? truncate(str('path')!, 50) : null;
    case 'shell_exec':
    case 'exec':
    case 'bash': {
      const cmd = str('command') ?? str('cmd');
      return cmd ? truncate(cmd) : null;
    }
    case 'web_search':
      return str('query') ? truncate(str('query')!) : null;
    case 'web_fetch':
    case 'fetch':
      return str('url') ? truncate(str('url')!) : null;
    case 'delegate':
    case 'delegate_to_agent': {
      const agent = str('agent_name');
      const task = str('task');
      return agent ? (task ? `${agent} — ${truncate(task, 40)}` : agent) : null;
    }
    default: {
      // Fall back to the first string-valued arg if there is one.
      for (const v of Object.values(args)) {
        if (typeof v === 'string' && v.length > 0) return truncate(v);
      }
      return null;
    }
  }
}

export function ToolUseBlock({ item }: ToolUseBlockProps) {
  const [expanded, setExpanded] = useState(false);
  const isDone = item.status === 'done';
  const isError = item.status === 'error';
  const isRunning = item.status === 'running';

  return (
    <div className="flex items-start gap-3 py-1 animate-in fade-in slide-in-from-bottom-1 duration-200">
      <div className="w-7 h-7 rounded-full bg-muted/60 border border-border/40 flex items-center justify-center shrink-0 mt-0.5">
        <Terminal
          size={12}
          className={cn(
            isRunning && 'text-amber-400 animate-pulse',
            isDone && 'text-emerald-400',
            isError && 'text-red-400',
          )}
        />
      </div>

      <div
        className={cn(
          'flex-1 rounded-xl border bg-muted/30 overflow-hidden transition-all duration-200',
          'hover:border-border/60 cursor-pointer',
          isError ? 'border-red-500/20' : 'border-border/30',
        )}
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-2 px-3 py-2 min-w-0">
          <span className="text-[12px] font-semibold text-foreground/80 shrink-0">
            {formatToolName(item.tool_name)}
          </span>
          {toolSummary(item.tool_name, item.args as Record<string, unknown>) && (
            <span className="text-[11px] text-muted-foreground/50 truncate font-mono">
              {toolSummary(item.tool_name, item.args as Record<string, unknown>)}
            </span>
          )}
          <div className="ml-auto flex items-center gap-1.5">
            {isRunning && <Loader2 size={11} className="text-amber-400 animate-spin" />}
            {isDone && <CheckCircle2 size={11} className="text-emerald-400" />}
            {isError && <XCircle size={11} className="text-red-400" />}
            {expanded ? (
              <ChevronDown size={11} className="text-muted-foreground/60" />
            ) : (
              <ChevronRight size={11} className="text-muted-foreground/60" />
            )}
          </div>
        </div>

        {expanded && (
          <div className="border-t border-border/20 px-3 pb-3 pt-2 space-y-2">
            {Object.keys(item.args).length > 0 && (
              <div>
                <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/40 mb-1">
                  Input
                </p>
                <pre className="text-[11px] text-muted-foreground/80 whitespace-pre-wrap break-words bg-background/50 rounded-lg p-2 border border-border/20 max-h-32 overflow-y-auto">
                  {JSON.stringify(item.args, null, 2)}
                </pre>
              </div>
            )}
            {item.result !== undefined && (
              <div>
                <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/40 mb-1">
                  {isError ? 'Error' : 'Output'}
                </p>
                <pre
                  className={cn(
                    'text-[11px] whitespace-pre-wrap break-words bg-background/50 rounded-lg p-2 border border-border/20 max-h-32 overflow-y-auto',
                    isError ? 'text-red-400/80' : 'text-muted-foreground/80',
                  )}
                >
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
