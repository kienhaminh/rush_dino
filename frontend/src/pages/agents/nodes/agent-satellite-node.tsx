import { useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';

export interface SatelliteNodeData {
  label: string;
  icon: string;
  subtitle: string;
  accentColor: string;
  handlePosition?: Position;
  [key: string]: unknown;
}

export function AgentSatelliteNode({ data, selected }: NodeProps) {
  const [hovered, setHovered] = useState(false);
  const { label, icon, subtitle, accentColor, handlePosition } = data as SatelliteNodeData;
  const isSelected = !!selected;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="rounded-xl p-3.5 flex items-center gap-3 text-left transition-all duration-150 cursor-grab active:cursor-grabbing"
      style={{
        background: isSelected ? `${accentColor}14` : hovered ? `${accentColor}0a` : 'hsl(var(--card))',
        border: `1px solid ${isSelected ? accentColor : `${accentColor}50`}`,
        boxShadow: isSelected
          ? `0 4px 20px ${accentColor}35`
          : `0 4px 16px ${accentColor}18`,
        minWidth: '158px',
        width: '210px',
      }}
    >
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-base"
        style={{
          background: `${accentColor}${isSelected ? '28' : '18'}`,
          border: `1px solid ${accentColor}40`,
        }}
      >
        {icon}
      </div>
      <div>
        <div className="text-[10px] font-bold tracking-[0.16em] text-foreground/85">{label}</div>
        <div className="text-[9px] text-muted-foreground mt-0.5">{subtitle}</div>
      </div>

      <Handle
        type="source"
        position={handlePosition ?? Position.Bottom}
        className="!bg-transparent !border-0 !w-0 !h-0"
      />
    </div>
  );
}
