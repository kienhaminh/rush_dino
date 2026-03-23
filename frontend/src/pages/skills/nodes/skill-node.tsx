import { Handle, Position, type NodeProps } from '@xyflow/react';

export interface SkillNodeData {
  label: string;
  description: string;
  accentColor: string;
  [key: string]: unknown;
}

export function SkillNode({ data, selected }: NodeProps) {
  const { label, description, accentColor } = data as SkillNodeData;

  return (
    <div
      className="rounded-lg px-3 py-2 transition-all duration-150 cursor-grab active:cursor-grabbing"
      style={{
        background: selected ? `${accentColor}12` : 'hsl(var(--card) / 0.7)',
        border: `1px solid ${selected ? `${accentColor}80` : 'hsl(var(--border) / 0.5)'}`,
        boxShadow: selected ? `0 2px 12px ${accentColor}20` : 'none',
        maxWidth: '180px',
      }}
    >
      <div className="text-[11px] font-semibold text-foreground/90 truncate">{label}</div>
      {description && (
        <div className="text-[9px] text-muted-foreground mt-0.5 line-clamp-2 leading-tight">
          {description}
        </div>
      )}

      <Handle
        type="target"
        position={Position.Top}
        className="!bg-transparent !border-0 !w-0 !h-0"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-transparent !border-0 !w-0 !h-0"
      />
    </div>
  );
}
