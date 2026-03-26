import { Handle, Position, type NodeProps } from '@xyflow/react';

export interface CoreNodeData {
  emoji: string;
  name: string;
  [key: string]: unknown;
}

export function AgentCoreNode({ data }: NodeProps) {
  const { emoji, name } = data as CoreNodeData;

  return (
    <div className="flex flex-col items-center cursor-grab active:cursor-grabbing" style={{ position: 'relative' }}>
      {/* Ambient glow — sticks to the node */}
      <div
        className="absolute pointer-events-none"
        style={{
          width: '260px',
          height: '260px',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -38%)',
          background: 'radial-gradient(ellipse 55% 55% at 50% 50%, rgba(99,102,241,0.13) 0%, transparent 70%)',
          zIndex: -1,
        }}
      />

      {/* CORE badge */}
      <div
        className="text-[8px] font-bold tracking-[0.22em] px-2 py-0.5 rounded-full mb-2"
        style={{
          background: 'rgba(99,102,241,0.15)',
          border: '1px solid rgba(99,102,241,0.38)',
          color: 'rgba(167,139,250,0.92)',
        }}
      >
        CORE
      </div>

      {/* Orbital ring + inner circle */}
      <div className="relative" style={{ width: '96px', height: '96px' }}>
        {/* Spinning conic ring */}
        <div
          className="absolute inset-0 rounded-full animate-spin"
          style={{
            animationDuration: '5s',
            animationDirection: 'reverse',
            background:
              'conic-gradient(from 0deg, rgba(99,102,241,0.9) 0deg, rgba(139,92,246,0.55) 90deg, rgba(99,102,241,0.08) 200deg, transparent 270deg)',
          }}
        />
        {/* Mask */}
        <div className="absolute rounded-full bg-background" style={{ inset: '3px' }} />
        {/* Inner glowing circle */}
        <div
          className="absolute rounded-full"
          style={{
            inset: '8px',
            background:
              'radial-gradient(circle at 40% 35%, rgba(99,102,241,0.22), hsl(var(--background) / 0.95))',
            border: '1px solid rgba(99,102,241,0.22)',
            boxShadow: '0 0 18px rgba(99,102,241,0.2)',
          }}
        />
        {/* Agent emoji */}
        <div className="absolute inset-0 flex items-center justify-center text-2xl" style={{ zIndex: 10 }}>
          {emoji || '🤖'}
        </div>
      </div>

      {/* Name + subtitle */}
      <div className="text-center mt-3">
        <div className="font-bold tracking-[0.1em] text-sm text-foreground">{name.toUpperCase()}</div>
        <div className="text-[8px] tracking-[0.22em] mt-0.5" style={{ color: 'rgba(99,102,241,0.72)' }}>
          NEURAL COORDINATOR
        </div>
      </div>

      {/* Handles for incoming edges */}
      <Handle
        type="target"
        position={Position.Top}
        id="top-left"
        className="!bg-transparent !border-0 !w-0 !h-0"
        style={{ left: '30%' }}
      />
      <Handle
        type="target"
        position={Position.Top}
        id="top-right"
        className="!bg-transparent !border-0 !w-0 !h-0"
        style={{ left: '70%' }}
      />
      <Handle
        type="target"
        position={Position.Bottom}
        id="bottom"
        className="!bg-transparent !border-0 !w-0 !h-0"
      />
    </div>
  );
}
