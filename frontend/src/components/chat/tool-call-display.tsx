import { Terminal, Box, CheckCircle2, ChevronRight } from 'lucide-react';
import type { ToolCall } from '../../lib/types';
import { cn } from '@/lib/utils';

interface ToolCallDisplayProps {
  calls: ToolCall[];
  onSelectContent?: (content: string) => void;
}

export function ToolCallDisplay({ calls, onSelectContent }: ToolCallDisplayProps) {
  if (!calls.length) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2 w-full max-w-[85%] mt-1">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40">
          Swarm Actions
        </span>
      </div>
      <div className="space-y-2">
        {calls.map((call) => (
          <div
            key={call.id}
            onClick={() => onSelectContent?.(JSON.stringify(call, null, 2))}
            className={cn(
              'group relative flex items-center gap-3 bg-muted/40 border border-border/40 hover:border-primary/30 hover:bg-muted/60 transition-all p-3 rounded-xl cursor-pointer overflow-hidden shadow-sm active:scale-[0.98]',
            )}
          >
            <div className="shrink-0 w-8 h-8 rounded-lg bg-background border border-border/40 flex items-center justify-center text-primary/70 group-hover:text-primary transition-colors">
              <Terminal size={14} />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-bold truncate leading-none">{call.name}</span>
                <CheckCircle2 size={12} className="text-emerald-500/70" />
              </div>
              <p className="text-[10px] text-muted-foreground truncate mt-1 opacity-70">
                Action executed successfully
              </p>
            </div>

            <div className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
              <ChevronRight size={14} className="text-muted-foreground" />
            </div>

            {/* Subtle progress bar placeholder */}
            <div className="absolute bottom-0 left-0 h-[2px] bg-primary/20 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
