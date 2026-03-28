import { Handle, Position, type NodeProps } from '@xyflow/react';

export interface CoreNodeData {
  emoji: string;
  name: string;
  [key: string]: unknown;
}

export function AgentCoreNode({ data }: NodeProps) {
  const { emoji, name } = data as CoreNodeData;

  return (
    <div className="relative flex flex-col items-center cursor-grab active:cursor-grabbing">
      <div
        className="absolute pointer-events-none -z-10"
        style={{
          width: '260px', height: '260px',
          top: '50%', left: '50%',
          transform: 'translate(-50%, -38%)',
          background: 'radial-gradient(ellipse 55% 55% at 50% 50%, hsl(var(--primary) / 0.13) 0%, transparent 70%)',
        }}
      />

      <div className="text-[8px] font-bold tracking-[0.22em] px-2 py-0.5 rounded-full mb-2 bg-primary/15 border border-primary/40 text-primary">
        CORE
      </div>

      <div className="relative w-24 h-24">
        <div
          className="absolute inset-0 rounded-full animate-spin"
          style={{
            animationDuration: '5s',
            animationDirection: 'reverse',
            background: 'conic-gradient(from 0deg, hsl(var(--primary) / 0.9) 0deg, hsl(var(--brand-teal) / 0.55) 90deg, hsl(var(--primary) / 0.08) 200deg, transparent 270deg)',
          }}
        />
        <div className="absolute rounded-full bg-background" style={{ inset: '3px' }} />
        <div
          className="absolute rounded-full border border-primary/20"
          style={{
            inset: '8px',
            background: 'radial-gradient(circle at 40% 35%, hsl(var(--primary) / 0.22), hsl(var(--background) / 0.95))',
            boxShadow: '0 0 18px hsl(var(--primary) / 0.2)',
          }}
        />
        <div className="absolute inset-0 flex items-center justify-center text-2xl z-10">
          {emoji || '🤖'}
        </div>
      </div>

      <div className="text-center mt-3">
        <div className="font-bold tracking-[0.1em] text-sm text-foreground">{name.toUpperCase()}</div>
        <div className="text-[8px] tracking-[0.22em] mt-0.5 text-primary/70">NEURAL COORDINATOR</div>
      </div>

      <Handle type="target" position={Position.Top} id="top-left"
        className="react-flow__handle-invisible" style={{ left: '30%' }} />
      <Handle type="target" position={Position.Top} id="top-right"
        className="react-flow__handle-invisible" style={{ left: '70%' }} />
      <Handle type="target" position={Position.Bottom} id="bottom"
        className="react-flow__handle-invisible" />
    </div>
  );
}
