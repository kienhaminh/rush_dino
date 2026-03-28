import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { AgentRecord, AgentRuntimeData } from '../agent-types';

export interface AgentBoardNodeData {
  agent: AgentRecord;
  runtime?: AgentRuntimeData;
  isSelected: boolean;
  onSelect: (id: string) => void;
  [key: string]: unknown;
}

export function AgentBoardNode({ data }: NodeProps) {
  const { agent, runtime, isSelected, onSelect } = data as AgentBoardNodeData;

  const skillCount = runtime?.skills.filter((s) => s.enabled).length ?? null;
  const toolCount =
    runtime?.toolSections.reduce((a, s) => a + s.tools.filter((t) => t.enabled).length, 0) ?? null;
  const memCount = runtime?.memory.length ?? null;

  return (
    <div
      className={isSelected ? 'agent-node-selected' : ''}
      onClick={() => onSelect(agent.id)}
      style={{
        width: '240px',
        background: isSelected ? 'rgba(99,102,241,0.08)' : 'hsl(var(--card))',
        border: `1px solid ${isSelected ? 'rgba(99,102,241,0.7)' : 'hsl(var(--border))'}`,
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
              animationDuration: isSelected ? '2s' : '4s',
              animationDirection: 'reverse',
              background: isSelected
                ? 'conic-gradient(from 0deg, rgba(99,102,241,1) 0deg, rgba(139,92,246,0.7) 90deg, rgba(99,102,241,0.1) 200deg, transparent 270deg)'
                : 'conic-gradient(from 0deg, rgba(99,102,241,0.9) 0deg, rgba(139,92,246,0.55) 90deg, rgba(99,102,241,0.08) 200deg, transparent 270deg)',
            }}
          />
          {/* Mask — matches card background */}
          <div className="absolute rounded-full bg-card" style={{ inset: '2px' }} />
          {/* Inner glowing circle */}
          <div
            className="absolute rounded-full"
            style={{
              inset: '6px',
              background: `radial-gradient(circle at 40% 35%, rgba(99,102,241,${isSelected ? '0.3' : '0.15'}), hsl(var(--card)))`,
              border: `1px solid rgba(99,102,241,${isSelected ? '0.4' : '0.2'})`,
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
            style={{ color: `hsl(var(--foreground) / ${isSelected ? '1' : '0.85'})` }}
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
              style={{ color: `rgba(16,185,129,${isSelected ? '0.9' : '0.75'})` }}
            >
              OPERATIONAL
            </span>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div
        style={{ height: '1px', background: 'hsl(var(--border))', margin: '0 12px' }}
      />

      {/* Stats row */}
      <div className="flex items-center justify-between px-3 py-2.5 gap-1">
        <StatPill
          icon="◑"
          count={skillCount}
          label="skills"
          color="rgba(99,102,241,0.9)"
          bgColor="rgba(99,102,241,0.12)"
          borderColor="rgba(99,102,241,0.25)"
        />
        <StatPill
          icon="🔧"
          count={toolCount}
          label="tools"
          color="rgba(139,92,246,0.9)"
          bgColor="rgba(139,92,246,0.12)"
          borderColor="rgba(139,92,246,0.25)"
        />
        <StatPill
          icon="🗄"
          count={memCount}
          label="memory"
          color="rgba(20,184,166,0.9)"
          bgColor="rgba(20,184,166,0.12)"
          borderColor="rgba(20,184,166,0.25)"
        />
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

function StatPill({
  icon,
  count,
  label,
  color,
  bgColor,
  borderColor,
}: {
  icon: string;
  count: number | null;
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
}) {
  return (
    <div
      className="flex items-center gap-1 px-1.5 py-1 rounded-full text-[8px] font-bold tracking-[0.1em]"
      style={{ background: bgColor, border: `1px solid ${borderColor}`, color }}
    >
      <span className="text-[9px] leading-none">{icon}</span>
      <span>{count !== null ? count : '—'}</span>
      <span className="text-muted-foreground">{label}</span>
    </div>
  );
}
