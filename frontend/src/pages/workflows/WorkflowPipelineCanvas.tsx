import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  MiniMap,
  type Node,
  type Edge,
  useNodesState,
  useEdgesState,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { XIcon } from 'lucide-react';

import type { AgentRecord } from '@/pages/agents/agent-types';
import type { WorkflowDetail, WorkflowStep } from './workflow-types';
import { WorkflowStepNode } from './nodes/workflow-step-node';
import { WorkflowFlowEdge } from './edges/workflow-flow-edge';

// ── Must be defined outside the component to prevent ReactFlow re-renders ─────
const nodeTypes = { workflowStep: WorkflowStepNode };
const edgeTypes = { workflowFlow: WorkflowFlowEdge };

export const STEP_ACCENT_COLORS = [
  'hsl(185 80% 47%)',  // cyan  — primary brand
  'rgb(99,102,241)',   // indigo
  'rgb(139,92,246)',   // purple
  'rgb(20,184,166)',   // teal
  'rgb(245,158,11)',   // amber
  'rgb(236,72,153)',   // pink
];

// ── Node / edge builders ──────────────────────────────────────────────────────

function buildNodes(
  steps: WorkflowStep[],
  agents: AgentRecord[],
  activeId: string | null,
  onSelect: (id: string) => void,
): Node[] {
  return steps.map((step, index) => ({
    id: step.id,
    type: 'workflowStep',
    position: { x: index * 300, y: 80 },
    data: {
      step,
      agent: agents.find((a) => a.id === step.agentId),
      index,
      isActive: step.id === activeId,
      accentColor: STEP_ACCENT_COLORS[index % STEP_ACCENT_COLORS.length],
      onSelect,
    },
    draggable: true,
  }));
}

