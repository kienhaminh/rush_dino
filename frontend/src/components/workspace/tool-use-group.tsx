import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Loader2, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ToolUseBlock } from './tool-use-block';
import type { ConversationItem } from '@/lib/types';

type ToolItem = Extract<ConversationItem, { kind: 'tool_use' }>;

interface ToolUseGroupProps {
  tools: ToolItem[];
}

export function ToolUseGroup({ tools }: ToolUseGroupProps) {
  const hasRunning = tools.some((t) => t.status === 'running');
  const [userOverride, setUserOverride] = useState<boolean | null>(null);

  // Reset override when running state changes so auto-behaviour kicks in
  useEffect(() => {
    setUserOverride(null);
  }, [hasRunning]);

  const isExpanded = userOverride !== null ? userOverride : hasRunning;

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

      {/* Expanded tool list */}
      {isExpanded && (
        <div className="mt-1.5 pl-3 border-l border-border/25 space-y-1">
          {tools.map((tool) => (
            <ToolUseBlock key={tool.id} item={tool} nested />
          ))}
        </div>
      )}
    </div>
  );
}
