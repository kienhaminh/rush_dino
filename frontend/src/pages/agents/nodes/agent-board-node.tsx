import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { AgentRecord } from '../agent-types';

export interface AgentBoardNodeData {
  agent: AgentRecord;
  // onNavigate is called when the card is clicked, pushing /agents/:id
  onNavigate: (id: string) => void;
  [key: string]: unknown;
}

export function AgentBoardNode({ data }: NodeProps) {
  const { agent, onNavigate } = data as AgentBoardNodeData;

  return (
    <div
      onClick={() => onNavigate(agent.id)}
      style={{
        width: '240px',
        background: 'hsl(var(--card))',
        border: '1px solid hsl(var(--border))',
        borderRadius: '14px',
        cursor: 'pointer',
        userSelect: 'none',
        overflow: 'hidden',
      }}
    >
      {/* Header row */}
      <div className="flex items-center gap-3 px-3 pt-3 pb-2.5">
        {/* Orbital ring + emoji */}
        <div className="relative flex-shrink-0" style={{ width: '52px', height: '52px' }}>
          {/* Spinning conic ring */}
          <div
            className="absolute inset-0 rounded-full animate-spin"
            style={{
              animationDuration: '4s',
              animationDirection: 'reverse',
              background:
                'conic-gradient(from 0deg, rgba(99,102,241,0.9) 0deg, rgba(139,92,246,0.55) 90deg, rgba(99,102,241,0.08) 200deg, transparent 270deg)',
            }}
          />
          {/* Mask — matches card background */}
          <div className="absolute rounded-full bg-card" style={{ inset: '2px' }} />
          {/* Inner glowing circle */}
          <div
            className="absolute rounded-full"
            style={{
              inset: '6px',
              background:
                'radial-gradient(circle at 40% 35%, rgba(99,102,241,0.15), hsl(var(--card)))',
              border: '1px solid rgba(99,102,241,0.2)',
            }}
          />
          {/* Emoji */}
          <div
            className="absolute inset-0 flex items-center justify-center text-lg"
            style={{ zIndex: 10 }}
          >
            {agent.emoji || '🤖'}
          </div>
        </div>

        {/* Name + status */}
        <div className="flex-1 min-w-0">
          <div
            className="font-bold tracking-[0.08em] text-xs truncate"
            style={{ color: 'hsl(var(--foreground) / 0.85)' }}
          >
            {agent.name.toUpperCase()}
          </div>
          {agent.isDefault && (
            <div
              className="text-[8px] font-bold tracking-[0.18em] mt-0.5 inline-block px-1.5 py-px rounded-full"
              style={{
                background: 'rgba(20,184,166,0.15)',
                border: '1px solid rgba(20,184,166,0.35)',
                color: 'rgb(20,184,166)',
              }}
            >
              DEFAULT
            </div>
          )}
          <div className="flex items-center gap-1.5 mt-1">
            <span
              className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ background: '#10b981' }}
            />
            <span
              className="text-[8px] tracking-[0.14em]"
              style={{ color: 'rgba(16,185,129,0.75)' }}
            >
              OPERATIONAL
            </span>
          </div>
        </div>
      </div>

      {/* Invisible handles */}
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-transparent !border-0 !w-0 !h-0"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!bg-transparent !border-0 !w-0 !h-0"
      />
    </div>
  );
}
