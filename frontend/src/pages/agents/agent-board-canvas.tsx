import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ReactFlow,
  ReactFlowProvider,
  MiniMap,
  type Node,
  type Edge,
  useNodesState,
  useEdgesState,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { ZoomInIcon, ZoomOutIcon, MaximizeIcon, RefreshCwIcon, SearchIcon } from 'lucide-react';

import type { AgentRecord } from './agent-types';
import { AgentBoardNode } from './nodes/agent-board-node';
import { AgentSatelliteNode } from './nodes/agent-satellite-node';
import { buildBoardGraph } from './agent-board-graph';
import { AgentBoardPanel } from './agent-board-panel';
import { useCanvasAnimation } from './canvas/use-canvas-animation';
import { createGridRenderer } from './canvas/canvas-grid-renderer';
import { createParticleRenderer } from './canvas/canvas-particle-renderer';

// ── nodeTypes defined outside component to prevent ReactFlow re-renders ────────
const nodeTypes = {
  agentBoard: AgentBoardNode,
  agentSatellite: AgentSatelliteNode,
};

// ── Ambient canvas background ─────────────────────────────────────────────────
function AmbientCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderers = useMemo(
    () => [createGridRenderer(), createParticleRenderer()],
    [],
  );
  useCanvasAnimation({ canvasRef, renderers });
  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />;
}

// ── Shared toolbar button ─────────────────────────────────────────────────────
interface ToolbarButtonProps {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}

