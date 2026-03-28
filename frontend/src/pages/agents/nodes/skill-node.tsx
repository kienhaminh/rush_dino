// SkillNode — orbital satellite node for an individual agent skill.
// Shown as an indigo-bordered card; custom skills (group === 'custom' or source !== 'built-in')
// get a dashed border + "auto" badge. All skill nodes are removable.
import { Handle, Position, type NodeProps } from '@xyflow/react';

export interface SkillNodeData {
  /** Display name for the skill */
  name: string;
  /** Emoji icon */
  emoji: string;
  /** True when this is a workspace/custom skill (not a built-in bundled skill) */
  isCustom: boolean;
  /** Called when user clicks the ✕ remove button */
  onRemove: () => void;
  [key: string]: unknown;
}

export function SkillNode({ data }: NodeProps) {
  const { name, emoji, isCustom, onRemove } = data as SkillNodeData;

  return (
    <div
      className="relative rounded-xl px-3 py-2.5 flex items-center gap-2.5 transition-shadow duration-150 cursor-default"
      style={{
        background: 'hsl(var(--card))',
        border: `1.5px ${isCustom ? 'dashed' : 'solid'} #4f46e5`,
        boxShadow: '0 2px 14px rgba(79,70,229,0.22)',
        minWidth: '140px',
        maxWidth: '180px',
      }}
    >
      {/* Skill emoji icon */}
      <div
        className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-sm"
        style={{
          background: 'rgba(79,70,229,0.14)',
          border: '1px solid rgba(79,70,229,0.3)',
        }}
      >
        {emoji || '🔷'}
      </div>

      {/* Name + optional custom badge */}
      <div className="flex-1 min-w-0">
        <div
          className="text-[10px] font-semibold tracking-wide truncate"
          style={{ color: '#a5b4fc' }}
        >
          {name}
        </div>
        {isCustom && (
          <span
            className="inline-block mt-0.5 text-[8px] font-bold tracking-widest px-1.5 py-0.5 rounded"
            style={{
              background: 'rgba(79,70,229,0.18)',
              border: '1px solid rgba(79,70,229,0.35)',
              color: 'rgba(165,180,252,0.85)',
            }}
          >
            AUTO
          </span>
        )}
      </div>

      {/* Remove button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[9px] transition-colors duration-100 cursor-pointer"
        style={{
          background: 'rgba(79,70,229,0.15)',
          border: '1px solid rgba(79,70,229,0.3)',
          color: 'rgba(165,180,252,0.75)',
        }}
        title={`Remove ${name}`}
      >
        ✕
      </button>

      {/* ReactFlow source handle (connects to agent core) */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-transparent !border-0 !w-0 !h-0"
      />
    </div>
  );
}
