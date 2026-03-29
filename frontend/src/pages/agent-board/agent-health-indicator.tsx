import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';
import type { AgentHealth } from '@/pages/agents/agent-types';

function healthBarColor(rate: number): string {
  if (rate >= 0.7) return 'bg-green-500';
  if (rate >= 0.4) return 'bg-yellow-500';
  return 'bg-red-500';
}

function healthTextColor(rate: number): string {
  if (rate >= 0.7) return 'text-green-400';
  if (rate >= 0.4) return 'text-yellow-400';
  return 'text-red-400';
}

export function AgentHealthIndicator({
  health,
  onReset,
}: {
  health: AgentHealth | undefined;
  onReset: () => void;
}) {
  if (!health || health.totalTasks === 0) {
    return (
      <div className="px-2 py-1.5 bg-background/50 rounded">
        <div className="flex items-center justify-between text-[8px] text-muted-foreground tracking-widest uppercase">
          <span>Health</span>
          <span>No data</span>
        </div>
      </div>
    );
  }

  const pct = Math.round(health.successRate * 100);

  return (
    <div className="space-y-1.5">
      <div className="px-2 py-1.5 bg-background/50 rounded">
        <div className="flex items-center justify-between text-[8px] tracking-widest uppercase mb-1">
          <span className="text-muted-foreground">Health</span>
          <span className={healthTextColor(health.successRate)}>
            {pct}% ({health.totalTasks} tasks)
          </span>
        </div>
        <div className="h-[3px] bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${healthBarColor(health.successRate)}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {health.circuitOpen && (
        <div className="flex items-start gap-1.5 px-2 py-1.5 bg-red-950 border border-red-900 rounded">
          <AlertTriangle className="w-3 h-3 text-red-400 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-[9px] font-semibold text-red-400">CIRCUIT BREAKER OPEN</div>
            <div className="text-[8px] text-red-400/70">
              Success rate {pct}% — excluded from auto-dispatch
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-5 px-1.5 text-[8px] text-red-400 hover:text-red-300 hover:bg-red-900/50"
            onClick={(e) => { e.stopPropagation(); onReset(); }}
          >
            Reset
          </Button>
        </div>
      )}
    </div>
  );
}
