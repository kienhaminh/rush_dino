import { useLayoutEffect, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ThinkingBlockProps {
  content?: string;
  done?: boolean;
}

export function ThinkingBlock({ content, done }: ThinkingBlockProps) {
  // Start expanded so content is visible during live streaming.
  const [expanded, setExpanded] = useState(true);

  // Use useLayoutEffect to collapse synchronously before paint, preventing
  // a one-frame flash of the done+expanded state.
  useLayoutEffect(() => {
    if (done) setExpanded(false);
  }, [done]);

  return (
    <div className="py-1 animate-in fade-in duration-200">
      <div className="border-l-2 border-muted-foreground/20 pl-3 py-1">
        {/* Header row — always visible */}
        <button
          type="button"
          onClick={() => done && setExpanded((v) => !v)}
          disabled={!done}
          className={cn(
            'flex items-center gap-2 w-full text-left',
            done ? 'cursor-pointer' : 'cursor-default',
          )}
        >
          <span className="text-[10px] text-muted-foreground/50 select-none">
            {done ? 'Thought for a moment' : 'Thinking\u2026'}
          </span>
          {/* Inline dot animation — header only, shown while live */}
          {!done && (
            <span className="flex items-center gap-0.5" aria-hidden>
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="w-1 h-1 rounded-full bg-muted-foreground/30 animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </span>
          )}
          {/* Chevron — shown only when done */}
          {done && (
            expanded
              ? <ChevronUp size={10} className="text-muted-foreground/40 ml-auto" />
              : <ChevronDown size={10} className="text-muted-foreground/40 ml-auto" />
          )}
        </button>

        {/* Content area — visible when expanded and content is non-empty */}
        {expanded && content && (
          <p className={cn(
            'text-sm text-muted-foreground/60 leading-relaxed whitespace-pre-wrap mt-1.5',
            done && 'max-h-60 overflow-y-auto scrollbar-thin',
          )}>
            {content}
          </p>
        )}
      </div>
    </div>
  );
}
