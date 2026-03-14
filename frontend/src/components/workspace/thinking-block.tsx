import { Brain } from 'lucide-react';

export function ThinkingBlock({ content }: { content?: string }) {
  return (
    <div className="flex justify-start py-1 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="max-w-[85%] flex flex-col items-start gap-1.5">
        <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/40 pl-1 flex items-center gap-1.5">
          <Brain size={9} className="animate-pulse" />
          Thinking
        </span>
        <div className="bg-card border border-border/40 rounded-[18px] rounded-bl-md px-4 py-3 shadow-sm min-w-[80px]">
          {content ? (
            <p className="text-[11px] text-muted-foreground/60 font-mono leading-relaxed whitespace-pre-wrap max-h-40 overflow-y-auto">
              {content}
            </p>
          ) : (
            /* Animated shimmer bars while waiting for first thinking token */
            <div className="flex flex-col gap-2 py-0.5">
              <div className="flex items-center gap-1.5">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
