import { Handle, Position, type NodeProps } from '@xyflow/react';

export interface SkillNodeData {
  label: string;
  description: string;
  accentColor: string;
  isSelected?: boolean;
  isDimmed?: boolean;
  isCustom?: boolean;
  [key: string]: unknown;
}

export function SkillNode({ data }: NodeProps) {
  const { label, description, accentColor, isSelected, isDimmed, isCustom } = data as SkillNodeData;

  return (
    <div
      className="rounded-lg px-3 py-2 transition-all duration-150 cursor-grab active:cursor-grabbing"
      style={{
        background: isSelected ? `${accentColor}18` : 'hsl(var(--card) / 0.7)',
        border: isCustom
          ? `1px dashed ${isSelected ? `${accentColor}80` : 'hsl(var(--border) / 0.5)'}`
          : `1px solid ${isSelected ? `${accentColor}80` : 'hsl(var(--border) / 0.5)'}`,
        boxShadow: isSelected
          ? `0 2px 12px ${accentColor}30, 0 0 0 2px ${accentColor}40`
          : 'none',
        maxWidth: '180px',
        opacity: isDimmed ? 0.3 : 1,
        transition: 'opacity 0.2s ease, box-shadow 0.15s ease',
      }}
    >
      <div className="flex items-center gap-1.5">
        <div className="text-[11px] font-semibold text-foreground/90 truncate flex-1">{label}</div>
        {/* Auto badge for custom (workspace) skills */}
        {isCustom && (
          <span
            className="text-[8px] font-bold tracking-wider uppercase px-1 py-0.5 rounded flex-shrink-0"
            style={{
              background: `${accentColor}20`,
              color: accentColor,
              border: `1px dashed ${accentColor}60`,
            }}
          >
            auto
          </span>
        )}
      </div>
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
