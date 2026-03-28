// AgentOrbitalCanvas — ReactFlow canvas for the /agents/:id focused view.
// Shows the agent core node at center, with individual skill nodes and tool nodes
// arranged radially on an ellipse around it. Edges use the existing glow edge type.
//
// Skills: indigo color scheme — core=solid, custom=dashed, all removable
// Tools: cyan color scheme — core=solid, discovered=dashed, discovered not removable
import { useCallback, useEffect, useMemo, useRef } from 'react';
import type React from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  type Node,
  type Edge,
  useNodesState,
  useEdgesState,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { PlusIcon } from 'lucide-react';

import type { AgentRecord, AgentRuntimeData, AgentSkillRecord, AgentToolRecord } from './agent-types';
import { AgentCoreNode } from './nodes/agent-core-node';
import { SkillNode } from './nodes/skill-node';
import { ToolNode } from './nodes/tool-node';
import { AgentGlowEdge } from './edges/agent-glow-edge';
import { useCanvasAnimation } from './canvas/use-canvas-animation';
import { createGridRenderer } from './canvas/canvas-grid-renderer';

// ── Node / edge type maps — defined outside component to prevent re-renders ───
const nodeTypes = {
  core: AgentCoreNode,
  skill: SkillNode,
  tool: ToolNode,
};

const edgeTypes = {
  glow: AgentGlowEdge,
};

// ── Radial position helpers ───────────────────────────────────────────────────

/** Place n nodes evenly on an ellipse centered at (cx, cy). Returns (x, y) pairs. */
function radialPositions(
  count: number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  angleOffsetDeg = 0,
): Array<{ x: number; y: number }> {
  if (count === 0) return [];
  return Array.from({ length: count }, (_, i) => {
    const angle = ((2 * Math.PI * i) / count) + (angleOffsetDeg * Math.PI) / 180;
    return {
      x: cx + rx * Math.cos(angle),
      y: cy + ry * Math.sin(angle),
    };
  });
}

// Canvas dimensions used for layout math
const CANVAS_CENTER_X = 440;
const CANVAS_CENTER_Y = 340;
const ELLIPSE_RX = 340;
const ELLIPSE_RY = 240;

// ── Build nodes from runtime data ─────────────────────────────────────────────

interface BuildNodesOptions {
  agent: AgentRecord;
  skills: AgentSkillRecord[];
  tools: AgentToolRecord[];
  // Refs are passed directly so callbacks are always current without
  // creating new closure instances on every rebuild (avoids defeating ReactFlow diffing)
  removeSkillRef: React.MutableRefObject<(name: string) => void>;
  removeToolRef: React.MutableRefObject<(id: string) => void>;
}

function buildNodes({
  agent,
  skills,
  tools,
  removeSkillRef,
  removeToolRef,
}: BuildNodesOptions): Node[] {
  const totalSatellites = skills.length + tools.length;

  // Place skills first, then tools, so skill nodes cluster together by angle
  const positions = radialPositions(
    totalSatellites,
    CANVAS_CENTER_X,
    CANVAS_CENTER_Y,
    ELLIPSE_RX,
    ELLIPSE_RY,
    // Offset slightly so first node appears at top-left rather than exact right
    -60,
  );

  const skillNodes: Node[] = skills.map((skill, i) => ({
    id: `skill-${skill.name}`,
    type: 'skill',
    position: positions[i] ?? { x: 0, y: 0 },
    // Center the node over its position point
    style: { transform: 'translate(-50%, -50%)' },
    data: {
      name: skill.name,
      emoji: skill.emoji ?? '🔷',
      // isAutoAdded: true when the skill was added from the workspace (group === 'workspace')
      isAutoAdded: skill.group === 'workspace',
      // Stable ref-forwarded callback — same object identity across rebuilds
      onRemove: () => removeSkillRef.current(skill.name),
    },
    draggable: true,
  }));

  const toolNodes: Node[] = tools.map((tool, i) => ({
    id: `tool-${tool.id}`,
    type: 'tool',
    position: positions[skills.length + i] ?? { x: 0, y: 0 },
    style: { transform: 'translate(-50%, -50%)' },
    data: {
      name: tool.label,
      emoji: tool.source === 'plugin' ? '🔌' : '🔧',
      isDiscovered: tool.source === 'plugin',
      // Stable ref-forwarded callback; undefined for plugin-discovered tools (not removable)
      onRemove: tool.source === 'plugin' ? undefined : () => removeToolRef.current(tool.id),
    },
    draggable: true,
  }));

  const coreNode: Node = {
    id: 'core',
    type: 'core',
    position: { x: CANVAS_CENTER_X, y: CANVAS_CENTER_Y },
    style: { transform: 'translate(-50%, -50%)' },
    data: { emoji: agent.emoji || '🤖', name: agent.name },
    draggable: false,
  };

  return [coreNode, ...skillNodes, ...toolNodes];
}

// ── Build edges — each satellite to the core ──────────────────────────────────

