import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { AgentRecord } from '@/pages/agents/agent-types';
import type { WorkflowStep } from '../workflow-types';

export interface WorkflowStepNodeData {
  step: WorkflowStep;
  agent?: AgentRecord;
  index: number;
  isActive: boolean;
  accentColor: string;
  onSelect: (id: string) => void;
  [key: string]: unknown;
}

export function WorkflowStepNode({ data }: NodeProps) {
  const { step, agent, index, isActive, accentColor, onSelect } =
    data as WorkflowStepNodeData;

  const preview =
    step.instructions && step.instructions.length > 0
      ? step.instructions.slice(0, 65) + (step.instructions.length > 65 ? '…' : '')
      : null;

  return (
    <div
      onClick={() => onSelect(step.id)}
      style={{
        width: '220px',
        background: isActive ? `${accentColor}10` : 'hsl(var(--card) / 0.75)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        borderTopWidth: '3px',
        borderTopStyle: 'solid',
        borderTopColor: accentColor,
        borderRightWidth: '1px',
        borderRightStyle: 'solid',
        borderRightColor: isActive ? accentColor : 'hsl(var(--border))',
        borderBottomWidth: '1px',
        borderBottomStyle: 'solid',
        borderBottomColor: isActive ? accentColor : 'hsl(var(--border))',
        borderLeftWidth: '1px',
        borderLeftStyle: 'solid',
        borderLeftColor: isActive ? accentColor : 'hsl(var(--border))',
        borderRadius: '10px',
        cursor: 'pointer',
        boxShadow: isActive
          ? `0 0 0 1px ${accentColor}50, 0 6px 24px ${accentColor}22`
          : '0 2px 10px rgba(0,0,0,0.08)',
        transition: 'all 0.15s ease',
        overflow: 'hidden',
        userSelect: 'none',
      }}
    >
      <div style={{ padding: '11px 13px' }}>
        {/* Step number badge + name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <div
            style={{
              width: '20px',
              height: '20px',
              borderRadius: '5px',
              background: accentColor,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '8px',
              fontWeight: '800',
              color: '#fff',
              flexShrink: 0,
              letterSpacing: '-0.01em',
            }}
          >
            {String(index + 1).padStart(2, '0')}
          </div>
          <div
            style={{
              fontSize: '12px',
              fontWeight: '600',
              color: 'hsl(var(--foreground))',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: 1,
            }}
          >
            {step.name || 'Untitled step'}
          </div>
        </div>

        {/* Assigned agent */}
        <div
          style={{
            fontSize: '10px',
            color: 'hsl(var(--muted-foreground))',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            marginBottom: preview ? '6px' : 0,
          }}
        >
          {agent ? (
            <>
              <span>{agent.emoji ?? '🤖'}</span>
              <span
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {agent.name}
              </span>
            </>
          ) : (
            <span style={{ opacity: 0.45 }}>No agent assigned</span>
          )}
        </div>

        {/* Instructions preview */}
        {preview && (
          <div
            style={{
              fontSize: '9px',
              color: 'hsl(var(--muted-foreground) / 0.55)',
              fontStyle: 'italic',
              lineHeight: 1.55,
            }}
          >
            {preview}
          </div>
        )}
      </div>

      {/* ReactFlow handles */}
      <Handle
        type="target"
        position={Position.Left}
        style={{
          background: accentColor,
          border: '2px solid hsl(var(--background))',
          width: '10px',
          height: '10px',
        }}
      />
      <Handle
        type="source"
        position={Position.Right}
        style={{
          background: accentColor,
          border: '2px solid hsl(var(--background))',
          width: '10px',
          height: '10px',
        }}
      />
    </div>
  );
}
