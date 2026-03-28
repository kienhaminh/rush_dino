// ToolNode — orbital satellite node for an individual agent tool.
// Core tools (source === 'core') get a solid cyan border and are removable.
// Plugin/discovered tools get a dashed cyan border and are read-only (no ✕ button).
import { Handle, Position, type NodeProps } from '@xyflow/react';

export interface ToolNodeData {
  /** Display label for the tool */
  name: string;
  /** Emoji icon */
  emoji: string;
  /** True when this is a plugin/MCP-discovered tool (read-only — agent-managed) */
  isDiscovered: boolean;
  /** Optional remove handler; only called for core (non-discovered) tools */
  onRemove?: () => void;
  [key: string]: unknown;
}

export function ToolNode({ data }: NodeProps) {
  const { name, emoji, isDiscovered, onRemove } = data as ToolNodeData;

  return (
    <div
      className="relative rounded-xl px-3 py-2.5 flex items-center gap-2.5 transition-shadow duration-150 cursor-default"
      style={{
        background: 'hsl(var(--card))',
        border: `1.5px ${isDiscovered ? 'dashed' : 'solid'} #0891b2`,
        boxShadow: '0 2px 14px rgba(8,145,178,0.22)',
        minWidth: '140px',
        maxWidth: '180px',
      }}
    >
      {/* Tool emoji icon */}
      <div
        className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-sm"
        style={{
          background: 'rgba(8,145,178,0.14)',
          border: '1px solid rgba(8,145,178,0.3)',
        }}
      >
        {emoji || '🔧'}
      </div>

      {/* Name + optional auto badge for discovered tools */}
      <div className="flex-1 min-w-0">
        <div
          className="text-[10px] font-semibold tracking-wide truncate"
          style={{ color: '#67e8f9' }}
        >
          {name}
        </div>
        {isDiscovered && (
          <span
            className="inline-block mt-0.5 text-[8px] font-bold tracking-widest px-1.5 py-0.5 rounded"
            style={{
              background: 'rgba(8,145,178,0.18)',
              border: '1px solid rgba(8,145,178,0.35)',
              color: 'rgba(103,232,249,0.85)',
            }}
          >
            auto
          </span>
        )}
      </div>

      {/* Remove button — only for non-discovered (core) tools */}
      {!isDiscovered && onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[9px] transition-colors duration-100 cursor-pointer"
          style={{
            background: 'rgba(8,145,178,0.15)',
            border: '1px solid rgba(8,145,178,0.3)',
            color: 'rgba(103,232,249,0.75)',
          }}
          title={`Remove ${name}`}
        >
          ✕
        </button>
      )}

      {/* ReactFlow source handle (connects to agent core) */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-transparent !border-0 !w-0 !h-0"
      />
    </div>
  );
}