function buildEdges(skills: AgentSkillRecord[], tools: AgentToolRecord[]): Edge[] {
  const skillEdges: Edge[] = skills.map((skill) => ({
    id: `edge-skill-${skill.name}`,
    source: `skill-${skill.name}`,
    target: 'core',
    type: 'glow',
    data: { color: 'rgba(99,102,241,0.65)' },
  }));

  const toolEdges: Edge[] = tools.map((tool) => ({
    id: `edge-tool-${tool.id}`,
    source: `tool-${tool.id}`,
    target: 'core',
    type: 'glow',
    data: { color: 'rgba(8,145,178,0.65)' },
  }));

  return [...skillEdges, ...toolEdges];
}

// ── Ambient dot-grid background ───────────────────────────────────────────────

function AmbientBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderers = useMemo(() => [createGridRenderer({ baseAlpha: 0.12 })], []);
  useCanvasAnimation({ canvasRef, renderers });
  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      aria-hidden="true"
    />
  );
}

// ── Inner canvas component (needs ReactFlowProvider ancestor) ─────────────────

interface InnerCanvasProps {
  agent: AgentRecord;
  runtimeData: AgentRuntimeData;
  onOpenPalette: () => void;
}

function AgentOrbitalCanvasInner({ agent, runtimeData, onOpenPalette }: InnerCanvasProps) {
  // Flatten enabled skills and all tools from sections
  const enabledSkills = useMemo(
    () => runtimeData.skills.filter((s) => s.enabled),
    [runtimeData.skills],
  );

  const allTools = useMemo(
    () => runtimeData.toolSections.flatMap((section) => section.tools).filter((t) => t.enabled),
    [runtimeData.toolSections],
  );

  // Explicit generics avoid the 'never[]' inference issue with empty initial arrays
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // Track which skills/tools are locally visible (as mutable copies).
  // Using refs so we can mutate them synchronously inside removal callbacks
  // without triggering extra renders, and to break the circular dependency
  // between rebuildCanvas ↔ handleRemoveSkill/Tool.
  const skillsRef = useRef<AgentSkillRecord[]>([]);
  const toolsRef = useRef<AgentToolRecord[]>([]);

  // Forward ref for the remove handlers — avoids hoisting / circular deps.
  // The ref is always current because it's assigned before any async work.
  const removeSkillRef = useRef<(name: string) => void>(() => undefined);
  const removeToolRef = useRef<(id: string) => void>(() => undefined);

  // Core layout builder — reads from refs, passes remove-handler refs directly.
  // Stable across renders as long as the agent identity doesn't change.
  const rebuildCanvas = useCallback(() => {
    const skills = skillsRef.current;
    const tools = toolsRef.current;

    const newNodes = buildNodes({
      agent,
      skills,
      tools,
      removeSkillRef,
      removeToolRef,
    });

    const newEdges = buildEdges(skills, tools);

    setNodes(newNodes);
    setEdges(newEdges);
  }, [agent, setNodes, setEdges]);

  // Removal handlers — mutate refs then rebuild
  removeSkillRef.current = useCallback(
    (name: string) => {
      skillsRef.current = skillsRef.current.filter((s) => s.name !== name);
      rebuildCanvas();
    },
    [rebuildCanvas],
  );

  removeToolRef.current = useCallback(
    (id: string) => {
      toolsRef.current = toolsRef.current.filter((t) => t.id !== id);
      rebuildCanvas();
    },
    [rebuildCanvas],
  );

  // Sync refs and rebuild canvas when runtime data changes (agent switch / refresh).
  // Use full memoized arrays (not .length) so the effect re-runs when content
  // changes even if the count stays the same.
  useEffect(() => {
    skillsRef.current = [...enabledSkills];
    toolsRef.current = [...allTools];
    rebuildCanvas();
  }, [agent.id, enabledSkills, allTools, rebuildCanvas]);

  return (
    <div className="absolute inset-0 bg-background overflow-hidden">
      {/* Ambient animated dot grid */}
      <AmbientBackground />

      {/* ReactFlow layer */}
      <div className="absolute inset-0" style={{ zIndex: 1 }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          fitView
          fitViewOptions={{ padding: 0.25 }}
          minZoom={0.3}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
          className="!bg-transparent"
          // Disable default selection box — keep drag-to-pan only
          selectionOnDrag={false}
          panOnDrag
          zoomOnScroll
        />
      </div>

      {/* + Add skills/tools button — fixed bottom-right, above ReactFlow */}
      <button
        onClick={onOpenPalette}
        title="Add skills or tools"
        className="absolute bottom-6 right-6 flex items-center justify-center w-10 h-10 rounded-full shadow-lg transition-all duration-150 cursor-pointer"
        style={{
          zIndex: 20,
          background: 'rgba(79,70,229,0.85)',
          border: '1px solid rgba(165,180,252,0.4)',
          boxShadow: '0 0 20px rgba(79,70,229,0.45)',
          color: 'white',
        }}
      >
        <PlusIcon className="w-5 h-5" />
      </button>
    </div>
  );
}

// ── Public export ─────────────────────────────────────────────────────────────

export interface AgentOrbitalCanvasProps {
  agent: AgentRecord;
  runtimeData: AgentRuntimeData;
  onOpenPalette: () => void;
}

/** Wraps the inner canvas with ReactFlowProvider (required by @xyflow/react). */
export function AgentOrbitalCanvas(props: AgentOrbitalCanvasProps) {
  return (
    <ReactFlowProvider>
      <AgentOrbitalCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
