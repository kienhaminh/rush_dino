// agent-board-graph.ts — builds the ReactFlow nodes and edges for the /agents overview board.
// Each agent gets 3 satellite nodes: Skills, Tools, Knowledge.
import type { Node, Edge } from '@xyflow/react';
import type { AgentRecord } from './agent-types';

// Grid spacing — must fit 3 satellites (each ~96px) spread across ~260px per agent group
const COL_STEP = 460;
const ROW_STEP = 270;

// Satellite positions relative to agent top-left corner.
// Agent card is ~240×90px so center is at (+120, +45).
// Satellites are placed below the agent at y+150, spread across the agent width.
const SAT_Y = 150; // px below agent top-left
const SAT_LX = 20;  // skills: left
const SAT_CX = 120; // knowledge: center
const SAT_RX = 220; // tools: right

export interface BoardGraph {
  nodes: Node[];
  edges: Edge[];
}

export function buildBoardGraph(
  agents: AgentRecord[],
  onNavigate: (id: string) => void,
  onOpenPanel: (agentId: string, agentName: string, type: 'skills' | 'tools') => void,
  onKnowledge: () => void,
  /** Existing agent positions to preserve (from user dragging) */
  savedPositions: Record<string, { x: number; y: number }> = {},
): BoardGraph {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  agents.forEach((agent, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const ax = col * COL_STEP;
    const ay = row * ROW_STEP;
    const agentPos = savedPositions[agent.id] ?? { x: ax, y: ay };

    // Agent node
    nodes.push({
      id: agent.id,
      type: 'agentBoard',
      position: agentPos,
      data: { agent, onNavigate },
      draggable: true,
    });

    // Satellite helper — creates a satellite node relative to the agent position
    const sat = (
      idPrefix: string,
      label: string,
      icon: string,
      color: string,
      bgColor: string,
      onClick: () => void,
      xOffset: number,
    ): Node => ({
      id: `${idPrefix}-${agent.id}`,
      type: 'agentSatellite',
      position: { x: agentPos.x + xOffset, y: agentPos.y + SAT_Y },
      origin: [0.5, 0.5] as [number, number],
      data: { label, icon, color, bgColor, onClick },
      draggable: false,
    });

    nodes.push(sat('skills', 'Skills', '⚡', '#818cf8', 'rgba(79,70,229,0.1)', () => onOpenPanel(agent.id, agent.name, 'skills'), SAT_LX));
    nodes.push(sat('knowledge', 'Knowledge', '🧠', '#a78bfa', 'rgba(124,58,237,0.1)', onKnowledge, SAT_CX));
    nodes.push(sat('tools', 'Tools', '🔧', '#67e8f9', 'rgba(8,145,178,0.1)', () => onOpenPanel(agent.id, agent.name, 'tools'), SAT_RX));

    // Edges from agent bottom-source handle to each satellite target handle
    const edgeBase = { sourceHandle: 'sat-out', animated: false };
    edges.push(
      { id: `e-${agent.id}-skills`, source: agent.id, target: `skills-${agent.id}`, ...edgeBase, style: { stroke: '#4f46e5', strokeWidth: 1, opacity: 0.4 } },
      { id: `e-${agent.id}-knowledge`, source: agent.id, target: `knowledge-${agent.id}`, ...edgeBase, style: { stroke: '#7c3aed', strokeWidth: 1, opacity: 0.4 } },
      { id: `e-${agent.id}-tools`, source: agent.id, target: `tools-${agent.id}`, ...edgeBase, style: { stroke: '#0891b2', strokeWidth: 1, opacity: 0.4 } },
    );
  });

  return { nodes, edges };
}
