import { useEffect, useState } from 'react';
import { Brain } from 'lucide-react';

interface ThinkingBlockProps {
  content?: string;
  done?: boolean;
}

export function ThinkingBlock({ content, done }: ThinkingBlockProps) {
  const [expanded, setExpanded] = useState(false);

  // Auto-collapse when thinking finishes
  useEffect(() => {
    if (done) setExpanded(false);
  }, [done]);

  return (
    <div className="flex justify-start py-1 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="max-w-[85%] flex flex-col items-start gap-1.5">
        <span className="text-[9px] font-bold uppercase tracking-widest text-primary/60 pl-1 flex items-center gap-1.5">
          <Brain size={9} className={done ? undefined : 'animate-pulse'} />
          Thinking
        </span>

        {/* ── Live state: streaming not yet done ── */}
        {!done && (
          <div className="bg-primary/[0.07] border border-primary/25 rounded-[18px] rounded-bl-[4px] px-4 py-3 shadow-sm min-w-[80px]">
            {content ? (
              <p className="text-[11px] text-primary/60 font-mono italic leading-relaxed whitespace-pre-wrap max-h-40 overflow-y-auto">
                {content}
              </p>
            ) : (
              <div className="flex items-center gap-1.5">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Collapsed state: done, not expanded ── */}
        {done && !expanded && (
          <button
            onClick={() => setExpanded(true)}
            className="bg-primary/[0.07] border border-primary/25 rounded-[18px] rounded-bl-[4px] px-4 py-2.5 shadow-sm text-[11px] text-primary/70 font-mono flex items-center gap-2 hover:bg-primary/[0.12] transition-colors"
          >
            <Brain size={10} />
            View reasoning
            <span className="text-primary/40 text-[10px]">▾</span>
          </button>
        )}

        {/* ── Expanded state: done, user clicked to open ── */}
        {done && expanded && (
          <div className="bg-primary/[0.07] border border-primary/25 rounded-[18px] rounded-bl-[4px] px-4 py-3 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[9px] font-bold uppercase tracking-widest text-primary/40">
                Reasoning
              </span>
              <button
                onClick={() => setExpanded(false)}
                className="text-[10px] text-primary/50 hover:text-primary/80 transition-colors font-mono flex items-center gap-1"
              >
                Hide <span>▴</span>
              </button>
            </div>
            <p className="text-[11px] text-primary/60 font-mono italic leading-relaxed whitespace-pre-wrap max-h-60 overflow-y-auto">
              {content ?? '(no content)'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
