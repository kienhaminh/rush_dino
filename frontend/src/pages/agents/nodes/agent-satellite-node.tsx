import { Handle, Position, type NodeProps } from '@xyflow/react';
import { cn } from '@/lib/utils';

export interface SatelliteNodeData {
  label: string;
  icon: string;
  subtitle: string;
  accentColor: string;
  handlePosition: Position;
  isSelected?: boolean;
  [key: string]: unknown;
}

export function AgentSatelliteNode({ data }: NodeProps) {
  const { label, icon, subtitle, accentColor, handlePosition, isSelected } =
    data as SatelliteNodeData;

  return (
    <div
      className={cn(
        'relative flex flex-col gap-2 rounded-2xl px-4 py-3 cursor-pointer select-none transition-all duration-200 min-w-[148px]',
        'bg-card',
      )}
      style={{
        border: `1.5px solid ${isSelected ? accentColor : `color-mix(in srgb, ${accentColor} 40%, transparent)`}`,
        boxShadow: isSelected
          ? `0 0 0 1px color-mix(in srgb, ${accentColor} 30%, transparent), 0 0 24px color-mix(in srgb, ${accentColor} 40%, transparent), 0 4px 16px rgba(0,0,0,0.25)`
          : `0 0 12px color-mix(in srgb, ${accentColor} 18%, transparent), 0 2px 8px rgba(0,0,0,0.15)`,
        background: isSelected
          ? `color-mix(in srgb, ${accentColor} 18%, hsl(var(--card)))`
          : undefined,
      }}
    >
      <div className="flex items-center gap-2.5">
        <div
          className="flex items-center justify-center w-8 h-8 rounded-xl flex-shrink-0 text-base"
          style={{
            background: `color-mix(in srgb, ${accentColor} 20%, transparent)`,
            border: `1px solid color-mix(in srgb, ${accentColor} 35%, transparent)`,
          }}
        >
          {icon}
        </div>
        <span
          className="text-[11px] font-bold tracking-widest uppercase"
          style={{ color: accentColor }}
        >
          {label}
        </span>
      </div>

      <span
        className="text-[10px] font-medium leading-tight"
        style={{ color: `color-mix(in srgb, ${accentColor} 70%, hsl(var(--muted-foreground)))` }}
      >
        {subtitle}
      </span>

      <div
        className="absolute bottom-0 left-4 right-4 h-[2px] rounded-full transition-opacity duration-200"
        style={{
          background: `linear-gradient(90deg, transparent, ${accentColor}, transparent)`,
          opacity: isSelected ? 1 : 0,
        }}
      />

      <Handle
        type="source"
        position={handlePosition}
        className="react-flow__handle-invisible"
      />
    </div>
  );
}
