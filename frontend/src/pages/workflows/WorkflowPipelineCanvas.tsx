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
import { PlusIcon, XIcon, Trash2Icon } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import type { AgentRecord } from '@/pages/agents/agent-types';
import type { WorkflowDraft, WorkflowStepDraft } from './WorkflowEditorPanel';
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

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

// ── Node / edge builders ──────────────────────────────────────────────────────

function buildNodes(
  steps: WorkflowStepDraft[],
  agents: AgentRecord[],
  activeKey: string | null,
  onSelect: (key: string) => void,
): Node[] {
  return steps.map((step, index) => ({
    id: step.key,
    type: 'workflowStep',
    position: { x: index * 300, y: 80 },
    data: {
      step,
      agent: agents.find((a) => a.id === step.agentId),
      index,
      isActive: step.key === activeKey,
      accentColor: STEP_ACCENT_COLORS[index % STEP_ACCENT_COLORS.length],
      onSelect,
    },
    draggable: true,
  }));
}

function buildEdges(steps: WorkflowStepDraft[]): Edge[] {
  return steps.slice(0, -1).map((step, index) => ({
    id: `wf-e-${step.key}→${steps[index + 1].key}`,
    source: step.key,
    target: steps[index + 1].key,
    type: 'workflowFlow',
    data: { accentColor: STEP_ACCENT_COLORS[index % STEP_ACCENT_COLORS.length] },
  }));
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface CanvasProps {
  draft: WorkflowDraft;
  agents: AgentRecord[];
  onChange: (next: WorkflowDraft) => void;
}

// ── Inner canvas component (ReactFlowProvider must wrap this) ─────────────────

function WorkflowCanvasInner({ draft, agents, onChange }: CanvasProps) {
  const [activeKey, setActiveKey] = useState<string | null>(
    draft.steps[0]?.key ?? null,
  );

  const handleSelect = useCallback(
    (key: string) => setActiveKey((prev) => (prev === key ? null : key)),
    [],
  );

  // Build initial state once
  const initialNodes = useMemo(
    () => buildNodes(draft.steps, agents, null, handleSelect),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const initialEdges = useMemo(
    () => buildEdges(draft.steps),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Sync node data (step content, active state) without resetting dragged positions
  useEffect(() => {
    setNodes((prev) =>
      prev.map((node) => {
        const index = draft.steps.findIndex((s) => s.key === node.id);
        const step = draft.steps[index];
        if (!step) return node;
        return {
          ...node,
          data: {
            ...node.data,
            step,
            agent: agents.find((a) => a.id === step.agentId),
            index,
            isActive: step.key === activeKey,
            accentColor: STEP_ACCENT_COLORS[index % STEP_ACCENT_COLORS.length],
            onSelect: handleSelect,
          },
        };
      }),
    );
  }, [draft.steps, agents, activeKey, handleSelect, setNodes]);

  // Handle step list structural changes (additions / removals)
  useEffect(() => {
    setNodes((prev) => {
      const stepKeySet = new Set(draft.steps.map((s) => s.key));
      const nodeKeySet = new Set(prev.map((n) => n.id));

      const kept = prev.filter((n) => stepKeySet.has(n.id));
      const maxX = kept.reduce((m, n) => Math.max(m, n.position.x), -300);

      const added = draft.steps
        .filter((s) => !nodeKeySet.has(s.key))
        .map((step, i) => {
          const index = draft.steps.findIndex((s2) => s2.key === step.key);
          return {
            id: step.key,
            type: 'workflowStep',
            position: { x: maxX + 300 + i * 300, y: 80 },
            data: {
              step,
              agent: agents.find((a) => a.id === step.agentId),
              index,
              isActive: step.key === activeKey,
              accentColor: STEP_ACCENT_COLORS[index % STEP_ACCENT_COLORS.length],
              onSelect: handleSelect,
            },
            draggable: true,
          };
        });

      return [...kept, ...added];
    });

    setEdges(buildEdges(draft.steps));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.steps.length]);

  // ── Step actions ────────────────────────────────────────────────────────────

  const updateActiveStep = useCallback(
    (patch: Partial<WorkflowStepDraft>) => {
      if (!activeKey) return;
      onChange({
        ...draft,
        steps: draft.steps.map((s) => (s.key === activeKey ? { ...s, ...patch } : s)),
      });
    },
    [activeKey, draft, onChange],
  );

  const removeActiveStep = useCallback(() => {
    if (!activeKey) return;
    const next = draft.steps.filter((s) => s.key !== activeKey);
    onChange({ ...draft, steps: next });
    setActiveKey(next[0]?.key ?? null);
  }, [activeKey, draft, onChange]);

  const addStep = useCallback(() => {
    const key = uid();
    onChange({
      ...draft,
      steps: [
        ...draft.steps,
        {
          key,
          name: `Step ${draft.steps.length + 1}`,
          instructions: '',
          agentId: agents[0]?.id ?? '',
        },
      ],
    });
    setActiveKey(key);
  }, [draft, agents, onChange]);

  // ── Derived values ──────────────────────────────────────────────────────────

  const activeStep = draft.steps.find((s) => s.key === activeKey) ?? null;
  const activeIndex = activeStep
    ? draft.steps.findIndex((s) => s.key === activeKey)
    : 0;
  const activeAccent = STEP_ACCENT_COLORS[activeIndex % STEP_ACCENT_COLORS.length];

  const panelOpen = !!activeStep;

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
        onPaneClick={() => setActiveKey(null)}
        fitView={draft.steps.length > 0}
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
        {draft.steps.length === 0 && (
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
              Click <strong>Add Step</strong> to build your pipeline
            </p>
          </div>
        )}
      </ReactFlow>

      {/* Floating "Add Step" pill */}
      <button
        onClick={addStep}
        style={{
          position: 'absolute',
          bottom: '20px',
          left: panelOpen ? 'calc(50% - 140px)' : '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          alignItems: 'center',
          gap: '7px',
          padding: '9px 22px',
          borderRadius: '999px',
          background: 'hsl(var(--primary))',
          color: 'hsl(var(--primary-foreground))',
          border: 'none',
          cursor: 'pointer',
          fontSize: '12px',
          fontWeight: '600',
          letterSpacing: '0.04em',
          fontFamily: 'inherit',
          boxShadow: '0 4px 20px hsl(var(--primary) / 0.35)',
          zIndex: 10,
          transition: 'left 0.25s cubic-bezier(0.22,1,0.36,1)',
        }}
      >
        <PlusIcon style={{ width: '14px', height: '14px' }} />
        Add Step
      </button>

      {/* Step editor side panel */}
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
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
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

              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <button
                  onClick={removeActiveStep}
                  title="Remove step"
                  style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '6px',
                    border: '1px solid hsl(var(--destructive) / 0.3)',
                    color: 'hsl(var(--destructive) / 0.7)',
                    background: 'transparent',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Trash2Icon style={{ width: '11px', height: '11px' }} />
                </button>
                <button
                  onClick={() => setActiveKey(null)}
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
            </div>

            {/* Fields */}
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
              <label style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
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
                <input
                  value={activeStep.name}
                  onChange={(e) => updateActiveStep({ name: e.target.value })}
                  style={{
                    height: '28px',
                    padding: '0 8px',
                    borderRadius: '6px',
                    border: '1px solid hsl(var(--border))',
                    background: 'hsl(var(--background) / 0.6)',
                    color: 'hsl(var(--foreground))',
                    fontSize: '11px',
                    fontFamily: 'inherit',
                    outline: 'none',
                  }}
                />
              </label>

              {/* Agent */}
              <label style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
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
                <Select
                  value={activeStep.agentId}
                  onValueChange={(val) => updateActiveStep({ agentId: val })}
                >
                  <SelectTrigger className="h-7 text-xs border-border/70 bg-background/60">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {agents.map((agent) => (
                      <SelectItem key={agent.id} value={agent.id}>
                        {agent.emoji} {agent.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>

              {/* Instructions */}
              <label style={{ display: 'flex', flexDirection: 'column', gap: '3px', flex: 1 }}>
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
                <textarea
                  value={activeStep.instructions}
                  onChange={(e) => updateActiveStep({ instructions: e.target.value })}
                  placeholder="What should this agent do?"
                  style={{
                    flex: 1,
                    minHeight: '140px',
                    padding: '7px 8px',
                    borderRadius: '6px',
                    border: '1px solid hsl(var(--border))',
                    background: 'hsl(var(--background) / 0.6)',
                    color: 'hsl(var(--foreground))',
                    fontSize: '11px',
                    fontFamily: 'inherit',
                    resize: 'none',
                    outline: 'none',
                    lineHeight: 1.6,
                  }}
                />
              </label>
            </div>
          </>
        )}
      </div>
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
