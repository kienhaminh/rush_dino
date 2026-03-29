import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ConversationItem } from '@/lib/types';

type ToolItem = Extract<ConversationItem, { kind: 'tool_use' }>;

interface ToolUseBlockProps {
  item: ToolItem;
  nested?: boolean;
}

function formatToolName(name: string) {
  return name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** One-line hint shown inline in the header. */
function toolSummary(name: string, args: Record<string, unknown>): string | null {
  const str = (key: string) => (typeof args[key] === 'string' ? (args[key] as string) : null);
  const trim = (s: string, max = 60) => (s.length > max ? s.slice(0, max) + '…' : s);

  switch (name) {
    case 'read_file': case 'read':
    case 'write_file': case 'write':
    case 'edit_file': case 'edit':
      return str('path') ? trim(str('path')!, 50) : null;
    case 'shell_exec': case 'exec': case 'bash':
      return str('command') ?? str('cmd') ? trim(str('command') ?? str('cmd') ?? '') : null;
    case 'web_search':
      return str('query') ? trim(str('query')!) : null;
    case 'web_fetch': case 'fetch':
      return str('url') ? trim(str('url')!) : null;
    case 'delegate': case 'delegate_to_agent': {
      const agent = str('agent_name');
      const task = str('task');
      return agent ? (task ? `${agent} — ${trim(task, 40)}` : agent) : null;
    }
    default:
      for (const v of Object.values(args)) {
        if (typeof v === 'string' && v.length > 0) return trim(v);
      }
      return null;
  }
}

export function ToolUseBlock({ item, nested = false }: ToolUseBlockProps) {
  const isDone = item.status === 'done';
  const isError = item.status === 'error';
  const isRunning = item.status === 'running';

  const [userOverride, setUserOverride] = useState<boolean | null>(null);
  const isExpanded = userOverride !== null ? userOverride : isRunning;

  useEffect(() => {
    setUserOverride(null);
  }, [item.status]);

  const args = item.args as Record<string, unknown>;
  const summary = toolSummary(item.tool_name, args);

  return (
    <div className={cn('animate-in fade-in duration-150', !nested && 'py-0.5')}>
      {/* ── Header row ── */}
      <button
        type="button"
        onClick={() => setUserOverride(!isExpanded)}
        className={cn(
          'w-full flex items-center gap-2 text-left rounded-lg transition-colors hover:bg-muted/30',
          nested ? 'px-2 py-1' : 'px-2.5 py-1.5',
          nested && cn(
            'border-l-2',
            isRunning && 'border-l-amber-400/50',
            isDone && 'border-l-emerald-400/30',
            isError && 'border-l-red-400/40',
          ),
        )}
      >
        {/* Status icon */}
        <span className="shrink-0">
          {isRunning && <Loader2 size={11} className="text-amber-400 animate-spin" />}
          {isDone && <CheckCircle2 size={11} className="text-emerald-400/70" />}
          {isError && <XCircle size={11} className="text-red-400/70" />}
        </span>

        {/* Tool name */}
        <span className="text-[12px] font-medium text-foreground/70 shrink-0">
          {formatToolName(item.tool_name)}
        </span>

        {/* Inline summary */}
        {summary && (
          <span className="text-[11px] text-muted-foreground/45 truncate font-mono flex-1 min-w-0">
            {summary}
          </span>
        )}

        {/* Expand chevron */}
        <span className="ml-auto shrink-0">
          {isExpanded
            ? <ChevronDown size={10} className="text-muted-foreground/30" />
            : <ChevronRight size={10} className="text-muted-foreground/30" />}
        </span>
      </button>

      {/* ── Expanded detail ── */}
      {isExpanded && (
        <div className={cn('mt-0.5', nested ? 'ml-5' : 'ml-2.5')}>
          {/* Output / error */}
          {item.result !== undefined ? (
            <pre className={cn(
              'text-[11px] whitespace-pre-wrap break-words rounded-lg px-2.5 py-2 max-h-44 overflow-y-auto scrollbar-thin leading-relaxed',
              isError
                ? 'text-red-400/80 bg-red-500/5'
                : 'text-muted-foreground/70 bg-muted/20',
            )}>
              {item.result}
            </pre>
          ) : (
            /* No result yet — show key input args compactly */
            Object.keys(args).length > 0 && (
              <div className="space-y-0.5 px-1">
                {Object.entries(args).map(([k, v]) => (
                  <div key={k} className="flex items-baseline gap-1.5 text-[11px]">
                    <span className="text-muted-foreground/35 shrink-0">{k}</span>
                    <span className="font-mono text-muted-foreground/60 truncate">{String(v)}</span>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