function ToolbarButton({ onClick, title, children }: ToolbarButtonProps) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={[
        'flex items-center justify-center',
        'w-7 h-7 rounded-[7px]',
        'border-none bg-transparent',
        'text-muted-foreground cursor-pointer',
        'transition-colors duration-150',
        'hover:bg-accent hover:text-foreground',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

// ── Floating toolbar ──────────────────────────────────────────────────────────
interface ToolbarProps {
  loading: boolean;
  onRefresh: () => void;
  onSearch: (term: string) => void;
}

function CanvasToolbar({ loading, onRefresh, onSearch }: ToolbarProps) {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const [search, setSearch] = useState('');

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    onSearch(e.target.value);
  };

  const glassStyle: React.CSSProperties = {
    background: 'hsl(var(--card))',
    border: '1px solid hsl(var(--border))',
    backdropFilter: 'blur(8px)',
    borderRadius: '10px',
  };

  return (
    <div
      className="absolute flex items-center gap-2 p-2"
      style={{ top: '16px', left: '16px', zIndex: 10, ...glassStyle }}
    >
      <div className="relative flex items-center">
        <SearchIcon className="absolute left-2 w-3 h-3 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search agents…"
          value={search}
          onChange={handleSearch}
          className="pl-7 pr-3 py-1 text-[11px] rounded-lg focus:outline-none"
          style={{
            width: '180px',
            background: 'hsl(var(--input))',
            border: '1px solid hsl(var(--border))',
            color: 'hsl(var(--foreground))',
            fontFamily: 'inherit',
          }}
        />
      </div>
      <div style={{ width: '1px', height: '20px', background: 'hsl(var(--border))' }} />
      <ToolbarButton onClick={() => zoomIn()} title="Zoom in"><ZoomInIcon className="w-3.5 h-3.5" /></ToolbarButton>
      <ToolbarButton onClick={() => zoomOut()} title="Zoom out"><ZoomOutIcon className="w-3.5 h-3.5" /></ToolbarButton>
      <ToolbarButton onClick={() => fitView({ padding: 0.25 })} title="Fit view"><MaximizeIcon className="w-3.5 h-3.5" /></ToolbarButton>
      <div style={{ width: '1px', height: '20px', background: 'hsl(var(--border))' }} />
      <ToolbarButton onClick={onRefresh} title="Refresh">
        <RefreshCwIcon className="w-3.5 h-3.5" style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
      </ToolbarButton>
    </div>
  );
}

// ── Panel state ───────────────────────────────────────────────────────────────
interface PanelState {
  agentId: string;
  agentName: string;
  type: 'skills' | 'tools';
}

// ── Inner canvas ──────────────────────────────────────────────────────────────
interface InnerProps {
  agents: AgentRecord[];
  loading: boolean;
  onRefresh: () => void;
}

function AgentBoardCanvasInner({ agents, loading, onRefresh }: InnerProps) {
  const navigate = useNavigate();
  const [panel, setPanel] = useState<PanelState | null>(null);

  const handleNavigate = useCallback((id: string) => navigate(`/agents/${id}`), [navigate]);
  const handleKnowledge = useCallback(() => navigate('/skills'), [navigate]);
  const handleOpenPanel = useCallback(
    (agentId: string, agentName: string, type: 'skills' | 'tools') => {
      setPanel({ agentId, agentName, type });
    },
    [],
  );
  const closePanel = useCallback(() => setPanel(null), []);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // Rebuild all nodes+edges when agents change, preserving dragged agent positions
  useEffect(() => {
    setNodes((prev) => {
      const savedPos: Record<string, { x: number; y: number }> = {};
      prev.filter((n) => n.type === 'agentBoard').forEach((n) => {
        savedPos[n.id] = n.position;
      });
      const graph = buildBoardGraph(agents, handleNavigate, handleOpenPanel, handleKnowledge, savedPos);
      setEdges(graph.edges);
      return graph.nodes;
    });
  }, [agents, handleNavigate, handleOpenPanel, handleKnowledge, setEdges]);

  // Search: hide/show agent nodes and their satellites together
  const handleSearch = useCallback(
    (term: string) => {
      const lower = term.trim().toLowerCase();
      setNodes((prev) => {
        const hiddenAgents = new Set<string>();
        prev.forEach((n) => {
          if (n.type !== 'agentBoard') return;
          const agent = (n.data as { agent: AgentRecord }).agent;
          if (lower && !agent.name.toLowerCase().includes(lower)) hiddenAgents.add(n.id);
        });
        return prev.map((n) => {
          if (n.type === 'agentBoard') {
            return { ...n, hidden: hiddenAgents.has(n.id) };
          }
          const match = n.id.match(/^(?:skills|tools|knowledge)-(.+)$/);
          return match ? { ...n, hidden: hiddenAgents.has(match[1]) } : n;
        });
      });
    },
    [setNodes],
  );

  return (
    <div className="absolute inset-0 bg-background">
      <AmbientCanvas />

      <div className="absolute inset-0" style={{ zIndex: 1 }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          minZoom={0.3}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
          className="!bg-transparent"
        >
          <MiniMap
            style={{
              background: 'rgba(8,12,20,0.85)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '8px',
            }}
            nodeColor="rgba(99,102,241,0.6)"
            maskColor="rgba(0,0,0,0.4)"
          />
        </ReactFlow>
      </div>

      <div style={{ zIndex: 10, position: 'relative', pointerEvents: 'none' }}>
        <div style={{ pointerEvents: 'auto' }}>
          <CanvasToolbar loading={loading} onRefresh={onRefresh} onSearch={handleSearch} />
        </div>
      </div>

      {/* Right slide-in panel for skills/tools */}
      {panel && (
        <AgentBoardPanel
          agentId={panel.agentId}
          agentName={panel.agentName}
          type={panel.type}
          onClose={closePanel}
        />
      )}

      {loading && agents.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/70" style={{ zIndex: 5 }}>
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 rounded-full animate-spin" style={{ border: '2px solid rgba(99,102,241,0.2)', borderTopColor: 'rgba(99,102,241,0.8)' }} />
            <span className="text-[10px] tracking-[0.2em] text-muted-foreground">INITIALIZING AGENTS…</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Public export ─────────────────────────────────────────────────────────────
export interface AgentBoardCanvasProps {
  agents: AgentRecord[];
  loading: boolean;
  onRefresh: () => void;
}

export function AgentBoardCanvas(props: AgentBoardCanvasProps) {
  return (
    <ReactFlowProvider>
      <AgentBoardCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