function buildEdges(steps: WorkflowStep[]): Edge[] {
  return steps.slice(0, -1).map((step, index) => ({
    id: `wf-e-${step.id}→${steps[index + 1].id}`,
    source: step.id,
    target: steps[index + 1].id,
    type: 'workflowFlow',
    data: { accentColor: STEP_ACCENT_COLORS[index % STEP_ACCENT_COLORS.length] },
  }));
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface CanvasProps {
  workflow: WorkflowDetail;
  agents: AgentRecord[];
}

interface WorkflowStepPanelProps {
  activeStep: WorkflowStep | null;
  activeIndex: number;
  activeAccent: string;
  agents: AgentRecord[];
  onClose: () => void;
}

// ── Step detail side panel (read-only) ────────────────────────────────────────

function WorkflowStepPanel({ activeStep, activeIndex, activeAccent, agents, onClose }: WorkflowStepPanelProps) {
  const panelOpen = !!activeStep;

  return (
    <div
      style={{
        position: 'absolute',
        top: '12px',
        right: '12px',
        bottom: '12px',
        width: '260px',
        zIndex: 10,
        display: 'flex',
        flexDirection: 'column',
        background: 'hsl(var(--card) / 0.92)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        borderTopWidth: '2px',
        borderTopStyle: 'solid',
        borderTopColor: activeAccent,
        borderRightWidth: '1px',
        borderRightStyle: 'solid',
        borderRightColor: 'hsl(var(--border))',
        borderBottomWidth: '1px',
        borderBottomStyle: 'solid',
        borderBottomColor: 'hsl(var(--border))',
        borderLeftWidth: '1px',
        borderLeftStyle: 'solid',
        borderLeftColor: 'hsl(var(--border))',
        borderRadius: '12px',
        boxShadow: `0 8px 32px rgba(0,0,0,0.12), 0 0 0 1px ${activeAccent}20`,
        transform: panelOpen ? 'translateX(0) scale(1)' : 'translateX(calc(100% + 20px)) scale(0.97)',
        opacity: panelOpen ? 1 : 0,
        transition: 'transform 0.22s cubic-bezier(0.22,1,0.36,1), opacity 0.18s ease, border-top-color 0.15s ease, box-shadow 0.15s ease',
        pointerEvents: panelOpen ? 'auto' : 'none',
      }}
    >
      {activeStep && (
        <>
          {/* Header */}
          <div
            style={{
              padding: '10px 12px 9px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexShrink: 0,
              borderBottom: '1px solid hsl(var(--border) / 0.6)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
              <div
                style={{
                  width: '18px',
                  height: '18px',
                  borderRadius: '4px',
                  background: activeAccent,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '7px',
                  fontWeight: '800',
                  color: '#fff',
                  flexShrink: 0,
                }}
              >
                {String(activeIndex + 1).padStart(2, '0')}
              </div>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: '600',
                  color: 'hsl(var(--foreground))',
                }}
              >
                {activeStep.name || 'Untitled step'}
              </span>
            </div>

            <button
              onClick={onClose}
              title="Close"
              style={{
                width: '24px',
                height: '24px',
                borderRadius: '6px',
                border: '1px solid hsl(var(--border))',
                background: 'transparent',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'hsl(var(--muted-foreground))',
              }}
            >
              <XIcon style={{ width: '11px', height: '11px' }} />
            </button>
          </div>

          {/* Fields (read-only) */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            {/* Step name */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              <span
                style={{
                  fontSize: '8px',
                  fontWeight: '700',
                  letterSpacing: '0.14em',
                  color: 'hsl(var(--muted-foreground) / 0.7)',
                }}
              >
                NAME
              </span>
              <span
                style={{
                  fontSize: '11px',
                  color: 'hsl(var(--foreground))',
                  padding: '4px 0',
                }}
              >
                {activeStep.name || '—'}
              </span>
            </div>

            {/* Agent */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              <span
                style={{
                  fontSize: '8px',
                  fontWeight: '700',
                  letterSpacing: '0.14em',
                  color: 'hsl(var(--muted-foreground) / 0.7)',
                }}
              >
                AGENT
              </span>
              <span
                style={{
                  fontSize: '11px',
                  color: 'hsl(var(--foreground))',
                  padding: '4px 0',
                }}
              >
                {agents.find((a) => a.id === activeStep.agentId)
                  ? `${agents.find((a) => a.id === activeStep.agentId)!.emoji ?? '🤖'} ${agents.find((a) => a.id === activeStep.agentId)!.name}`
                  : activeStep.agentId || '—'}
              </span>
            </div>

            {/* Instructions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', flex: 1 }}>
              <span
                style={{
                  fontSize: '8px',
                  fontWeight: '700',
                  letterSpacing: '0.14em',
                  color: 'hsl(var(--muted-foreground) / 0.7)',
                }}
              >
                INSTRUCTIONS
              </span>
              <p
                style={{
                  flex: 1,
                  minHeight: '140px',
                  padding: '7px 8px',
                  borderRadius: '6px',
                  border: '1px solid hsl(var(--border) / 0.5)',
                  background: 'hsl(var(--background) / 0.4)',
                  color: 'hsl(var(--foreground))',
                  fontSize: '11px',
                  lineHeight: 1.6,
                  margin: 0,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {activeStep.instructions || <span style={{ opacity: 0.4 }}>No instructions</span>}
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Inner canvas component (ReactFlowProvider must wrap this) ─────────────────

function WorkflowCanvasInner({ workflow, agents }: CanvasProps) {
  const [activeId, setActiveId] = useState<string | null>(
    workflow.steps[0]?.id ?? null,
  );

  const handleSelect = useCallback(
    (id: string) => setActiveId((prev) => (prev === id ? null : id)),
    [],
  );

  // Build initial state once
  const initialNodes = useMemo(
    () => buildNodes(workflow.steps, agents, null, handleSelect),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const initialEdges = useMemo(
    () => buildEdges(workflow.steps),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Sync node data (step content, active state) without resetting dragged positions
  useEffect(() => {
    setNodes((prev) =>
      prev.map((node) => {
        const index = workflow.steps.findIndex((s) => s.id === node.id);
        const step = workflow.steps[index];
        if (!step) return node;
        return {
          ...node,
          data: {
            ...node.data,
            step,
            agent: agents.find((a) => a.id === step.agentId),
            index,
            isActive: step.id === activeId,
            accentColor: STEP_ACCENT_COLORS[index % STEP_ACCENT_COLORS.length],
            onSelect: handleSelect,
          },
        };
      }),
    );
  }, [workflow.steps, agents, activeId, handleSelect, setNodes]);

  // Handle step list structural changes
  useEffect(() => {
    setNodes((prev) => {
      const stepIdSet = new Set(workflow.steps.map((s) => s.id));
      const nodeIdSet = new Set(prev.map((n) => n.id));

      const kept = prev.filter((n) => stepIdSet.has(n.id));
      const maxX = kept.reduce((m, n) => Math.max(m, n.position.x), -300);

      const added = workflow.steps
        .filter((s) => !nodeIdSet.has(s.id))
        .map((step, i) => {
          const index = workflow.steps.findIndex((s2) => s2.id === step.id);
          return {
            id: step.id,
            type: 'workflowStep',
            position: { x: maxX + 300 + i * 300, y: 80 },
            data: {
              step,
              agent: agents.find((a) => a.id === step.agentId),
              index,
              isActive: step.id === activeId,
              accentColor: STEP_ACCENT_COLORS[index % STEP_ACCENT_COLORS.length],
              onSelect: handleSelect,
            },
            draggable: true,
          };
        });

      return [...kept, ...added];
    });

    setEdges(buildEdges(workflow.steps));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflow.steps.length]);

  // ── Derived values ──────────────────────────────────────────────────────────

  const activeStep = workflow.steps.find((s) => s.id === activeId) ?? null;
  const activeIndex = activeStep
    ? workflow.steps.findIndex((s) => s.id === activeId)
    : 0;
  const activeAccent = STEP_ACCENT_COLORS[activeIndex % STEP_ACCENT_COLORS.length];

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* ReactFlow canvas */}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onPaneClick={() => setActiveId(null)}
        fitView={workflow.steps.length > 0}
        fitViewOptions={{ padding: 0.35 }}
        minZoom={0.25}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        edgesReconnectable={false}
        edgesFocusable={false}
        className="!bg-transparent"
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={30}
          size={1.2}
          color="rgba(148,163,184,0.18)"
        />
        <MiniMap
          style={{
            background: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '8px',
          }}
          nodeColor={(node) => {
            const d = node.data as { accentColor?: string };
            return d.accentColor ?? 'hsl(185 80% 47%)';
          }}
          maskColor="rgba(0,0,0,0.3)"
        />

        {/* Empty state overlay */}
        {workflow.steps.length === 0 && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
              zIndex: 5,
            }}
          >
            <div style={{ fontSize: '36px', marginBottom: '14px', opacity: 0.4 }}>⚡</div>
            <p
              style={{
                fontSize: '14px',
                fontWeight: '600',
                color: 'hsl(var(--foreground))',
                margin: '0 0 6px',
              }}
            >
              No steps yet
            </p>
            <p style={{ fontSize: '12px', color: 'hsl(var(--muted-foreground))', margin: 0 }}>
              Agents configure workflow steps via CLI
            </p>
          </div>
        )}
      </ReactFlow>

      <WorkflowStepPanel
        activeStep={activeStep}
        activeIndex={activeIndex}
        activeAccent={activeAccent}
        agents={agents}
        onClose={() => setActiveId(null)}
      />
    </div>
  );
}

// ── Public export — wraps inner component with ReactFlowProvider ───────────────

export function WorkflowPipelineCanvas(props: CanvasProps) {
  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ReactFlowProvider>
        <WorkflowCanvasInner {...props} />
      </ReactFlowProvider>
    </div>
  );
}
