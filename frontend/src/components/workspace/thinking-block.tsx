import { useLayoutEffect, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ThinkingBlockProps {
  content?: string;
  done?: boolean;
}

export function ThinkingBlock({ content, done }: ThinkingBlockProps) {
  const [expanded, setExpanded] = useState(true);

  // Collapse synchronously before paint to avoid a flash of the expanded state.
  useLayoutEffect(() => {
    if (done) setExpanded(false);
  }, [done]);

  return (
    <div className="py-0.5 animate-in fade-in duration-200 ml-9">
      <button
        type="button"
        onClick={() => done && setExpanded((v) => !v)}
        className={cn(
          'flex items-center gap-2 text-left group rounded-lg px-2 py-1 -ml-2 transition-colors',
          done ? 'cursor-pointer hover:bg-muted/20' : 'cursor-default',
        )}
      >
        {/* Animated pulse ring while thinking */}
        {!done && (
          <span className="relative flex items-center justify-center w-3.5 h-3.5" aria-hidden>
            <span className="absolute inset-0 rounded-full bg-[hsl(var(--brand-cyan)/0.15)] animate-ping" />
            <span className="relative w-1.5 h-1.5 rounded-full bg-[hsl(var(--brand-cyan)/0.6)]" />
          </span>
        )}

        {done && (
          <span className="w-3.5 h-3.5 flex items-center justify-center">
            <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/25" />
          </span>
        )}

        <span className="text-[11px] text-muted-foreground/40 italic select-none group-hover:text-muted-foreground/60 transition-colors">
          {done ? 'Thought for a moment' : 'Thinking\u2026'}
        </span>

        {done && (
          expanded
            ? <ChevronDown size={10} className="text-muted-foreground/30" />
            : <ChevronRight size={10} className="text-muted-foreground/30" />
        )}
      </button>

      {/* Content — only visible when expanded */}
      {expanded && content && (
        <div className="mt-1 ml-1.5 pl-3 border-l border-[hsl(var(--brand-cyan)/0.15)] max-h-52 overflow-y-auto scrollbar-thin">
          <p className="text-[12px] text-muted-foreground/45 leading-relaxed whitespace-pre-wrap italic">
            {content}
          </p>
        </div>
      )}
    </div>
  );
}
