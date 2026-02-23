import type { ToolCall } from '../../lib/types';

interface ToolCallDisplayProps {
  calls: ToolCall[];
}

export function ToolCallDisplay({ calls }: ToolCallDisplayProps) {
  if (!calls.length) {
    return null;
  }

  return (
    <div className="mt-2 rounded-lg border border-ink/15 bg-white/80 p-2 text-xs">
      {calls.map((call) => (
        <div key={call.id} className="mb-2 last:mb-0">
          <div className="font-semibold text-ink">{call.name}</div>
          <pre className="overflow-x-auto whitespace-pre-wrap text-[11px] text-ink/70">
            {JSON.stringify(call.arguments, null, 2)}
          </pre>
        </div>
      ))}
    </div>
  );
}
