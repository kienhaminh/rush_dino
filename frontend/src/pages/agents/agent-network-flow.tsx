import { useCallback, useEffect, useMemo } from 'react';
import {
  ReactFlow,
  type Node,
  type Edge,
  Position,
  useNodesState,
  useEdgesState,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import type { AgentRecord, AgentRuntimeData } from './agent-types';
import { AgentSatelliteNode } from './nodes/agent-satellite-node';
import { AgentCoreNode } from './nodes/agent-core-node';
import { AgentGlowEdge } from './edges/agent-glow-edge';

export type SelectedNode = 'skills' | 'tools' | 'knowledge' | null;

// Defined outside component to prevent re-renders (xyflow requirement)
const nodeTypes = {
  satellite: AgentSatelliteNode,
  core: AgentCoreNode,
};

const edgeTypes = {
  glow: AgentGlowEdge,
};

const NODE_ID_MAP: Record<string, SelectedNode> = {
  skills: 'skills',
  tools: 'tools',
  knowledge: 'knowledge',
};

function buildNodes(agent: AgentRecord, runtime: AgentRuntimeData): Node[] {
  const skillCount = runtime.skills.filter((s) => s.enabled).length;
  const toolCount = runtime.toolSections.reduce((acc, s) => acc + s.tools.filter((t) => t.enabled).length, 0);
  const knowledgeCount = runtime.memory.length;

  return [
    {
      id: 'skills',
      type: 'satellite',
      position: { x: 50, y: 30 },
      data: {
        label: 'SKILLS',
        icon: '◑',
        subtitle: `${skillCount} Active Capacities`,
        accentColor: '#6366f1',
        handlePosition: Position.Bottom,
      },
    },
    {
      id: 'tools',
      type: 'satellite',
      position: { x: 550, y: 30 },
      data: {
        label: 'TOOLS',
        icon: '🔧',
        subtitle: `${toolCount} Integrated APIs`,
        accentColor: '#8b5cf6',
        handlePosition: Position.Bottom,
      },
    },
    {
      id: 'core',
      type: 'core',
      position: { x: 280, y: 200 },
      data: { emoji: agent.emoji || '🤖', name: agent.name },
      draggable: true,
    },
    {
      id: 'knowledge',
      type: 'satellite',
      position: { x: 280, y: 440 },
      data: {
        label: 'KNOWLEDGE',
        icon: '🗄',
        subtitle: `${knowledgeCount} Indexed Entries`,
        accentColor: '#14b8a6',
        handlePosition: Position.Top,
      },
    },
  ];
}

const EDGES: Edge[] = [
  {
    id: 'skills-core',
    source: 'skills',
    target: 'core',
    targetHandle: 'top-left',
    type: 'glow',
    data: { color: 'rgba(99,102,241,0.7)' },
  },
  {
    id: 'tools-core',
    source: 'tools',
    target: 'core',
    targetHandle: 'top-right',
    type: 'glow',
    data: { color: 'rgba(139,92,246,0.7)' },
  },
  {
    id: 'knowledge-core',
    source: 'knowledge',
    target: 'core',
    targetHandle: 'bottom',
    type: 'glow',
    data: { color: 'rgba(20,184,166,0.7)' },
  },
];

interface AgentNetworkFlowProps {
  agent: AgentRecord;
  runtime: AgentRuntimeData;
  onNodeSelect: (node: SelectedNode) => void;
}

export function AgentNetworkFlow({ agent, runtime, onNodeSelect }: AgentNetworkFlowProps) {
  const initialNodes = useMemo(() => buildNodes(agent, runtime), [agent, runtime]);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(EDGES);

  // Sync node data (counts) when runtime loads or agent changes,
  // while preserving positions the user may have dragged to.
  useEffect(() => {
    const updated = buildNodes(agent, runtime);
    setNodes((prev) =>
      prev.map((node) => {
        const fresh = updated.find((n) => n.id === node.id);
        return fresh ? { ...node, data: fresh.data } : node;
      }),
    );
  }, [agent, runtime, setNodes]);

  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      const mapped = NODE_ID_MAP[node.id] ?? null;
      onNodeSelect(mapped);
    },
    [onNodeSelect],
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeClick={handleNodeClick}
      onPaneClick={() => onNodeSelect(null)}
      fitView
      fitViewOptions={{ padding: 0.3 }}
      minZoom={0.5}
      maxZoom={2}
      proOptions={{ hideAttribution: true }}
      className="!bg-transparent"
    />
  );
}
