import { Handle, Position, type NodeProps } from '@xyflow/react';

export interface CategoryNodeData {
  label: string;
  skillCount: number;
  accentColor: string;
  [key: string]: unknown;
}

export function CategoryNode({ data, selected }: NodeProps) {
  const { label, skillCount, accentColor } = data as CategoryNodeData;

  return (
    <div
      className="rounded-xl px-4 py-3 flex flex-col items-center gap-1 transition-all duration-150 cursor-grab active:cursor-grabbing"
      style={{
        background: selected ? `${accentColor}18` : 'hsl(var(--card))',
        border: `1.5px solid ${selected ? accentColor : `${accentColor}60`}`,
        boxShadow: selected
          ? `0 4px 24px ${accentColor}30`
          : `0 2px 12px ${accentColor}15`,
        minWidth: '120px',
      }}
    >
      <div
        className="text-[10px] font-bold tracking-[0.14em] uppercase"
        style={{ color: accentColor }}
      >
        {label}
      </div>
      <div className="text-[9px] text-muted-foreground">
        {skillCount} skill{skillCount !== 1 ? 's' : ''}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-transparent !border-0 !w-0 !h-0"
      />
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-transparent !border-0 !w-0 !h-0"
      />
    </div>
  );
}
