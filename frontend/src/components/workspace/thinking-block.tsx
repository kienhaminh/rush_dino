import { Brain } from 'lucide-react';

export function ThinkingBlock() {
  return (
    <div className="flex items-center gap-3 py-1 px-2 animate-in fade-in slide-in-from-bottom-1 duration-300">
      <div className="w-7 h-7 rounded-full bg-muted/60 border border-border/40 flex items-center justify-center shrink-0">
        <Brain size={13} className="text-muted-foreground animate-pulse" />
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] text-muted-foreground/70 font-medium">Thinking</span>
        <span className="flex gap-0.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-1 h-1 rounded-full bg-muted-foreground/50 animate-bounce"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </span>
      </div>
    </div>
  );
}
