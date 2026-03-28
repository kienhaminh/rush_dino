// AgentSatelliteNode — small pill node orbiting each agent on the overview board.
// Used for Skills (indigo), Tools (cyan), and Knowledge (purple) satellites.
import { Handle, Position, type NodeProps } from '@xyflow/react';

export interface SatelliteNodeData {
  label: string;
  icon: string;
  color: string;
  bgColor: string;
  onClick: () => void;
  [key: string]: unknown;
}

export function AgentSatelliteNode({ data }: NodeProps) {
  const { label, icon, color, bgColor, onClick } = data as SatelliteNodeData;

  return (
    <div
      onClick={onClick}
      className="flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer select-none transition-all duration-150 hover:brightness-110"
      style={{
        background: bgColor,
        border: `1px solid ${color}`,
        minWidth: '96px',
        boxShadow: `0 0 10px ${color}22`,
      }}
    >
      <span className="text-xs">{icon}</span>
      <span className="text-[10px] font-semibold tracking-wide" style={{ color }}>
        {label}
      </span>
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-transparent !border-0 !w-0 !h-0"
      />
    </div>
  );
}
