import { useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Loader2, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ThinkingBlock } from './thinking-block';
import { ToolUseBlock } from './tool-use-block';
import type { ConversationItem } from '@/lib/types';

type ToolItem = Extract<ConversationItem, { kind: 'tool_use' }>;
type ThinkingItem = Extract<ConversationItem, { kind: 'thinking' }>;

interface ToolUseGroupProps {
  tools: ToolItem[];
  thinking?: ThinkingItem[];
}

// Stable empty array to avoid creating a new reference on every render
const EMPTY_THINKING: ThinkingItem[] = [];

export function ToolUseGroup({ tools, thinking = EMPTY_THINKING }: ToolUseGroupProps) {
  // Hide the entire group while request_user_input is running — the input card
  // is already shown in the timeline and the tool details are noise at that point.
  const isAwaitingUserInput = tools.every(
    (t) => t.tool_name === 'request_user_input' && t.status === 'running',
  );

  const hasRunning = tools.some((t) => t.status === 'running') || thinking.some((t) => !t.done);
  const [userOverride, setUserOverride] = useState<boolean | null>(null);
  // Track whether tools have ever run during this component's lifetime so we can
  // keep the group expanded after the run completes (tools collapse on re-mount
  // from history, but stay open after a live run finishes in the same session).
  const locallyRanRef = useRef(false);

  // Derived state: detect when hasRunning transitions true → auto-expand and reset user override.
  // This uses React's render-time state update pattern to avoid a useEffect.
  const [prevHasRunning, setPrevHasRunning] = useState(hasRunning);
  if (hasRunning !== prevHasRunning) {
    setPrevHasRunning(hasRunning);
    if (hasRunning) {
      locallyRanRef.current = true;
      setUserOverride(null);
    }
  }

  if (isAwaitingUserInput) return null;

  const isExpanded = userOverride !== null ? userOverride : (hasRunning || locallyRanRef.current);

  const count = tools.length;
  const label = hasRunning
    ? 'Using tools\u2026'
    : `Used ${count} tool${count === 1 ? '' : 's'}`;

  return (
    <div className="py-1 animate-in fade-in duration-200">
      {/* Group header */}
      <button
        type="button"
        onClick={() => setUserOverride(!isExpanded)}
        className="flex items-center gap-1.5 text-left group"
      >
        {hasRunning ? (
          <Loader2 size={11} className="text-amber-400/80 animate-spin shrink-0" />
        ) : (
          <Wrench size={11} className="text-muted-foreground/35 shrink-0" />
        )}
        <span
          className={cn(
            'text-[12px] transition-colors select-none',
            hasRunning
              ? 'text-amber-400/80'
              : 'text-muted-foreground/50 group-hover:text-muted-foreground/70',
          )}
        >
          {label}
        </span>
        {isExpanded ? (
          <ChevronDown size={10} className="text-muted-foreground/30" />
        ) : (
          <ChevronRight size={10} className="text-muted-foreground/30" />
        )}
      </button>

      {/* Expanded content: thinking block(s) then tool list */}
      {isExpanded && (
        <div className="mt-1.5 pl-3 border-l border-border/25 space-y-1">
          {thinking.map((t) => (
            <ThinkingBlock key={t.id} content={t.content} done={t.done} nested />
          ))}
          {tools.map((tool) => (
            <ToolUseBlock key={tool.id} item={tool} nested />
          ))}
        </div>
      )}
    </div>
  );
}
