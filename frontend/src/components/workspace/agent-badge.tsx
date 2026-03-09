import { Bot } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ActiveAgent } from '@/lib/types';

interface AgentBadgeProps {
  agent: ActiveAgent;
  isStreaming?: boolean;
}

export function AgentBadge({ agent, isStreaming }: AgentBadgeProps) {
  const isDelegate = agent.role === 'delegate';

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all duration-300',
        isDelegate
          ? 'bg-violet-500/10 border-violet-500/20 text-violet-400'
          : 'bg-primary/10 border-primary/20 text-primary/80',
      )}
    >
      <Bot size={11} className={cn(isStreaming && 'animate-pulse')} />
      <span>{agent.name}</span>
      {isDelegate && (
        <span className="text-[9px] font-normal opacity-60 ml-0.5">delegate</span>
      )}
    </div>
  );
}
